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

/** `UTC+01:00`: the zone a start time is written in, shown so a wrong hour cannot hide. */
export function offsetText(offsetMin) {
  const abs = Math.abs(offsetMin);
  return `UTC${offsetMin < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
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
  if (secs < 60) return { ok: false, error: "The duration is at least 1 minute." }; // Jira keeps whole minutes
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
    // ponytail: one offset for every day, the one in force now (herdr-app's Date has no other, spike
    // note q5), so a day across a DST change can be an hour off. The offset is shown so the owner
    // sees it; a per-day offset needs a time-zone table, add when the hour is ever wrong in practice.
    label: `Log ${durationText(secs)} on ${key}, ${day} ${clock(startMs, offsetMin)}–${clock(endMs, offsetMin)} (${offsetText(offsetMin)})`,
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
 * fixed text or comes from core/jira.js. Resolves true when Jira has the worklog, "unknown" when it may have (the dialog must not offer another Log), else false.
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
  if (!r.ok) return say(r.unknown ? MAYBE_SAVED : r.message, "error"), r.unknown ? "unknown" : false;
  try {
    await saveRecord(worklogRecord({ jiraId: r.id, key, day: v.day, started: v.started, seconds: v.seconds, comment: v.comment, origin: "favorite", now }));
  } catch {
    return say("Logged in Jira, but worklogs.json could not be written.", "stale"), true;
  }
  say(`Logged ${durationText(v.seconds)} on ${key}.`, "ok");
  return true;
}

// ---- Logging a ledger day (D27, R09) ----

/** The same moment: `started` texts compared as instants, whatever their offset notation (`+0100` or `+01:00`). */
export function sameInstant(a, b) {
  const ms = (t) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/.exec(String(t));
    if (!m) return NaN;
    const off = m[8] === "Z" ? 0 : (m[8][0] === "-" ? -1 : 1) * (Number(m[8].slice(1, 3)) * 60 + Number(m[8].slice(-2)));
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], Number((m[7] ?? "0").padEnd(3, "0").slice(0, 3))) - off * 60_000;
  };
  return ms(a) === ms(b) && !Number.isNaN(ms(a));
}

/** The comment of a ledger worklog (D27). */
export const reviewComment = (pr) => `Code review PR !${pr}`;

const OUTSIDE = "logged outside Friday";
const BY_FRIDAY = "logged by Friday";

/**
 * What R09 says about one ledger row, from Friday's records and the owner's worklogs on that task
 * and day. `remote` is the list from core/jira.js listWorklogs for the row's task (null when it
 * could not be read). A worklog Friday has a record of (by Jira id) is not "outside"; any other of
 * the owner's worklogs on that task and day is, and then the row is skipped unless selected on purpose.
 *   no_key, no_time    cannot be logged
 *   friday             a record says Friday logged this PR's row that day
 *   outside            the owner has a worklog on the task that day that Friday did not write
 *   check_failed       the owner's worklogs could not be read; the row is checked again before writing
 *   ready              not logged anywhere
 */
export function rowStatus(row, { day, records, remote }) {
  if (!row.task) return "no_key";
  if (!(row.minutes > 0)) return "no_time";
  if (records.some((w) => w.origin === "ledger" && w.day === day && w.issue_key === row.task.key && w.ledger_pr === row.pr)) return "friday";
  if (remote === null || remote === undefined) return "check_failed";
  const mine = new Set(records.map((w) => w.jira_id));
  return remote.some((w) => !mine.has(w.id)) ? "outside" : "ready";
}

/** `HH:MM` of the PR's first review run that day (D27). Times come padded and in file order. */
export const firstRun = (row) => [...row.times].sort()[0];

/**
 * The rows of a ledger day as the dialog lists them. `remoteByKey` maps a task key to its listWorklogs
 * result list (or null/undefined). `selected` is true only for `ready` rows. Seconds are the
 * ledger's minutes (R08: never recounted); the start is the first run, in the zone `offsetMin`.
 */
export function planDay(rows, { day, records, remoteByKey, offsetMin }) {
  return rows.map((row) => {
    const status = rowStatus(row, { day, records, remote: row.task ? remoteByKey[row.task.key] : null });
    const start = firstRun(row);
    const [h, m] = start.split(":").map(Number);
    return {
      pr: row.pr,
      key: row.task ? row.task.key : null,
      minutes: row.minutes,
      seconds: row.minutes * 60,
      start,
      started: startedText(dayStart(day, offsetMin) + (h * 60 + m) * 60_000, offsetMin),
      comment: reviewComment(row.pr),
      status,
      selected: status === "ready",
    };
  });
}

/** The line of a row in the dialog, as in the first version: `[x] KEY-1 !812 15 min from 09:20`. */
export function planText(p) {
  const box = p.selected ? "[x]" : "[ ]";
  if (p.status === "no_key") return `— !${p.pr} no Jira key`;
  if (p.status === "no_time") return `— ${p.key} !${p.pr} no minutes`;
  const tail = p.status === "friday" ? ` — ${BY_FRIDAY}` : p.status === "outside" ? ` — ${OUTSIDE}` : p.status === "check_failed" ? " — could not check Jira" : ` ${p.minutes} min from ${p.start}`;
  return `${box} ${p.key} !${p.pr}${tail}`;
}

/** "N of M logged": rows that can be logged and already are, by Friday or outside it. */
export function loggedCount(plan) {
  const loggable = plan.filter((p) => p.status !== "no_key" && p.status !== "no_time");
  return { logged: loggable.filter((p) => p.status === "friday" || p.status === "outside").length, of: loggable.length };
}

/**
 * Writes the selected rows one after another. Before each POST that was not selected on purpose
 * (a `friday` or `outside` row is deliberate), the owner's worklogs on the task are read again and R09
 * is applied to the fresh answer, so a worklog that Jira saved but whose answer was lost (a timeout)
 * shows up as "logged outside Friday" and is skipped: the same call is never sent blindly twice.
 * The record is written right after each POST, so a second row on the same task is not mistaken for
 * an outside worklog. A token rejected by Jira (401/403) stops the run.
 *
 * deps: list(key) -> listWorklogs result; post(key, body) -> postWorklog result;
 * saveRecord(record); progress(done, total).
 * Returns one result per selected row: { pr, key, result: "logged" | "skipped" | "failed" | "unknown"
 * | "not_tried", message?, jira_id? }. "unknown" means the POST may have been saved.
 */
export async function logDay(plan, { day, records, offsetMin, now, list, post, saveRecord, progress = () => undefined }) {
  const chosen = plan.filter((p) => p.selected);
  const kept = [...records];
  const results = [];
  let stopped = false;
  for (const p of chosen) {
    const done = results.length;
    progress(done, chosen.length);
    const base = { pr: p.pr, key: p.key };
    if (stopped) { results.push({ ...base, result: "not_tried" }); continue; }
    if (p.status === "no_key" || p.status === "no_time") { results.push({ ...base, result: "skipped", message: planText(p) }); continue; }
    const deliberate = p.status === "friday" || p.status === "outside";
    // Every row is looked up first, deliberate ones too: an earlier POST of this very row that timed
    // out may have been saved, and a retry must not send it a second time.
    const l = await list(p.key).catch(() => ({ ok: false, message: "jira: request failed" }));
    if (!l.ok) {
      results.push({ ...base, result: "failed", message: l.message });
      if (l.status === 401 || l.status === 403) stopped = true;
      continue;
    }
    let jiraId = null;
    let note;
    if (deliberate) {
      const mine = new Set(kept.map((w) => w.jira_id));
      const found = l.worklogs.find((w) => !mine.has(w.id) && w.comment === p.comment && sameInstant(w.started, p.started));
      if (found) { jiraId = found.id; note = "found in Jira"; }
    } else {
      const row = { task: { key: p.key }, pr: p.pr, minutes: p.minutes };
      const now2 = rowStatus(row, { day, records: kept, remote: l.worklogs });
      if (now2 === "friday" || now2 === "outside") {
        results.push({ ...base, result: "skipped", message: now2 === "friday" ? BY_FRIDAY : OUTSIDE });
        continue;
      }
    }
    if (jiraId === null) {
      let r;
      try {
        r = await post(p.key, { started: p.started, seconds: p.seconds, comment: p.comment });
      } catch {
        r = { ok: false, unknown: true, message: "jira: request failed" };
      }
      if (!r.ok) {
        results.push({ ...base, result: r.unknown ? "unknown" : "failed", message: r.unknown ? MAYBE_SAVED : r.message });
        if (r.status === 401 || r.status === 403) stopped = true;
        continue;
      }
      jiraId = r.id;
    }
    const rec = worklogRecord({ jiraId, key: p.key, day, started: p.started, seconds: p.seconds, comment: p.comment, origin: "ledger", ledgerPr: p.pr, now });
    kept.push(rec);
    try {
      await saveRecord(rec);
    } catch {
      results.push({ ...base, result: "logged", jira_id: rec.jira_id, message: "worklogs.json could not be written" });
      continue;
    }
    results.push({ ...base, result: "logged", jira_id: rec.jira_id, ...(note ? { message: note } : {}) });
  }
  progress(results.length, chosen.length);
  return results;
}

/** "3 logged, 1 failed — use Retry failed" (D27); only the counts that are not zero. */
export function summaryText(results) {
  const n = (r) => results.filter((x) => x.result === r).length;
  const parts = [[n("logged"), "logged"], [n("skipped"), "skipped"], [n("failed") + n("unknown"), "failed"], [n("not_tried"), "not tried"]].filter(([c]) => c > 0).map(([c, w]) => `${c} ${w}`);
  const retry = n("failed") + n("unknown") + n("not_tried");
  if (!parts.length) return "Nothing to log.";
  return parts.join(", ") + (retry ? " — use Retry failed" : "");
}

/** The plan rows to select again for a retry: the ones that failed, may have been saved, or were not tried. */
export function retrySelection(plan, results) {
  const again = new Set(results.filter((r) => ["failed", "unknown", "not_tried"].includes(r.result)).map((r) => r.pr));
  return plan.map((p) => ({ ...p, selected: again.has(p.pr) }));
}

/** The plan as it stands after a run, for the "N of M logged" count: written and skipped rows are now logged. */
export function applyResults(plan, results) {
  return plan.map((p) => {
    const r = results.find((x) => x.pr === p.pr && x.key === p.key);
    if (!r) return p;
    if (r.result === "logged") return { ...p, status: "friday" };
    if (r.result === "skipped" && p.status !== "no_key" && p.status !== "no_time") return { ...p, status: r.message === "logged by Friday" ? "friday" : "outside" };
    return p;
  });
}
