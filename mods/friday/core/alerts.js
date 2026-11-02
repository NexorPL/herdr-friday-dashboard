// Meeting alerts (R06, R11, D24). Pure: which alerts are due, what they say, and how they are
// recorded in alerts.json, `{ version, sent: { "<uid>|<occurrence_start>|<offset_min>": sent_at } }`.
// Ported from the first version's alerts.rs. ponytail: offsets count in whole minutes, as the key
// stores them; a 30s offset alerts at the start.
import { clock } from "./meetings.js";

/** An alert found more than this late (herdr-app was closed, the computer slept) is dropped (R11). */
export const LATE_MS = 60_000;

/** Entries older than this are deleted from alerts.json. */
export const KEEP_MS = 7 * 24 * 3_600_000;

/** Whole minutes of the offsets in seconds, largest first, without repeats. */
export function offsetMinutes(offsetsSec) {
  return [...new Set(offsetsSec.map((s) => Math.floor(s / 60)))].sort((a, b) => b - a);
}

export const alertKey = (m, offsetMin) => `${m.uid}|${new Date(m.occurrence).toISOString()}|${offsetMin}`;

/**
 * The alerts due at `now`: for each timed meeting and offset, one whose time came within the last
 * minute and is not in `sent` (the object read from alerts.json). All-day events get none (D24).
 * Returns [{ meeting, offsetMin, key }].
 */
export function dueAlerts(meetings, offsetsSec, sent, now) {
  const due = [];
  for (const m of meetings) {
    if (m.all_day) continue;
    for (const offsetMin of offsetMinutes(offsetsSec)) {
      const at = m.start - offsetMin * 60_000;
      const key = alertKey(m, offsetMin);
      if (at <= now && now - at <= LATE_MS && !Object.hasOwn(sent, key)) due.push({ meeting: m, offsetMin, key });
    }
  }
  return due;
}

/**
 * Records `due` as sent in a parsed alerts.json, for updateJson to write with compare-and-swap.
 * Returns { next, claimed }: `claimed` holds only the alerts whose key was not in the file when it
 * was read, so of two copies racing for one alert exactly one gets it. Old entries are pruned.
 */
export function claimAlerts(raw, due, now) {
  const sent = {};
  for (const [k, at] of Object.entries(raw && typeof raw.sent === "object" && raw.sent ? raw.sent : {})) {
    if (typeof at === "number" && now - at < KEEP_MS) sent[k] = at;
  }
  const claimed = [];
  for (const d of due) {
    if (Object.hasOwn(sent, d.key)) continue;
    sent[d.key] = now;
    claimed.push(d);
  }
  return { next: { version: 1, sent }, claimed };
}

/** The toast: `In 5m: Standup`, with `14:30–15:00 · Teams`. */
export function alertText(m, offsetMin, offsetNowMin) {
  const lead = offsetMin === 0 ? "Now" : offsetMin % 60 === 0 ? `In ${offsetMin / 60}h` : offsetMin > 60 ? `In ${Math.floor(offsetMin / 60)}h ${offsetMin % 60}m` : `In ${offsetMin}m`;
  let body = `${clock(m.start, offsetNowMin)}–${clock(m.end, offsetNowMin)}`;
  if (m.join_kind) body += ` · ${m.join_kind}`;
  return { title: `${lead}: ${m.title}`, body };
}
