// Meetings from the iCal feed (first-version spec, Meetings edge cases; R04, D24, A01). The feed is
// parsed in memory with the vendored ical.js, which `ICAL` stands for (the caller imports it, so
// this file loads in Node tests and in QuickJS alike). Nothing here touches the feed's address.
//
// Time zones: `Date` has one offset for every date in herdr-app (spike note, question 5), so event
// times come from the feed's own VTIMEZONE through ical.js. `offsetMin` (minutes east of UTC, the
// machine's offset now) is used only for floating times and for where a local day begins, which is
// off by an hour for the few hours around a DST change. ponytail: one offset for day boundaries.
//
// A meeting: { uid, occurrence, start, end, all_day, first_day, end_day, title, join_url, join_kind }
// with times in ms since the epoch; an all-day meeting covers first_day up to, not including, end_day.

export const NOT_ICAL = "calendar: the address did not return an iCal feed";

const DAY = 86_400_000;
const JOIN = [
  ["https://meet.google.com/", "Meet"],
  ["https://teams.microsoft.com/", "Teams"],
  ["https://teams.live.com/", "Teams"],
];
// QuickJS steps an iterator in about 0.3 ms and herdr-app check interrupts at 1 s, so one series
// and the whole feed each get a step budget. A series over its budget is skipped; a feed over its
// budget is "too complex" and shows no meetings (better than a frozen app).
const MAX_STEPS = 1000;
const MAX_TOTAL_STEPS = 2500;
export const TOO_COMPLEX = "calendar: too complex";
// herdr-app 0.1.12 ends a script job that runs about half a second without giving control back,
// and then no catch or finally runs: the task just stops. parseFeedSteps yields every PAUSE_EVERY
// events or recurrence steps, so the caller can pause between slices (see core/calendar.js).
const PAUSE_EVERY = 200;

const pad = (n) => String(n).padStart(2, "0");
const dayString = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** `YYYY-MM-DD` plus `n` days. */
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY);
  return dayString(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** ms of 00:00 local on `day`. */
export function dayStart(day, offsetMin) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - offsetMin * 60_000;
}

