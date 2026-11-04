import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLogTime, startedText, durationText, worklogRecord, addRecord, recordsOf } from "../mods/friday/core/worklogs.js";
import { favoriteKeys, typedKey, favoriteRows, addFavorite } from "../mods/friday/core/favorites.js";
import { adfComment, postWorklog, listWorklogs, commentText } from "../mods/friday/core/jira.js";

const NOW = Date.UTC(2026, 10, 4, 13, 5); // 14:05 at +60
const OFF = 60;
const form = (over) => validateLogTime({ duration: "1h 30m", date: "", comment: "", ...over }, { key: "ABC-1", now: NOW, offsetMin: OFF });

test("R07: a duration is required, above zero and at most 24 h", () => {
  for (const d of ["", "  ", "soon", "0m", "0", "24h 1m", "25h"]) assert.equal(form({ duration: d }).ok, false, d);
  assert.match(form({ duration: "" }).error, /duration/);
  assert.equal(form({ duration: "24h" }).ok, true);
  assert.equal(form({ duration: "1s" }).ok, true);
  assert.equal(form({ duration: "1.5h" }).seconds, 5400);
});

test("R07: the comment is optional", () => {
  assert.equal(form({ comment: "" }).comment, "");
  assert.equal(form({ comment: "  pairing  " }).comment, "pairing");
});

test("today's worklog ends now and the label shows the span", () => {
  const r = form({});
  assert.equal(r.ok, true);
  assert.equal(r.day, "2026-11-04");
  assert.equal(r.started, "2026-11-04T12:35:00.000+0100");
  assert.equal(r.label, "Log 1h 30m on ABC-1, 2026-11-04 12:35–14:05");
});

test("today's worklog never starts before midnight; another day starts at 09:00", () => {
  const early = validateLogTime({ duration: "3h", date: "", comment: "" }, { key: "K-1", now: Date.UTC(2026, 10, 3, 23, 30), offsetMin: OFF }); // 00:30 local
  assert.equal(early.started, "2026-11-04T00:00:00.000+0100");
  const past = form({ date: "2026-11-02", duration: "45m" });
  assert.equal(past.started, "2026-11-02T09:00:00.000+0100");
  assert.equal(past.label, "Log 45m on ABC-1, 2026-11-02 09:00–09:45");
});

test("the date must be a real day, not in the future", () => {
  for (const d of ["2026-13-01", "yesterday", "2026-02-30", "04.11.2026"]) assert.equal(form({ date: d }).ok, false, d);
  assert.match(form({ date: "2026-11-05" }).error, /future/);
  assert.equal(form({ date: "2026-11-04" }).ok, true);
});

test("started text, with negative and half-hour offsets", () => {
  assert.equal(startedText(Date.UTC(2026, 6, 1, 10, 0, 0, 7), 120), "2026-07-01T12:00:00.007+0200");
  assert.equal(startedText(Date.UTC(2026, 0, 1, 3, 0), -300), "2025-12-31T22:00:00.000-0500");
  assert.equal(startedText(Date.UTC(2026, 0, 1, 0, 0), 330), "2026-01-01T05:30:00.000+0530");
  assert.equal(durationText(5400), "1h 30m");
  assert.equal(durationText(2 * 3600), "2h");
  assert.equal(durationText(1800), "30m");
  assert.equal(durationText(45), "45s");
});

test("the worklog record has the data-model fields, once per Jira id", () => {
  const rec = worklogRecord({ jiraId: 10001, key: "ABC-1", day: "2026-11-04", started: "s", seconds: 5400, comment: "x", origin: "favorite", now: 5 });
  assert.deepEqual(rec, { jira_id: "10001", issue_key: "ABC-1", day: "2026-11-04", started: "s", seconds: 5400, comment: "x", origin: "favorite", ledger_pr: null, created_at: 5 });
  const once = addRecord({ version: 1 }, rec);
  assert.deepEqual(addRecord(once, rec).worklogs, [rec]);
  assert.deepEqual(addRecord({ version: 1, other: 1, worklogs: "bad" }, rec), { version: 1, other: 1, worklogs: [rec] });
  assert.deepEqual(recordsOf({ state: "ok", value: once }), [rec]);
  assert.deepEqual(recordsOf({ state: "missing", value: null }), []);
  assert.deepEqual(recordsOf({ state: "ok", value: { worklogs: [null, { jira_id: 1 }, rec] } }), [rec]);
});

