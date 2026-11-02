import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ICAL from "../mods/friday/vendor/ical.js";
import { fetchMeetings } from "../mods/friday/core/calendar.js";
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
  assert.deepEqual(r, { ok: false, message: "calendar: request failed" });
  assert.equal(leaks(r), false);
});

test("a timeout or a body that fails to read gives the same safe message", async () => {
  const slow = await run(ok("x"), { withTimeout: () => Promise.reject(new Error(`timeout for ${URL_SECRET}`)) });
  assert.equal(slow.message, "calendar: request failed");
  const broken = await run(async () => ({ ok: true, status: 200, text: async () => { throw new Error(URL_SECRET); } }));
  assert.equal(broken.message, "calendar: request failed");
  assert.equal(leaks([slow, broken]), false);
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
