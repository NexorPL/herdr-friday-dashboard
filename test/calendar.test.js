import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ICAL from "../mods/friday/vendor/ical.js";
import { fetchMeetings, validateIcalUrl, FETCH_TIMEOUT_MS } from "../mods/friday/core/calendar.js";
import { secretFrom, withSecret } from "../mods/friday/core/secrets.js";
import { parseJson } from "../mods/friday/core/datafile.js";

const URL_SECRET = "https://calendar.example.org/private-SECRETTOKEN123/basic.ics";
const feed = (name) => readFileSync(new URL(`./fixtures/ics/${name}`, import.meta.url), "utf8");
const NOW = Date.UTC(2026, 10, 4, 8, 0);
const run = (fetch, extra = {}) =>
  fetchMeetings({ fetch, withTimeout: (p) => p, ICAL, url: URL_SECRET, now: NOW, offsetMin: 60, me: null, ...extra });
const ok = (body) => async () => ({ ok: true, status: 200, text: async () => body });
const leaks = (value) => JSON.stringify(value).includes("SECRETTOKEN123") || JSON.stringify(value).includes("calendar.example.org");

test("a good feed gives meetings, the day and a note, and no URL anywhere", async () => {
  const r = await run(ok(feed("count.ics")));
  assert.equal(r.ok, true);
  assert.equal(r.value.day, "2026-11-04");
  assert.equal(r.value.meetings.length, 2);
  assert.match(r.value.note, /set calendar\.email/);
  assert.equal(leaks(r), false);
});

test("a rejected fetch never shows its message, which quotes the address", async () => {
  const r = await run(async (u) => { throw new Error(`fetching ${u} failed: connection refused`); });
  assert.deepEqual(r, { ok: false, message: "calendar: could not connect (check the network or proxy)" });
  assert.equal(leaks(r), false);
});

test("the real herdr-app rejection shape is classified as a connect failure without leaking", async () => {
  const r = await run(async () => { throw new Error(`fetching ${URL_SECRET} failed: error sending request for url (${URL_SECRET})`); });
  assert.deepEqual(r, { ok: false, message: "calendar: could not connect (check the network or proxy)" });
  assert.equal(JSON.stringify(r).includes("SECRETTOKEN123"), false);
  assert.equal(leaks(r), false);
});

test("failures are classified by cause, and the rejection text is never copied", async () => {
  const reject = (e) => run(async () => { throw e; });
  const timer = Object.assign(new Error(`timeout ${URL_SECRET}`), { name: "FridayTimeout" });
  const cases = [
    [await reject(new Error(`error sending request for url (${URL_SECRET})`)), "calendar: could not connect (check the network or proxy)"],
    [await reject(`error sending request for url (${URL_SECRET})`), "calendar: could not connect (check the network or proxy)"],
    [await reject(timer), `calendar: timed out after ${FETCH_TIMEOUT_MS / 1000} s`],
    [await reject(new Error(`weird ${URL_SECRET}`)), "calendar: request failed"],
    [await reject(null), "calendar: request failed"],
    [await run(async () => ({ ok: true, status: 200, text: async () => { throw new Error(`error sending request ${URL_SECRET}`); } })), "calendar: could not read the answer"],
    [await run(ok("x"), { withTimeout: () => Promise.reject(timer) }), `calendar: timed out after ${FETCH_TIMEOUT_MS / 1000} s`],
    [await run(ok("x"), { withTimeout: (p) => p.then((r) => (typeof r === "string" ? Promise.reject(timer) : r)) }), `calendar: timed out after ${FETCH_TIMEOUT_MS / 1000} s`],
  ];
  for (const [r, message] of cases) {
    assert.deepEqual(r, { ok: false, message });
    assert.equal(leaks(r), false);
  }
});

test("a typed address is checked first, and the answer never quotes it", async () => {
  assert.equal(validateIcalUrl("https://example.invalid/fake.ics"), null);
  assert.equal(validateIcalUrl("  https://example.invalid/fake.ics  "), null);
  assert.equal(validateIcalUrl("http://example.invalid/fake.ics"), "calendar: the address must start with https://");
  assert.equal(validateIcalUrl("webcal://example.invalid/fake.ics"), "calendar: the address must start with https://");
  assert.equal(validateIcalUrl("https://example.invalid/a b.ics"), "calendar: the address must not contain spaces");
  assert.equal(validateIcalUrl("https:///x.ics"), "calendar: the address has no host name");
  let called = false;
  const r = await run(async () => { called = true; }, { url: "http://calendar.example.org/private-SECRETTOKEN123" });
  assert.deepEqual(r, { ok: false, message: "calendar: the address must start with https://" });
  assert.equal(called, false);
  assert.equal(leaks(r), false);
});