test("favorites.md: keys in file order, once, ignoring text without a key", () => {
  assert.deepEqual(favoriteKeys(null), []);
  assert.deepEqual(favoriteKeys(""), []);
  assert.deepEqual(favoriteKeys("# Favorites\r\nABC-2\r\n- XYZ-1 the big one\r\nnotes\r\nABC-2 again\r\nA-1\n"), ["ABC-2", "XYZ-1"]);
  assert.equal(typedKey(" abc-12 "), "ABC-12");
  for (const bad of ["", "abc", "ABC-", "A B-1", "ABC-1; rm", null]) assert.equal(typedKey(bad), null, String(bad));
});

test("favorite rows: loaded, missing (logging off) and not yet fetched", () => {
  const rows = favoriteRows(["A-1", "G-9", "N-3"], [{ key: "A-1", summary: "S", status: "To Do", priority: "High", url: "https://x.example/browse/A-1" }], ["G-9"]);
  assert.deepEqual(rows.map((r) => [r.key, r.loaded, r.missing]), [["A-1", true, false], ["G-9", true, true], ["N-3", false, false]]);
});

test("adding a favorite keeps the owner's file and skips a key already there", async () => {
  const disk = { text: "ABC-1\r\n", writes: 0 };
  const io = { read: async () => disk.text, write: async (_p, t, prev) => { assert.equal(prev, disk.text); disk.text = t; disk.writes++; } };
  assert.equal((await addFavorite(io, "f.md", "XYZ-2")).changed, true);
  assert.equal(disk.text, "ABC-1\r\nXYZ-2\r\n");
  assert.equal((await addFavorite(io, "f.md", "ABC-1")).changed, false);
  assert.equal(disk.writes, 1);
});

// Jira: the write and the read of worklogs through a fake fetch.
const TOKEN = "TEST-TOKEN-123";
const CFG = { site: "https://acme.atlassian.net", email: "me@example.org", kind: "classic", token: TOKEN };
const ok = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const run = (fetch, withTimeout = (p) => p) => ({ fetch, withTimeout });

test("postWorklog sends started, seconds and an ADF comment, and gives the Jira id", async () => {
  const seen = [];
  const f = async (url, o) => { seen.push({ url, o }); return ok({ id: "10001" }, 201); };
  const r = await postWorklog(run(f), CFG, "ABC-1", { started: "2026-11-04T12:35:00.000+0100", seconds: 5400, comment: "Code review PR !812" });
  assert.deepEqual(r, { ok: true, id: "10001" });
  assert.equal(seen[0].url, "https://acme.atlassian.net/rest/api/3/issue/ABC-1/worklog");
  assert.equal(seen[0].o.method, "POST");
  assert.deepEqual(JSON.parse(seen[0].o.body), { started: "2026-11-04T12:35:00.000+0100", timeSpentSeconds: 5400, comment: adfComment("Code review PR !812") });
  await postWorklog(run(f), CFG, "ABC-1", { started: "s", seconds: 60, comment: "" });
  assert.equal("comment" in JSON.parse(seen[1].o.body), false, "an empty comment is left out");
});

test("a failed POST says whether it may have been saved, and never shows the token", async () => {
  const timer = Object.assign(new Error(`timeout ${TOKEN}`), { name: "FridayTimeout" });
  const cases = [
    [async () => ok({}, 400), { status: 400, unknown: undefined, message: "jira: HTTP 400" }],
    [async () => ok({}, 401), { status: 401, unknown: undefined, message: "jira: token rejected" }],
    [async () => ok({}, 404), { status: 404, unknown: undefined, message: "jira: HTTP 404" }],
    [async () => ok({}, 503), { status: 503, unknown: true, message: "jira: HTTP 503" }],
    [async () => { throw timer; }, { status: undefined, unknown: true, message: "jira: timed out after 15 s" }],
    [async () => { throw new Error(`error sending request for url (https://acme.atlassian.net) ${TOKEN}`); }, { status: undefined, unknown: true, message: "jira: could not connect (check the network or proxy)" }],
    [async () => ({ ok: true, status: 201, text: async () => "<html>" }), { status: undefined, unknown: true, message: "jira: unexpected answer" }],
    [async () => ok({ nothing: 1 }, 201), { status: undefined, unknown: true, message: "jira: unexpected answer" }],
  ];
  for (const [f, want] of cases) {
    const r = await postWorklog(run(f), CFG, "ABC-1", { started: "s", seconds: 60, comment: "c" });
    assert.equal(r.ok, false);
    assert.equal(r.unknown, want.unknown);
    assert.equal(r.status, want.status);
    assert.equal(r.message, want.message);
    assert.equal(JSON.stringify(r).includes("SECRET"), false);
    assert.equal(JSON.stringify(r).includes("acme"), false);
  }
});

