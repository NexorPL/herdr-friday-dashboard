import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ICAL from "../mods/friday/vendor/ical.js";
import { parseFeed, parseFeedSteps, todayRows, joinLink, feedNote, localDay, clock, addDays } from "../mods/friday/core/meetings.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/ics/${name}`, import.meta.url), "utf8");
// Winter in Warsaw: +01:00. All fixtures are hand-made and anonymized.
const CET = 60;
const parse = (name, today = "2026-11-04", extra = {}) => parseFeed(ICAL, fixture(name), { today, offsetMin: CET, ...extra });
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + "Z";
const starts = (r) => r.meetings.map((m) => iso(m.start));
const titles = (r) => r.meetings.map((m) => m.title);

test("RRULE with COUNT keeps only the occurrences in today and tomorrow", () => {
  const r = parse("count.ics");
  assert.deepEqual(starts(r), ["2026-11-04T09:00Z", "2026-11-05T09:00Z"]);
  assert.equal(r.meetings[0].end - r.meetings[0].start, 30 * 60_000);
});

test("RRULE with UNTIL stops at the date", () => {
  assert.deepEqual(starts(parse("until.ics")), ["2026-11-04T10:00Z"]);
});

test("EXDATE removes one occurrence", () => {
  assert.deepEqual(starts(parse("exdate.ics")), ["2026-11-05T09:00Z"]);
});

test("a moved occurrence replaces the original", () => {
  const r = parse("moved.ics");
  assert.deepEqual(titles(r), ["Weekly planning (moved)"]);
  assert.deepEqual(starts(r), ["2026-11-05T15:00Z"]);
});

test("a cancelled occurrence is gone, the rest of the series stays", () => {
  assert.deepEqual(starts(parse("cancelled.ics")), ["2026-11-05T08:00Z"]);
});

test("a weekly meeting keeps its wall time across the DST change", () => {
  // Saturdays 09:00 Warsaw: 17 and 24 Oct are +02:00, 31 Oct is +01:00.
  assert.deepEqual(starts(parseFeed(ICAL, fixture("dst.ics"), { today: "2026-10-24", offsetMin: 120 })), ["2026-10-24T07:00Z"]);
  assert.deepEqual(starts(parseFeed(ICAL, fixture("dst.ics"), { today: "2026-10-31", offsetMin: 60 })), ["2026-10-31T08:00Z"]);
});

test("all-day and multi-day events cover each day, a one-day event ends the day after", () => {
  const r = parse("allday.ics");
  const days = Object.fromEntries(r.meetings.filter((m) => m.all_day).map((m) => [m.title, [m.first_day, m.end_day]]));
  assert.deepEqual(days, { "Team offsite": ["2026-11-04", "2026-11-05"], "Conference week": ["2026-11-03", "2026-11-06"] });
  assert.equal(r.meetings.some((m) => m.title === "Yesterday only"), false);
});

test("a missing DTEND means zero length, DURATION is used when there is one", () => {
  const r = parse("noend.ics");
  assert.equal(r.meetings[0].end, r.meetings[0].start);
  assert.equal(r.meetings[1].end - r.meetings[1].start, 45 * 60_000);
});

test("declined meetings are hidden through calendar.email, and listed without it", () => {
  assert.deepEqual(titles(parse("declined.ics", "2026-11-04", { me: "me@example.org" })), ["Accepted by me", "Declined by someone else"]);
  assert.equal(parse("declined.ics").meetings.length, 3);
  assert.match(feedNote(parse("declined.ics"), null), /set calendar\.email/);
  assert.equal(feedNote(parse("declined.ics"), "me@example.org"), "");
});

