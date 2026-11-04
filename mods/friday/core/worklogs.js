// Worklogs Friday writes to Jira: the log-time form (R07), the `started` text, the record kept in
// worklogs.json, and (later in this file) the planning of a ledger day (R09, D27). Pure: nothing
// here touches the network or disk, and nothing here sees a token.
import { parseDuration, MAX_SECONDS } from "./durations.js";
import { isDate } from "./ledger.js";
import { dayStart, localDay, clock } from "./meetings.js";

const pad = (n) => String(n).padStart(2, "0");

/** `1h 30m`, `45m`, `2h`, `30s` from seconds. */
export function durationText(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [h && `${h}h`, m && `${m}m`, s && !h && `${s}s`].filter(Boolean);
  return parts.join(" ") || "0m";
}

/** Jira's `started`: `yyyy-MM-ddTHH:mm:ss.SSS±hhmm` for a moment, in the zone `offsetMin` east of UTC. */
export function startedText(ms, offsetMin) {
  const t = new Date(ms + offsetMin * 60_000);
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}.${String(t.getUTCMilliseconds()).padStart(3, "0")}${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** Worklogs on a day other than today start here (local); today's end now. */
export const DEFAULT_START = "09:00";

/**
 * R07 and the form of G24: a duration (required, above zero, at most 24 h), a date (default today,
 * not in the future) and an optional comment. `key` is the issue; `now` ms; `offsetMin` the zone.
 * Today's worklog ends now (it starts `duration` ago, not before 00:00); another day's starts at 09:00.
 * { ok: true, seconds, day, started, comment, label } or { ok: false, error }.
 */
export function validateLogTime({ duration, date, comment }, { key, now, offsetMin }) {
  const today = localDay(now, offsetMin);
  const seconds = parseDuration(String(duration ?? ""));
  if (seconds === null) return { ok: false, error: "Enter a duration such as 30m or 1h 30m." };
  if (seconds <= 0) return { ok: false, error: "The duration must be above zero." };
  if (seconds > MAX_SECONDS) return { ok: false, error: "The duration is at most 24 h." };
  const secs = Math.round(seconds);
  const typed = String(date ?? "").trim();
  const day = typed === "" ? today : typed;
  if (!isDate(day)) return { ok: false, error: "The date must be written YYYY-MM-DD." };
  if (day > today) return { ok: false, error: "The date cannot be in the future." };
  const midnight = dayStart(day, offsetMin);
  const startMs = day === today ? Math.max(midnight, now - secs * 1000) : midnight + (Number(DEFAULT_START.slice(0, 2)) * 60 + Number(DEFAULT_START.slice(3))) * 60_000;
  const endMs = startMs + secs * 1000;
  return {
    ok: true,
    seconds: secs,
    day,
    started: startedText(startMs, offsetMin),
    startMs,
    comment: String(comment ?? "").trim(),
    label: `Log ${durationText(secs)} on ${key}, ${day} ${clock(startMs, offsetMin)}–${clock(endMs, offsetMin)}`,
  };
}

/** One entry of worklogs.json (the data model): what Friday wrote, input to R09. */
export function worklogRecord({ jiraId, key, day, started, seconds, comment, origin, ledgerPr = null, now }) {
  return { jira_id: String(jiraId), issue_key: key, day, started, seconds, comment: comment ?? "", origin, ledger_pr: ledgerPr, created_at: now };
}

/** The `mutate` for updateJson on worklogs.json: adds a record once per `jira_id`. */
export function addRecord(raw, record) {
  const next = { ...raw, version: 1, worklogs: [...(Array.isArray(raw?.worklogs) ? raw.worklogs : [])] };
  if (!next.worklogs.some((w) => w?.jira_id === record.jira_id)) next.worklogs.push(record);
  return next;
}

/** The records of a parsed worklogs.json (any shape problem reads as none). */
export function recordsOf(parsed) {
  const list = parsed && parsed.state === "ok" ? parsed.value.worklogs : null;
  return Array.isArray(list) ? list.filter((w) => w && typeof w.jira_id === "string") : [];
}

/** Shown when a POST failed without a definite answer: it may be in Jira, so Friday does not retry it. */
export const MAYBE_SAVED = "Jira may have saved this worklog. Check the issue before logging again.";

/**
 * The log-time dialog's Log button (R07, G24): validates, POSTs once and records the worklog in
 * worklogs.json. `post(key, { started, seconds, comment })` is core/jira.js postWorklog with its
 * deps bound; `saveRecord(record)` writes worklogs.json. Never retries a POST. Every message is
 * fixed text or comes from core/jira.js. Resolves true when Jira has the worklog.
 */
export async function submitLogTime({ form, key, now, offsetMin, post, saveRecord, say }) {
  const v = validateLogTime(form, { key, now, offsetMin });
  if (!v.ok) return say(v.error, "error"), false;
  let r;
  try {
    r = await post(key, { started: v.started, seconds: v.seconds, comment: v.comment });
  } catch {
    r = { ok: false, unknown: true, message: "jira: request failed" };
  }
  if (!r.ok) return say(r.unknown ? MAYBE_SAVED : r.message, "error"), false;
  try {
    await saveRecord(worklogRecord({ jiraId: r.id, key, day: v.day, started: v.started, seconds: v.seconds, comment: v.comment, origin: "favorite", now }));
  } catch {
    return say("Logged in Jira, but worklogs.json could not be written.", "stale"), true;
  }
  say(`Logged ${durationText(v.seconds)} on ${key}.`, "ok");
  return true;
}