test("a 400 KB feed of 1500 events parses within the step budget and in reasonable time", async () => {
  const ev = (i) => {
    const day = String(1 + (i % 28)).padStart(2, "0");
    return ["BEGIN:VEVENT", `UID:big-${i}@example.invalid`, "DTSTAMP:20261101T000000Z",
      `DTSTART:202611${day}T${String(8 + (i % 9)).padStart(2, "0")}0000Z`, `DTEND:202611${day}T${String(9 + (i % 9)).padStart(2, "0")}0000Z`,
      `SUMMARY:Synthetic meeting ${i}`, "DESCRIPTION:" + "lorem ipsum ".repeat(15), "END:VEVENT"].join("\r\n");
  };
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...Array.from({ length: 1500 }, (_, i) => ev(i)), "END:VCALENDAR"].join("\r\n");
  const t0 = performance.now();
  const r = await run(ok(body));
  const ms = performance.now() - t0;
  console.log(`  1500 events, ${(body.length / 1024).toFixed(0)} KB: ${ms.toFixed(0)} ms`);
  assert.equal(r.ok, true);
  assert.ok(ms < 5000, `parse took ${ms} ms`);
});

test("a timeout or a body that fails to read keeps the secret out", async () => {
  const slow = await run(ok("x"), { withTimeout: () => Promise.reject(new Error(`timeout for ${URL_SECRET}`)) });
  assert.equal(slow.message, "calendar: request failed");
  assert.equal(leaks(slow), false);
});

test("HTTP errors carry the source and the status only", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const r = await run(async () => ({ ok: false, status, url: URL_SECRET, text: async () => URL_SECRET }));
    assert.deepEqual(r, { ok: false, status, message: `calendar: HTTP ${status}` });
    assert.equal(leaks(r), false);
  }
});

test("an answer that is not iCal is refused without quoting it", async () => {
  const r = await run(ok(feed("not-ical.html")));
  assert.deepEqual(r, { ok: false, message: "calendar: the address did not return an iCal feed" });
  assert.equal(r.message.includes("Sign in"), false);
});

test("a parser that throws gives a fixed message", async () => {
  const r = await run(ok("BEGIN:VCALENDAR"), { ICAL: { parse: () => { throw new Error(URL_SECRET); } } });
  assert.equal(leaks(r), false);
  assert.equal(r.ok, false);
});

test("secrets.json: set, replace and remove one secret, keeping the others", () => {
  const a = withSecret({ version: 1, ado_pat: "p" }, "ical_url", `  ${URL_SECRET} `);
  assert.deepEqual(a, { version: 1, ado_pat: "p", ical_url: URL_SECRET });
  assert.equal(secretFrom(parseJson(JSON.stringify(a)), "ical_url"), URL_SECRET);
  assert.deepEqual(withSecret(a, "ical_url", ""), { version: 1, ado_pat: "p" });
  assert.deepEqual(withSecret(null, "jira_token", "t"), { version: 1, jira_token: "t" });
  assert.throws(() => withSecret({}, "other", "x"));
  assert.equal(secretFrom(parseJson(null), "ical_url"), null);
  assert.equal(secretFrom(parseJson("not json"), "ical_url"), null);
  assert.equal(secretFrom(parseJson('{"ical_url": "  "}'), "ical_url"), null);
});

test("the parse pauses between slices, so herdr-app does not end the job half way", async () => {
  const ev = (i) => ["BEGIN:VEVENT", `UID:slice-${i}@example.invalid`, "DTSTAMP:20261101T000000Z",
    "DTSTART:20261104T090000Z", "DTEND:20261104T093000Z", `SUMMARY:Synthetic ${i}`, "END:VEVENT"].join("\r\n");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...Array.from({ length: 450 }, (_, i) => ev(i)), "END:VCALENDAR"].join("\r\n");
  let pauses = 0;
  const r = await run(ok(body), { pause: async () => { pauses++; } });
  assert.equal(r.ok, true);
  assert.equal(r.value.meetings.length, 450);
  assert.ok(pauses >= 3, `pauses: ${pauses}`);
});
