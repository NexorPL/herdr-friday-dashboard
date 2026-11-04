import { test } from "node:test";
import assert from "node:assert/strict";
import { rowStatus, planDay, planText, loggedCount, logDay, summaryText, retrySelection, worklogRecord, MAYBE_SAVED } from "../mods/friday/core/worklogs.js";

const DAY = "2026-11-04";
const OFF = 60;
const row = (key, pr, minutes, times = ["09:20"]) => ({ task: key ? { key, url: "https://x.example" } : null, pr, pr_url: "https://x.example/pr", runs: times.length, times, minutes });
const rec = (key, pr, id, over = {}) => worklogRecord({ jiraId: id, key, day: DAY, started: "s", seconds: 60, comment: "", origin: "ledger", ledgerPr: pr, now: 1, ...over });
const remoteLog = (id) => ({ id, started: "2026-11-04T09:20:00.000+0100", seconds: 900, comment: "" });
const plan = (rows, records = [], remoteByKey = {}) => planDay(rows, { day: DAY, records, remoteByKey, offsetMin: OFF });

test("R09: every status of a ledger row", () => {
  const ctx = (records, remote) => ({ day: DAY, records, remote });
  assert.equal(rowStatus(row(null, 1, 15), ctx([], [])), "no_key");
  assert.equal(rowStatus(row("A-1", 1, 0), ctx([], [])), "no_time");
  assert.equal(rowStatus(row("A-1", 812, 15), ctx([], [])), "ready");
  assert.equal(rowStatus(row("A-1", 812, 15), ctx([rec("A-1", 812, "1")], [remoteLog("1")])), "friday");
  assert.equal(rowStatus(row("A-1", 812, 15), ctx([], [remoteLog("9")])), "outside");
  assert.equal(rowStatus(row("A-1", 812, 15), ctx([], null)), "check_failed");
  // Friday's own worklog on the task (another PR) does not count as outside; the owner's other one does
  assert.equal(rowStatus(row("A-1", 813, 15), ctx([rec("A-1", 812, "1")], [remoteLog("1")])), "ready");
  assert.equal(rowStatus(row("A-1", 813, 15), ctx([rec("A-1", 812, "1")], [remoteLog("1"), remoteLog("2")])), "outside");
  // a record of another day, task or PR does not make this row "logged by Friday"
  assert.equal(rowStatus(row("A-1", 812, 15), ctx([rec("A-1", 812, "1", { day: "2026-11-03" })], [])), "ready");
  assert.equal(rowStatus(row("A-1", 812, 15), ctx([rec("B-1", 812, "1")], [])), "ready");
  assert.equal(rowStatus(row("A-1", 812, 15), ctx([rec("A-1", 812, "1", { origin: "favorite" })], [])), "ready");
});

test("D27: rows start at the PR's first run that day, carry the ledger minutes and the review comment", () => {
  const p = plan([row("A-1", 812, 15, ["12:57", "09:20", "18:07"])], [], { "A-1": [] })[0];
  assert.equal(p.started, "2026-11-04T09:20:00.000+0100");
  assert.equal(p.seconds, 900);
  assert.equal(p.comment, "Code review PR !812");
  assert.equal(p.selected, true);
  assert.equal(planText(p), "[x] A-1 !812 15 min from 09:20");
});

test("the dialog lines and the logged count", () => {
  const rows = [row("A-1", 812, 15), row("A-2", 805, 10), row("A-3", 790, 5), row(null, 799, 3), row("A-4", 1, 0)];
  const p = plan(rows, [rec("A-2", 805, "7")], { "A-1": [], "A-2": [remoteLog("7")], "A-3": [remoteLog("8")], "A-4": [] });
  assert.deepEqual(p.map(planText), [
    "[x] A-1 !812 15 min from 09:20",
    "[ ] A-2 !805 — logged by Friday",
    "[ ] A-3 !790 — logged outside Friday",
    "— !799 no Jira key",
    "— A-4 !1 no minutes",
  ]);
  assert.deepEqual(loggedCount(p), { logged: 2, of: 3 });
  assert.deepEqual(p.map((x) => x.selected), [true, false, false, false, false]);
});

