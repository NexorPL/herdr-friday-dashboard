// The herdr-app side of fetching: the vendored parser, the fetch timeout and the machine's offset.
import { fetchMeetings } from "./core/calendar.js";
import { fetchJira, testMyself } from "./core/jira.js";

let icalModule = null;
/** ical.js loads through a dynamic import (spike note, question 6); once per copy. */
const loadIcal = () => (icalModule ??= import("./vendor/ical.js").then((m) => m.default));

/** `fetch` has no AbortController: race it against a timer. The request itself is abandoned. */
export function withTimeout(cx, promise, ms) {
  return new Promise((resolve, reject) => {
    cx.timer.after(ms, () => reject(Object.assign(new Error("timeout"), { name: "FridayTimeout" })));
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
    pause: () => cx.sleep(0),
    ICAL,
    url,
    now: Date.now(),
    offsetMin: offsetNow(),
    me,
  });
}

const jiraDeps = (cx) => ({ fetch: (u, o) => fetch(u, o), withTimeout: (p, ms) => withTimeout(cx, p, ms) });

/** Fetches my issues and the extra keys; `cfg` is { site, email, kind, token }. See core/jira.js. */
export const runJira = (cx, cfg, extra) => fetchJira(jiraDeps(cx), cfg, extra);

/** Settings > Jira > Test: GET /myself. See core/jira.js. */
export const runJiraTest = (cx, cfg) => testMyself(jiraDeps(cx), cfg);
