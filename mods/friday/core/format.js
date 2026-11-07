// Dates, times and numbers as text. herdr-app's JavaScript has no `Intl`, and `toLocale*String`
// answers in en-US, so Friday formats these itself. `Date` local getters use the machine's offset
// as of now (spike note, question 5), which is right for the clock and for "today".

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const pad2 = (n) => String(n).padStart(2, "0");

/** R05: the computer's local time as HH:MM:SS. */
export function clockText(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** `2026-11-05`, local. */
export function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `Thu 2026-11-05`. */
export function dateText(d) {
  return `${DAYS[d.getDay()]} ${ymd(d)}`;
}

/** `14:03` from ms since the epoch, local. */
export function hhmm(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `35 min`, or `1 h 5 min` from 60 up. */
export function minutesText(n) {
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  return n % 60 ? `${h} h ${n % 60} min` : `${h} h`;
}

/** `review 35 min (7 runs)` for a day's summary-table total, null without one (no line for a day with no review). */
export function reviewLine(total) {
  if (!total) return null;
  return `review ${minutesText(total.minutes)} (${total.runs} ${total.runs === 1 ? "run" : "runs"})`;
}

/** `Thu` for a `YYYY-MM-DD` string, without going through the machine's offset. */
export function weekdayOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The pane header's state line: `updated 14:03`, `stale, updated 13:50`, an error, or loading. */
export function stateText(state, rec) {
  if (state === "ok") return `updated ${hhmm(rec.ok_at)}`;
  if (state === "stale") return `stale, updated ${hhmm(rec.ok_at)}`;
  if (state === "error") return rec?.rejected ? "token rejected" : (rec?.error ?? "error");
  if (state === "not_set_up") return "not set up";
  return "loading…";
}
