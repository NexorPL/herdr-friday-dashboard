// The herdr-app side of fetching: the vendored parser, the fetch timeout and the machine's offset.
import { fetchMeetings } from "./core/calendar.js";

let icalModule = null;
/** ical.js loads through a dynamic import (spike note, question 6); once per copy. */
const loadIcal = () => (icalModule ??= import("./vendor/ical.js").then((m) => m.default));

/** `fetch` has no AbortController: race it against a timer. The request itself is abandoned. */
export function withTimeout(cx, promise, ms) {
  return new Promise((resolve, reject) => {
    cx.timer.after(ms, () => reject(new Error("timeout")));
    promise.then(resolve, reject);
  });
}

/** Minutes east of UTC now. Date has only this one offset for all dates (spike note, question 5). */
export const offsetNow = () => -new Date().getTimezoneOffset();

/** Fetches the calendar feed at `url`; see core/calendar.js for the result. */
export async function runCalendar(cx, url, me) {
  let ICAL;
  try {
    ICAL = await loadIcal();
  } catch {
    icalModule = null;
    return { ok: false, message: "calendar: could not load the parser" };
  }
  return fetchMeetings({
    fetch: (u) => fetch(u),
    withTimeout: (p, ms) => withTimeout(cx, p, ms),
    ICAL,
    url,
    now: Date.now(),
    offsetMin: offsetNow(),
    me,
  });
}