test("the join link comes from X-GOOGLE-CONFERENCE, then LOCATION, then DESCRIPTION", () => {
  const r = parse("join.ics");
  assert.deepEqual(r.meetings.map((m) => [m.join_kind, m.join_url]), [
    ["Meet", "https://meet.google.com/abc-defg-hij"],
    ["Teams", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_example%40thread.v2/0"],
    ["Teams", "https://teams.live.com/meet/9876543210"],
    [null, null],
  ]);
  assert.deepEqual(joinLink(new ICAL.Component(ICAL.parse(`BEGIN:VEVENT\nEND:VEVENT`))), { join_url: null, join_kind: null });
});

test("an unknown TZID is read as local time and flagged", () => {
  const r = parse("unknown-tz.ics");
  assert.deepEqual(starts(r), ["2026-11-04T09:00Z"]); // 10:00 at +01:00
  assert.equal(r.unknownTz, true);
  assert.match(feedNote(r, "me@example.org"), /unknown time zone/);
  assert.equal(parse("count.ics").unknownTz, false);
});

test("malformed events are skipped and counted, the others stay", () => {
  const r = parse("malformed.ics");
  assert.deepEqual(titles(r), ["Fine"]);
  assert.equal(r.skipped, 2);
  assert.match(feedNote(r, "me@example.org"), /2 events skipped/);
});

test("an answer that is not iCal has no calendars", () => {
  assert.equal(parse("not-ical.html").calendars, 0);
  assert.equal(parse("empty.ics").calendars, 1);
  assert.equal(parse("empty.ics").meetings.length, 0);
});

test("day helpers use the offset given", () => {
  assert.equal(localDay(Date.UTC(2026, 10, 4, 23, 30), 60), "2026-11-05");
  assert.equal(clock(Date.UTC(2026, 10, 4, 13, 5), 60), "14:05");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

// R04, D24: what the widget shows at a fixed clock (2026-11-04 12:20 local = 11:20Z).
test("today's rows: all-day on top, past hidden, h shows them in place", () => {
  const r = parse("allday.ics");
  const now = Date.UTC(2026, 10, 4, 11, 20);
  const at = (showPast) => todayRows(r.meetings, { today: "2026-11-04", offsetMin: CET, now, showPast });
  assert.deepEqual(at(false).map((m) => m.title), ["Conference week", "Team offsite"]);
  assert.deepEqual(at(true).map((m) => [m.title, m.past]), [["Conference week", false], ["Team offsite", false], ["Planning", true]]);
  const early = todayRows(r.meetings, { today: "2026-11-04", offsetMin: CET, now: Date.UTC(2026, 10, 4, 7, 0), showPast: false });
  assert.deepEqual(early.map((m) => m.title), ["Conference week", "Team offsite", "Planning"]);
});

test("a zero-length meeting is past once it started; tomorrow's are not listed", () => {
  const r = parse("noend.ics");
  const rows = (now) => todayRows(r.meetings, { today: "2026-11-04", offsetMin: CET, now }).map((m) => m.title);
  assert.deepEqual(rows(Date.UTC(2026, 10, 4, 10, 30)), ["No end at all", "With a duration"]);
  assert.deepEqual(rows(Date.UTC(2026, 10, 4, 11, 30)), ["With a duration"]);
  assert.deepEqual(todayRows(r.meetings, { today: "2026-11-05", offsetMin: CET, now: 0 }), []);
});

// Inline feeds for the expansion cost: a series that started years ago must not be walked from its start.
const TZ = `BEGIN:VTIMEZONE
TZID:Europe/Warsaw
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE`;
const feed = (...events) => `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Friday test//EN\n${TZ}\n${events.join("\n")}\nEND:VCALENDAR\n`;
const ev = (uid, lines) => `BEGIN:VEVENT\nUID:${uid}\nDTSTAMP:20261101T000000Z\n${lines}\nEND:VEVENT`;
const run = (text, today = "2026-11-04") => parseFeed(ICAL, text, { today, offsetMin: CET });

test("a Mon-Fri series since 2015 expands only the window, in a bounded number of steps", () => {
  const r = run(feed(ev("std", "DTSTART;TZID=Europe/Warsaw:20150105T090000\nDTEND;TZID=Europe/Warsaw:20150105T091500\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\nSUMMARY:Standup")));
  assert.deepEqual(starts(r), ["2026-11-04T08:00Z", "2026-11-05T08:00Z"]);
  assert.ok(r.steps < 30, `steps: ${r.steps}`);
});

test("a daily series every 3 days and a biweekly series since 2010 land on the right days", () => {
  const r = run(feed(
    ev("d3", "DTSTART;TZID=Europe/Warsaw:20100101T100000\nDTEND;TZID=Europe/Warsaw:20100101T103000\nRRULE:FREQ=DAILY;INTERVAL=3\nSUMMARY:Every3"),
    ev("w2", "DTSTART;TZID=Europe/Warsaw:20100106T110000\nDTEND;TZID=Europe/Warsaw:20100106T113000\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE\nSUMMARY:Biweekly"),
  ));
  // 2010-01-01 + 3k days: 2026-11-04 is day 6151 (not a multiple of 3), 2026-11-05 is 6152, so none; check by arithmetic
  const days = Math.round((Date.UTC(2026, 10, 4) - Date.UTC(2010, 0, 1)) / 86_400_000);
  const expect3 = [0, 1].filter((i) => (days + i) % 3 === 0).length;
  const weeks = Math.round((Date.UTC(2026, 10, 4) - Date.UTC(2010, 0, 6)) / (7 * 86_400_000));
  assert.equal(titles(r).filter((t) => t === "Every3").length, expect3);
  assert.equal(titles(r).filter((t) => t === "Biweekly").length, weeks % 2 === 0 ? 1 : 0);
  assert.ok(r.steps < 60);
});

test("a COUNT series is not moved: it ends where COUNT says", () => {
  const r = run(feed(ev("c", "DTSTART;TZID=Europe/Warsaw:20261103T100000\nDTEND;TZID=Europe/Warsaw:20261103T103000\nRRULE:FREQ=DAILY;COUNT=2\nSUMMARY:Two")));
  assert.deepEqual(starts(r), ["2026-11-04T09:00Z"]);
});

test("EXDATE, RECURRENCE-ID and DST still hold for a long series", () => {
  const r = run(feed(
    ev("s", "DTSTART;TZID=Europe/Warsaw:20180102T100000\nDTEND;TZID=Europe/Warsaw:20180102T103000\nRRULE:FREQ=DAILY\nEXDATE;TZID=Europe/Warsaw:20261104T100000\nSUMMARY:Daily"),
    ev("s", "RECURRENCE-ID;TZID=Europe/Warsaw:20261105T100000\nDTSTART;TZID=Europe/Warsaw:20261105T140000\nDTEND;TZID=Europe/Warsaw:20261105T143000\nSUMMARY:Daily (moved)"),
  ));
  assert.deepEqual(starts(r), ["2026-11-05T13:00Z"]);
  assert.deepEqual(titles(r), ["Daily (moved)"]);
  // after the October change the wall time is still 10:00 (09:00Z), before it was 08:00Z
  const summer = parseFeed(ICAL, feed(ev("s", "DTSTART;TZID=Europe/Warsaw:20180102T100000\nDTEND;TZID=Europe/Warsaw:20180102T103000\nRRULE:FREQ=DAILY\nSUMMARY:Daily")), { today: "2026-07-01", offsetMin: 120 });
  assert.deepEqual(starts(summer), ["2026-07-01T08:00Z", "2026-07-02T08:00Z"]);
});

test("a series that ended before the window costs nothing", () => {
  const r = run(feed(ev("u", "DTSTART;TZID=Europe/Warsaw:20150105T090000\nDTEND;TZID=Europe/Warsaw:20150105T091500\nRRULE:FREQ=DAILY;UNTIL=20200101T000000Z\nSUMMARY:Old")));
  assert.equal(r.meetings.length, 0);
  assert.equal(r.steps, 0);
});

test("a series over its step budget is skipped, a feed over its budget is too complex", () => {
  const long = (i) => ev(`m${i}`, `DTSTART;TZID=Europe/Warsaw:20200101T100000\nDTEND;TZID=Europe/Warsaw:20200101T103000\nRRULE:FREQ=DAILY;COUNT=5000\nSUMMARY:Long`);
  const one = run(feed(long(1)));
  assert.equal(one.skipped, 1);
  assert.equal(one.tooComplex, false);
  const many = run(feed(long(1), long(2), long(3)));
  assert.equal(many.tooComplex, true);
});

test("an all-day event whose DTEND equals its DTSTART shows as one day", () => {
  const r = run(feed(ev("z", "DTSTART;VALUE=DATE:20261104\nDTEND;VALUE=DATE:20261104\nSUMMARY:Zero")));
  assert.equal(r.meetings.length, 1);
  assert.equal(r.meetings[0].end_day, "2026-11-05");
});

// A busy work calendar, anonymized: Wednesday series with many moved occurrences, and past one-offs.
const busyFeed = ({ series = 20, moved = 10, single = 20 } = {}) => {
  const out = [];
  for (let i = 0; i < series; i++) {
    const h = String(8 + (i % 9)).padStart(2, "0");
    out.push(ev(`series-${i}`, `DTSTART:20260107T${h}0000Z\nDTEND:20260107T${h}3000Z\nRRULE:FREQ=WEEKLY\nSUMMARY:Series ${i}`));
    for (let k = 1; k <= moved; k++) {
      const day = new Date(Date.UTC(2026, 0, 7 + 7 * k)).toISOString().slice(0, 10).replaceAll("-", "");
      out.push(ev(`series-${i}`, `RECURRENCE-ID:${day}T${h}0000Z\nDTSTART:${day}T${h}1500Z\nDTEND:${day}T${h}4500Z\nSUMMARY:Series ${i} (moved)`));
    }
  }
  for (let j = 0; j < single; j++) out.push(ev(`single-${j}`, `DTSTART:20260201T${String(8 + (j % 9)).padStart(2, "0")}0000Z\nDTEND:20260201T${String(9 + (j % 9)).padStart(2, "0")}0000Z\nSUMMARY:Single ${j}`));
  return feed(...out);
};

test("ical.js does not rescan the whole calendar for every event (that never finished in herdr-app)", () => {
  const proto = ICAL.Component.prototype;
  const original = proto.getAllSubcomponents;
  let scans = 0;
  proto.getAllSubcomponents = function (name) {
    if (name === "vevent") scans++;
    return original.call(this, name);
  };
  try {
    const r = run(busyFeed());
    assert.equal(r.meetings.length, 20); // each series once, on Wednesday 4 November
    assert.equal(scans, 1);
  } finally {
    proto.getAllSubcomponents = original;
  }
});

test("parseFeedSteps yields between slices and returns what parseFeed returns", () => {
  const text = busyFeed({ series: 30, moved: 15, single: 50 });
  const steps = parseFeedSteps(ICAL, text, { today: "2026-11-04", offsetMin: CET });
  let slices = 0;
  let r;
  while (!(r = steps.next()).done) slices++;
  assert.ok(slices >= 3, `slices: ${slices}`);
  assert.deepEqual(r.value, run(text));
  assert.equal(r.value.meetings.length, 30);
});
