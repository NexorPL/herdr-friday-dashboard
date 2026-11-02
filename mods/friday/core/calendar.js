// The calendar source's fetch, with its dependencies passed in so Node tests can fake them.
// Every error is built from the source name and the status only: herdr-app's own fetch errors quote
// the URL, and the URL is a secret (the whole calendar), so no message from `fetch` is ever used.
import { httpError, networkError } from "./backoff.js";
import { parseFeed, feedNote, NOT_ICAL, TOO_COMPLEX, localDay } from "./meetings.js";

export const FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetches and parses the feed. `fetch(url)` and `withTimeout(promise, ms)` are herdr-app's fetch and
 * a race against `cx.timer.after` (there is no AbortController); `ICAL` is the vendored parser.
 * Returns { ok: true, value: { meetings, day, note } } or { ok: false, status?, message }.
 */
export async function fetchMeetings({ fetch, withTimeout, ICAL, url, now, offsetMin, me }) {
  let body;
  try {
    const res = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
    if (!res.ok) return { ok: false, status: res.status, message: httpError("calendar", res.status) };
    body = await withTimeout(res.text(), FETCH_TIMEOUT_MS);
  } catch {
    return { ok: false, message: networkError("calendar") };
  }
  const day = localDay(now, offsetMin);
  let parsed;
  try {
    parsed = parseFeed(ICAL, body, { today: day, offsetMin, me });
  } catch {
    return { ok: false, message: "calendar: could not read the feed" };
  }
  if (parsed.tooComplex) return { ok: false, message: TOO_COMPLEX };
  if (!parsed.calendars) return { ok: false, message: NOT_ICAL };
  return { ok: true, value: { meetings: parsed.meetings, day, note: feedNote(parsed, me) } };
}