/** The local `YYYY-MM-DD` of a moment. */
export function localDay(ms, offsetMin) {
  const t = new Date(ms + offsetMin * 60_000);
  return dayString(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** `14:30`, local. */
export function clock(ms, offsetMin) {
  const t = new Date(ms + offsetMin * 60_000);
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

const prop = (e, name) => e.getFirstProperty(name);
const text = (e, name) => {
  const v = e.getFirstPropertyValue(name);
  return typeof v === "string" ? v : null;
};

/** ms for a date-time, reading floating times as the machine's local time. */
function toMs(time, offsetMin) {
  if (time.zone && time.zone.tzid === "floating") {
    return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second) - offsetMin * 60_000;
  }
  return time.toUnixTime() * 1000;
}

const dayOf = (time) => dayString(time.year, time.month, time.day);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** Records a TZID the feed uses without defining it (ical.js reads it as floating). */
function checkZone(p, time, flags) {
  if (p && !time.isDate && time.zone && time.zone.tzid === "floating" && p.getParameter("tzid")) flags.unknownTz = true;
}

/** The cleaned title: control characters and line breaks become spaces. */
function cleanTitle(s) {
  // eslint-disable-next-line no-control-regex
  const t = (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return t === "" ? "(no title)" : t;
}

/** The join link, searched in X-GOOGLE-CONFERENCE, then LOCATION, then DESCRIPTION (A01). */
export function joinLink(e) {
  for (const field of ["x-google-conference", "location", "description"]) {
    const value = text(e, field);
    if (!value) continue;
    for (const [prefix, kind] of JOIN) {
      const at = value.indexOf(prefix);
      if (at < 0) continue;
      const url = /^[^\s\\<>"),]*/.exec(value.slice(at))[0];
      return { join_url: url, join_kind: kind };
    }
  }
  return { join_url: null, join_kind: null };
}

/** The owner's reply is DECLINED, found by `calendar.email` among the attendees. */
function declined(e, me) {
  if (!me) return false;
  const mine = me.trim().toLowerCase();
  return e.getAllProperties("attendee").some((a) => {
    const v = String(a.getFirstValue() ?? "").toLowerCase().replace(/^mailto:/, "");
    return v === mine && String(a.getParameter("partstat") ?? "").toUpperCase() === "DECLINED";
  });
}

/**
 * Where to start expanding a series: null when it ended before the window, else DTSTART, moved
 * forward by whole periods for a COUNT-less DAILY or WEEKLY rule (wall time kept, so DST and the
 * BYDAY pattern are unchanged; a week stays before the window). Other rules are cheap to walk.
 */
function seriesStart(e, start, today, from, offsetMin) {
  const rules = e.getAllProperties("rrule");
  if (rules.length !== 1 || e.getFirstProperty("rdate")) return start;
  const rule = rules[0].getFirstValue();
  if (rule.until && (rule.until.isDate ? dayOf(rule.until) < today : toMs(rule.until, offsetMin) < from)) return null;
  if (rule.count || (rule.freq !== "DAILY" && rule.freq !== "WEEKLY")) return start;
  const period = (rule.interval || 1) * (rule.freq === "WEEKLY" ? 7 : 1);
  const k = Math.floor((daysBetween(dayOf(start), today) - 7 - period) / period);
  if (k <= 0) return start;
  const moved = start.clone();
  moved.adjust(k * period, 0, 0, 0);
  return moved;
}

/**
 * Parses the feed and keeps the occurrences that touch the window: local midnight of `today` to
 * local midnight two days later (today and tomorrow). `me` is `calendar.email`, to leave out
 * meetings the owner declined. Returns { meetings, skipped, unknownTz, calendars }; `calendars`
 * is 0 when the answer was not an iCal feed (a sign-in page, say).
 */
export function parseFeed(ICAL, feed, options) {
  const steps = parseFeedSteps(ICAL, feed, options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** parseFeed in slices: the generator yields between slices of work and returns parseFeed's result. */
export function* parseFeedSteps(ICAL, feed, { today, offsetMin, me = null }) {
  const out = { meetings: [], skipped: 0, unknownTz: false, calendars: 0, steps: 0, tooComplex: false };
  let root;
  try {
    const jcal = ICAL.parse(feed);
    root = new ICAL.Component(Array.isArray(jcal[0]) ? jcal[0] : jcal);
  } catch {
    return out;
  }
  if (root.name !== "vcalendar") return out;
  out.calendars = 1;
  // ponytail: ICAL.parse is one slice (~0.1 s for 400 KB in QuickJS); a feed a few times larger needs a streaming parse.
  yield;
  let work = 0;
  for (const z of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(z);
    } catch {
      out.skipped++;
    }
  }
  const from = dayStart(today, offsetMin);
  const to = dayStart(addDays(today, 2), offsetMin);
  const lastDay = addDays(today, 2);
  const flags = { unknownTz: false };

  const events = root.getAllSubcomponents("vevent");
  // An override (RECURRENCE-ID) replaces the occurrence it names: moved, retitled or cancelled.
  const overridden = new Set();
  const key = (uid, t) => `${uid}|${t.isDate ? dayOf(t) : toMs(t, offsetMin)}`;
  for (const e of events) {
    if (++work % PAUSE_EVERY === 0) yield;
    try {
      const rid = prop(e, "recurrence-id");
      const uid = text(e, "uid");
      if (rid && uid) overridden.add(key(uid, rid.getFirstValue()));
    } catch {
      // counted below, when the event itself is read
    }
  }

  for (const e of events) {
    if (++work % PAUSE_EVERY === 0) yield;
    try {
      const uid = text(e, "uid");
      const startProp = prop(e, "dtstart");
      if (!uid || !startProp) {
        out.skipped++;
        continue;
      }
      const start = startProp.getFirstValue();
      checkZone(startProp, start, flags);
      const status = (text(e, "status") ?? "").toUpperCase();
      if (status === "CANCELLED" || declined(e, me)) continue;
      const allDay = Boolean(start.isDate);

      // Length: DTEND - DTSTART, else DURATION, else zero (all-day: one day).
      let ms = allDay ? DAY : 0;
      const endProp = prop(e, "dtend");
      if (endProp) {
        const end = endProp.getFirstValue();
        checkZone(endProp, end, flags);
        ms = allDay ? Math.max(1, daysBetween(dayOf(start), dayOf(end))) * DAY : toMs(end, offsetMin) - toMs(start, offsetMin);
      } else if (prop(e, "duration")) {
        ms = e.getFirstPropertyValue("duration").toSeconds() * 1000;
        if (allDay) ms = Math.max(DAY, Math.round(ms / DAY) * DAY);
      }
      if (!(ms >= 0)) {
        out.skipped++;
        continue;
      }

      const info = { uid, title: cleanTitle(text(e, "summary")), ...joinLink(e), all_day: allDay };
      const add = (occurrence, s) => {
        if (allDay) {
          const first = dayOf(s);
          const end = addDays(first, ms / DAY);
          if (first < lastDay && end > today) {
            out.meetings.push({ ...info, occurrence: dayStart(dayOf(occurrence), offsetMin), start: dayStart(first, offsetMin), end: dayStart(end, offsetMin), first_day: first, end_day: end });
          }
          return;
        }
        const startMs = toMs(s, offsetMin);
        const endMs = startMs + ms;
        if (startMs < to && (endMs > from || (endMs === startMs && startMs >= from))) {
          out.meetings.push({ ...info, occurrence: toMs(occurrence, offsetMin), start: startMs, end: endMs, first_day: null, end_day: null });
        }
      };

      const rid = prop(e, "recurrence-id");
      if (rid) {
        add(rid.getFirstValue(), start); // an override stands for the one occurrence it names
      } else {
        // Without `exceptions`, ical.js relates every RECURRENCE-ID event of the calendar to each
        // event it builds: a scan of all events per event, which took ~26 ms per event on a real
        // 1657-event feed in QuickJS. Overrides are handled above through `overridden`.
        const ev = new ICAL.Event(e, { exceptions: [] });
        if (ev.isRecurring()) {
          const begin = seriesStart(e, start, today, from, offsetMin);
          if (begin === null) continue; // ended before the window
          const it = ev.iterator(begin);
          let step = 0;
          for (let next = it.next(); next; next = it.next()) {
            if (++work % PAUSE_EVERY === 0) yield;
            if (step++ >= MAX_STEPS) {
              out.skipped++;
              break;
            }
            if (++out.steps > MAX_TOTAL_STEPS) {
              out.tooComplex = true;
              break;
            }
            if ((allDay ? dayStart(dayOf(next), offsetMin) : toMs(next, offsetMin)) >= to) break;
            if (!overridden.has(key(uid, next))) add(next, next);
          }
          if (out.tooComplex) break;
        } else {
          add(start, start);
        }
      }
    } catch {
      out.skipped++;
    }
  }
  out.meetings.sort((a, b) => a.start - b.start || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  out.unknownTz = flags.unknownTz;
  return out;
}

/** The status line after a fetch: skipped events, an unknown zone, declined meetings still listed. */
export function feedNote({ skipped, unknownTz }, me) {
  const parts = [];
  if (skipped === 1) parts.push("1 event skipped");
  else if (skipped > 1) parts.push(`${skipped} events skipped`);
  if (unknownTz) parts.push("unknown time zone read as local");
  if (!me) parts.push("set calendar.email to hide declined");
  return parts.join(" · ");
}

/**
 * Today's rows (D24, R04): all-day meetings covering today first, then timed ones starting
 * today in order. A timed meeting is past once it ended (or started, if it has no length); past
 * rows are left out unless `showPast`. Each row gets `past`.
 */
export function todayRows(meetings, { today, offsetMin, now, showPast = false }) {
  const rows = [];
  for (const m of meetings) {
    if (m.all_day) {
      if (m.first_day <= today && today < m.end_day) rows.push({ ...m, past: false });
    } else if (localDay(m.start, offsetMin) === today) {
      rows.push({ ...m, past: (m.end > m.start ? m.end : m.start) <= now });
    }
  }
  rows.sort((a, b) => Number(!a.all_day) - Number(!b.all_day) || a.start - b.start);
  return showPast ? rows : rows.filter((r) => !r.past);
}

/** `all day` or `14:30` for a row. */
export function rowTime(m, offsetMin) {
  return m.all_day ? "all day" : clock(m.start, offsetMin);
}
