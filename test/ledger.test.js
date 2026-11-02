import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLedger, loadLedger, isJiraKey, firstKey, isDate, newestDays, totalFor, MAX_LEDGER_CHARS } from "../mods/friday/core/ledger.js";

const FIXTURE = readFileSync(new URL("./fixtures/ledger.md", import.meta.url), "utf8");

test("reads days, rows and totals", () => {
  const l = parseLedger(FIXTURE);
  assert.deepEqual(l.days.map((d) => d.date), ["2026-11-05", "2026-11-04", "2026-11-03"]);
  assert.deepEqual(l.days.map((d) => d.rows.length), [3, 1, 1]);
  const row = l.days[0].rows[0];
  assert.deepEqual(row.task, { key: "PROJ-11", url: "https://jira.example.test/browse/PROJ-11" });
  assert.deepEqual([row.pr, row.runs, row.minutes], [501, 3, 15]);
  assert.equal(row.pr_url, "https://dev.example.test/pr/501");
  assert.deepEqual(row.times, ["09:20", "12:57", "18:07"]);
});

test("a row without a Jira link has no task", () => {
  const l = parseLedger(FIXTURE);
  assert.equal(l.days[0].rows[1].task, null);
  assert.equal(l.days[0].rows[1].pr, 499);
  assert.equal(l.days[2].rows[0].task, null, "plain text in the task cell");
  assert.deepEqual(l.days[2].rows[0].times, ["09:15", "14:40"], "a one-digit hour is read");
});

test("a broken row is counted; headers, separators and totals are not", () => {
  const l = parseLedger(FIXTURE);
  assert.equal(l.skipped, 1);
  assert.ok(l.days[0].rows.every((r) => r.runs > 0));
});

test("totals come from the summary table, not from the rows (R08)", () => {
  const l = parseLedger(FIXTURE);
  assert.deepEqual(totalFor(l, "2026-11-05"), { runs: 7, minutes: 35 });
  // The rows of that day add up to 30 minutes; the summary's 35 is what Friday shows.
  assert.equal(l.days[0].rows.reduce((n, r) => n + r.minutes, 0), 30);
  assert.deepEqual(Object.keys(l.totals), ["2026-11-05", "2026-11-04", "2026-11-03"]);
  assert.equal(totalFor(l, "2026-11-06"), null);
});

test("CRLF reads the same", () => {
  assert.deepEqual(parseLedger(FIXTURE.replaceAll("\n", "\r\n")), parseLedger(FIXTURE));
});

test("a five-cell row outside a day is counted", () => {
  const text = "| T | PR | R | Times | Min |\n|---|---|---|---|---|\n| [K-1](https://x.test) | [!1](https://x.test) | 1 | 09:00 | 5 |\n";
  const l = parseLedger(text);
  assert.deepEqual([l.days.length, l.skipped], [0, 1]);
});

test("a heading that is not a date ends the day", () => {
  const text = "## 2026-11-05\n\n| T | PR | R | Times | Min |\n|---|---|---|---|---|\n| — | [!1](https://x.test) | 1 | 09:00 | 5 |\n\n## Notes\n\n| a | b | c | d | e |\n";
  const l = parseLedger(text);
  assert.equal(l.days[0].rows.length, 1);
  assert.equal(l.skipped, 1, "the row under Notes is a five-cell row outside a day");
});

test("impossible dates and times are not read", () => {
  assert.ok(isDate("2024-02-29") && !isDate("2026-02-29") && !isDate("2026-13-01") && !isDate("2026-1-01"));
  const row = (t) => `## 2026-11-05\n| a | b | c | d | e |\n|---|---|---|---|---|\n| — | [!1](x) | 1 | ${t} | 5 |\n`;
  assert.equal(parseLedger(row("09:00")).days[0].rows.length, 1);
  for (const bad of ["24:00", "09:60", "9am", "09:00,", ""]) assert.equal(parseLedger(row(bad)).days[0].rows.length, 0, bad);
});

test("an empty file is an empty ledger", () => {
  assert.deepEqual(parseLedger(""), { days: [], totals: {}, skipped: 0 });
});

test("Jira keys", () => {
  for (const good of ["KEY-1", "AB2-345"]) assert.ok(isJiraKey(good), good);
  for (const bad of ["key-1", "KEY-", "-1", "KEY1", "!812", "1AB-2", "KEY-1a", ""]) assert.ok(!isJiraKey(bad), bad);
  assert.equal(firstKey("fix PROJ-12: login, not abc-3"), "PROJ-12");
  assert.equal(firstKey("nothing here"), null);
});

test("loadLedger reports ok, missing, unreadable and too large", async () => {
  assert.deepEqual(await loadLedger(async () => "x", "p.md"), { state: "ok", text: "x", error: null });
  assert.deepEqual(await loadLedger(async () => null, "p.md"), { state: "missing", text: null, error: "ledger not found at p.md" });
  const big = await loadLedger(async () => { throw new Error("`herdr.readTextFile`: Text file exceeds 1 MiB"); }, "p.md");
  assert.deepEqual([big.state, big.error], ["too_large", "file too large: p.md"]);
  const over = await loadLedger(async () => "x".repeat(MAX_LEDGER_CHARS + 1), "p.md");
  assert.equal(over.state, "too_large");
  assert.equal((await loadLedger(async () => "x".repeat(MAX_LEDGER_CHARS), "p.md")).state, "ok", "exactly 1 MiB is allowed");
  const failed = await loadLedger(async () => { throw new Error("denied: C:/secret/place"); }, "p.md");
  assert.deepEqual([failed.state, failed.error], ["error", "cannot read p.md"], "the reader's message is not repeated");
});

test("loading never writes: the reader is the only thing used", async () => {
  const calls = [];
  await loadLedger(async (p) => (calls.push(p), FIXTURE), "p.md");
  assert.deepEqual(calls, ["p.md"]);
});

test("newestDays keeps the newest days and the totals from that range", () => {
  const l = parseLedger(FIXTURE);
  const cut = newestDays(l, 2);
  assert.deepEqual(cut.days.map((d) => d.date), ["2026-11-05", "2026-11-04"]);
  assert.deepEqual(Object.keys(cut.totals), ["2026-11-05", "2026-11-04"]);
  assert.equal(cut.skipped, 1);
  assert.deepEqual(newestDays(parseLedger(""), 5), { days: [], totals: {}, skipped: 0 });
});
