import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLedger, candidates } from "../mods/friday/core/ledgercheck.js";

const home = "C:/Users/me";
const has = (...paths) => async (p) => paths.includes(p);
const LEDGER = "# Review\n\n## 2026-10-30\n\n## 2026-10-31\n";

test("found shows the day count", async () => {
  const r = await checkLedger("~/pr-reviews.md", home, { state: "ok", text: LEDGER }, has());
  assert.equal(r.text, "✓ found, 2 days");
  assert.equal(r.state, "ok");
  assert.equal((await checkLedger("~/p.md", home, { state: "ok", text: LEDGER.split("## 2026-10-31")[0] }, has())).text, "✓ found, 1 day");
});

test("missing shows the expanded path and existing same-name files in three folders", async () => {
  const exists = has("C:/Users/me/Downloads/pr-reviews.md", "C:/Users/me/Documents/pr-reviews.md", "C:/Users/me/x/pr-reviews.md");
  const r = await checkLedger("~\\pr-reviews.md", home, { state: "missing" }, exists);
  assert.equal(r.text, "✗ not found at C:/Users/me/pr-reviews.md");
  assert.deepEqual(r.suggestions, ["~/Downloads/pr-reviews.md", "~/Documents/pr-reviews.md"]);
});

test("backslash and slash paths give the same file name; the typed path is not suggested", async () => {
  assert.deepEqual(await candidates("D:\\a\\pr-reviews.md", home, has("C:/Users/me/pr-reviews.md")), ["~/pr-reviews.md"]);
  assert.deepEqual(await candidates("C:/Users/me/pr-reviews.md", home, has("C:/Users/me/pr-reviews.md")), []);
});

test("too large and unreadable keep their messages", async () => {
  const r = await checkLedger("~/x.md", home, { state: "too_large", error: "file too large: p" }, has());
  assert.deepEqual([r.text, r.state, r.suggestions], ["file too large: p", "error", []]);
});

test("a backslash home shows forward slashes and suggests ~/ paths", async () => {
  const r = await checkLedger("~/pr-reviews.md", "C:\\Users\\me", { state: "missing" }, has("C:/Users/me/Downloads/pr-reviews.md"));
  assert.equal(r.text, "✗ not found at C:/Users/me/pr-reviews.md");
  assert.deepEqual(r.suggestions, ["~/Downloads/pr-reviews.md"]);
});

test("names . and .. and empty give no suggestions", async () => {
  for (const p of ["C:/Users/me/gone/..", "C:/Users/me/.", "C:/Users/me/"]) assert.deepEqual(await candidates(p, home, async () => true), []);
});