test("listWorklogs keeps only the owner's worklogs and reads ADF comments", async () => {
  const seen = [];
  const f = async (url) => {
    seen.push(url);
    return ok({ worklogs: [
      { id: "1", author: { accountId: "me" }, started: "2026-11-04T09:20:00.000+0100", timeSpentSeconds: 900, comment: adfComment("Code review PR !812") },
      { id: "2", author: { accountId: "other" }, started: "2026-11-04T09:20:00.000+0100", timeSpentSeconds: 60 },
      { id: 3, author: { accountId: "me" }, started: "2026-11-04T10:00:00.000+0100", timeSpentSeconds: "600", comment: "plain" },
    ] });
  };
  const r = await listWorklogs(run(f), CFG, "ABC-1", { after: 10, before: 20, accountId: "me" });
  assert.deepEqual(r.worklogs.map((w) => [w.id, w.seconds, w.comment]), [["1", 900, "Code review PR !812"], ["3", 600, "plain"]]);
  assert.equal(seen[0], "https://acme.atlassian.net/rest/api/3/issue/ABC-1/worklog?startedAfter=10&startedBefore=20");
  assert.equal(commentText(null), "");
  const bad = await listWorklogs(run(async () => ok({}, 401)), CFG, "ABC-1", { after: 1, before: 2, accountId: "me" });
  assert.equal(bad.message, "jira: token rejected");
});

import { submitLogTime, MAYBE_SAVED } from "../mods/friday/core/worklogs.js";

test("the Log button validates, posts once, records, and never retries a maybe-saved POST", async () => {
  const run1 = async (over) => {
    const said = [];
    const calls = [];
    const saved = [];
    const done = await submitLogTime({
      form: { duration: "30m", date: "", comment: "c" }, key: "ABC-1", now: NOW, offsetMin: OFF,
      post: async (k, b) => { calls.push([k, b]); return { ok: true, id: "77" }; },
      saveRecord: async (r) => { saved.push(r); },
      say: (t, s) => said.push([t, s]),
      ...over,
    });
    return { done, said, calls, saved };
  };
  const good = await run1({});
  assert.equal(good.done, true);
  assert.deepEqual(good.said, [["Logged 30m on ABC-1.", "ok"]]);
  assert.equal(good.calls.length, 1);
  assert.deepEqual([good.saved[0].jira_id, good.saved[0].origin, good.saved[0].issue_key], ["77", "favorite", "ABC-1"]);
  const invalid = await run1({ form: { duration: "0m" } });
  assert.deepEqual([invalid.done, invalid.calls.length, invalid.said[0][1]], [false, 0, "error"]);
  const rejected = await run1({ post: async () => ({ ok: false, status: 401, message: "jira: token rejected" }) });
  assert.deepEqual(rejected.said, [["jira: token rejected", "error"]]);
  assert.equal(rejected.saved.length, 0);
  const lost = await run1({ post: async () => ({ ok: false, unknown: true, message: "jira: timed out after 15 s" }) });
  assert.deepEqual(lost.said, [[MAYBE_SAVED, "error"]]);
  assert.equal(lost.saved.length, 0);
  const thrown = await run1({ post: async () => { throw new Error("TOKEN"); } });
  assert.equal(JSON.stringify(thrown.said).includes("TOKEN"), false);
  assert.equal(thrown.said[0][0], MAYBE_SAVED);
  const nofile = await run1({ saveRecord: async () => { throw new Error("disk"); } });
  assert.deepEqual([nofile.done, nofile.said[0][1]], [true, "stale"]);
});

test("listWorklogs without an account id fails instead of listing nobody", async () => {
  let called = false;
  const f = async () => { called = true; return ok({ worklogs: [] }); };
  for (const accountId of [null, undefined, ""]) {
    const r = await listWorklogs(run(f), CFG, "ABC-1", { after: 1, before: 2, accountId });
    assert.deepEqual([r.ok, r.message], [false, "jira: account unknown"]);
  }
  assert.equal(called, false);
});