/** A fake Jira: worklogs by task, POST saves unless told to fail; every call is recorded. */
function jira({ postFail = {} } = {}) {
  const db = {}; // key -> [{id,...}] the owner's worklogs
  const calls = { list: [], post: [] };
  let next = 100;
  return {
    db, calls,
    list: async (key) => { calls.list.push(key); return { ok: true, worklogs: [...(db[key] ?? [])] }; },
    post: async (key, body) => {
      calls.post.push([key, body]);
      const fail = postFail[calls.post.length];
      if (fail === "lost") { (db[key] ??= []).push({ id: String(next++), ...body }); return { ok: false, unknown: true, message: "jira: timed out after 15 s" }; }
      if (fail) return { ok: false, status: fail, message: `jira: HTTP ${fail}` };
      const id = String(next++);
      (db[key] ??= []).push({ id, ...body });
      return { ok: true, id };
    },
  };
}
function run(j, p, records, extra = {}) {
  const saved = [];
  return logDay(p, { day: DAY, records, offsetMin: OFF, now: 5, list: j.list, post: j.post, saveRecord: async (r) => { saved.push(r); records.push(r); }, ...extra }).then((results) => ({ results, saved }));
}

test("a day logs what it can: records are written, and two PRs on one task get two worklogs", async () => {
  const j = jira();
  const records = [];
  const p = plan([row("A-1", 812, 15), row("A-1", 813, 10, ["10:00"]), row("B-2", 5, 20)], records, { "A-1": [], "B-2": [] });
  const progress = [];
  const { results, saved } = await run(j, p, records, { progress: (d, t) => progress.push(`${d}/${t}`) });
  assert.deepEqual(results.map((r) => r.result), ["logged", "logged", "logged"]);
  assert.equal(j.calls.post.length, 3);
  assert.deepEqual(j.calls.post.map(([k, b]) => [k, b.comment]), [["A-1", "Code review PR !812"], ["A-1", "Code review PR !813"], ["B-2", "Code review PR !5"]]);
  assert.deepEqual(saved.map((r) => [r.origin, r.ledger_pr, r.day]), [["ledger", 812, DAY], ["ledger", 813, DAY], ["ledger", 5, DAY]]);
  assert.deepEqual(progress, ["0/3", "1/3", "2/3", "3/3"]);
  assert.equal(summaryText(results), "3 logged");
});

test("partial failure: the rest is logged, the failed row can be retried, and it is not logged twice", async () => {
  const j = jira({ postFail: { 2: 400 } });
  const records = [];
  const p = plan([row("A-1", 1, 15), row("B-2", 2, 10), row("C-3", 3, 5)], records, { "A-1": [], "B-2": [], "C-3": [] });
  const first = await run(j, p, records);
  assert.deepEqual(first.results.map((r) => r.result), ["logged", "failed", "logged"]);
  assert.equal(summaryText(first.results), "2 logged, 1 failed — R retries the failed one");
  const again = retrySelection(p, first.results);
  assert.deepEqual(again.map((x) => x.selected), [false, true, false]);
  const second = await run(j, again, records);
  assert.deepEqual(second.results.map((r) => r.result), ["logged"]);
  assert.equal(j.calls.post.length, 4);
  assert.equal(j.db["A-1"].length, 1);
});

