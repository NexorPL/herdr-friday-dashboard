// The calendar source's fetch, with its dependencies passed in so Node tests can fake them.
// Every error is built from the source name and the status only: herdr-app's own fetch errors quote
// the URL, and the URL is a secret (the whole calendar), so no message from `fetch` is ever used.
import { httpError, networkError } from "./backoff.js";
import { parseFeedSteps, feedNote, NOT_ICAL, TOO_COMPLEX, localDay } from "./meetings.js";

export const FETCH_TIMEOUT_MS = 15_000;

/** What is wrong with a typed address, or null. Never quotes it (it is a secret). */
export function validateIcalUrl(text) {
  const v = String(text ?? "").trim();
  if (!v.toLowerCase().startsWith("https://")) return "calendar: the address must start with https://";
  if (/\s/.test(v)) return "calendar: the address must not contain spaces";
  if (!/^https:\/\/[^/?#\s]+/i.test(v)) return "calendar: the address has no host name";
  return null;
}

/**
 * Fetches and parses the feed. `fetch(url)` and `withTimeout(promise, ms)` are herdr-app's fetch and
 * a race against `cx.timer.after` (there is no AbortController); `ICAL` is the vendored parser.
 * `pause()` runs between slices of the parse: in herdr-app it is `cx.sleep(0)`, which gives control
 * back so the job is not ended for running too long (see PAUSE_EVERY in core/meetings.js).
 * Returns { ok: true, value: { meetings, day, note } } or { ok: false, status?, message }.
 */
export async function fetchMeetings({ fetch, withTimeout, ICAL, url, now, offsetMin, me, pause = () => undefined }) {
  const bad = validateIcalUrl(url);
  if (bad) return { ok: false, message: bad };
  let body;
  let res;
  try {
    res = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
  } catch (e) {
    return { ok: false, message: networkError("calendar", e, { timeoutMs: FETCH_TIMEOUT_MS }) };
  }
  if (!res.ok) return { ok: false, status: res.status, message: httpError("calendar", res.status) };
  try {
    body = await withTimeout(res.text(), FETCH_TIMEOUT_MS);
  } catch (e) {
    return { ok: false, message: networkError("calendar", e, { stage: "body", timeoutMs: FETCH_TIMEOUT_MS }) };
  }
  const day = localDay(now, offsetMin);
  let parsed;
  try {
    const steps = parseFeedSteps(ICAL, body, { today: day, offsetMin, me });
    let r;
    while (!(r = steps.next()).done) await pause();
    parsed = r.value;
  } catch {
    return { ok: false, message: "calendar: could not read the feed" };
  }
  if (parsed.tooComplex) return { ok: false, message: TOO_COMPLEX };
  if (!parsed.calendars) return { ok: false, message: NOT_ICAL };
  return { ok: true, value: { meetings: parsed.meetings, day, note: feedNote(parsed, me) } };
}