test("timeout after Jira saved the worklog: the retry finds it, marks it outside Friday and never posts again", async () => {
  const j = jira({ postFail: { 1: "lost" } });
  const records = [];
  const p = plan([row("A-1", 812, 15)], records, { "A-1": [] });
  const first = await run(j, p, records);
  assert.deepEqual(first.results.map((r) => [r.result, r.message]), [["unknown", MAYBE_SAVED]]);
  assert.equal(records.length, 0, "no record without a Jira id");
  assert.equal(summaryText(first.results), "1 failed — R retries the failed one");
  const second = await run(j, retrySelection(p, first.results), records);
  assert.deepEqual(second.results.map((r) => [r.result, r.message]), [["skipped", "logged outside Friday"]]);
  assert.equal(j.calls.post.length, 1, "the POST is never sent twice");
  assert.equal(j.db["A-1"].length, 1);
});

test("R09 is applied again just before writing: a worklog added since the plan skips the row", async () => {
  const j = jira();
  const records = [];
  const p = plan([row("A-1", 812, 15)], records, { "A-1": [] });
  j.db["A-1"] = [remoteLog("55")]; // an agent logged it after the dialog was opened
  const { results } = await run(j, p, records);
  assert.deepEqual(results.map((r) => [r.result, r.message]), [["skipped", "logged outside Friday"]]);
  assert.equal(j.calls.post.length, 0);
});

test("a row the owner selects on purpose is written without the check", async () => {
  const j = jira();
  const records = [];
  const p = plan([row("A-1", 812, 15)], records, { "A-1": [remoteLog("55")] });
  assert.equal(p[0].status, "outside");
  p[0].selected = true;
  const { results } = await run(j, p, records);
  assert.deepEqual(results.map((r) => r.result), ["logged"]);
  assert.equal(j.calls.list.length, 0);
});

test("rows that cannot be logged are never posted, even if selected", async () => {
  const j = jira();
  const p = plan([row(null, 1, 5), row("A-1", 2, 0)], [], { "A-1": [] }).map((x) => ({ ...x, selected: true }));
  const { results } = await run(j, p, []);
  assert.deepEqual(results.map((r) => r.result), ["skipped", "skipped"]);
  assert.equal(j.calls.post.length, 0);
});

test("a rejected token stops the run; the rest are not tried and can be retried", async () => {
  const j = jira({ postFail: { 1: 401 } });
  const p = plan([row("A-1", 1, 5), row("B-2", 2, 5)], [], { "A-1": [], "B-2": [] });
  const { results } = await run(j, p, []);
  assert.deepEqual(results.map((r) => r.result), ["failed", "not_tried"]);
  assert.equal(j.calls.post.length, 1);
  assert.equal(summaryText(results), "1 failed, 1 not tried — R retries the failed ones");
  assert.deepEqual(retrySelection(p, results).map((x) => x.selected), [true, true]);
});

test("a failed read of the owner's worklogs fails that row without writing it", async () => {
  const j = jira();
  j.list = async () => ({ ok: false, status: 503, message: "jira: HTTP 503" });
  const p = plan([row("A-1", 1, 5)], [], { "A-1": [] });
  const { results } = await run(j, p, []);
  assert.deepEqual(results.map((r) => [r.result, r.message]), [["failed", "jira: HTTP 503"]]);
  assert.equal(j.calls.post.length, 0);
});

test("a throwing network call and a failing worklogs.json write do not lose the result", async () => {
  const j = jira();
  const p = plan([row("A-1", 1, 5)], [], { "A-1": [] });
  const thrown = await logDay(p, { day: DAY, records: [], offsetMin: OFF, now: 5, list: async () => { throw new Error("TOKEN"); }, post: j.post, saveRecord: async () => {} });
  assert.deepEqual(thrown.map((r) => [r.result, r.message]), [["failed", "jira: request failed"]]);
  const nofile = await logDay(p, { day: DAY, records: [], offsetMin: OFF, now: 5, list: j.list, post: j.post, saveRecord: async () => { throw new Error("disk"); } });
  assert.deepEqual(nofile.map((r) => [r.result, r.message]), [["logged", "worklogs.json could not be written"]]);
  assert.equal(summaryText([]), "Nothing to log.");
});
