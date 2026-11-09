import { test } from "node:test";
import assert from "node:assert/strict";
import { adoRepos } from "../mods/friday/core/ado.js";
import { applyFetch, markSeen, rowsForRepos, repoKey } from "../mods/friday/core/prs.js";
import { resolveSettings, setKey } from "../mods/friday/core/settings.js";

const pr = (id, title = `PR ${id}`) => ({ id, title, author: "Alex Demo", created_at: "2026-11-01T10:00:00Z", is_draft: false, url: `https://x.example/${id}` });

test("repos wins over the older single repo, which is still read when repos is empty", () => {
  assert.deepEqual(adoRepos({ repos: ["a", "b"], repo: "old" }), ["a", "b"]);
  assert.deepEqual(adoRepos({ repos: [], repo: "old" }), ["old"], "a settings.json from before repos keeps working");
  assert.deepEqual(adoRepos({ repo: "old" }), ["old"]);
  assert.deepEqual(adoRepos({ repos: ["a", "a", "b"] }), ["a", "b"], "each name once");
  assert.deepEqual(adoRepos({ repos: [], repo: null }), []);
  assert.deepEqual(adoRepos(undefined), []);
});

test("azure_devops.repos is a list of names; anything else falls back and is named", () => {
  assert.deepEqual(resolveSettings({ azure_devops: { repos: ["a", "b"] } }).values.azure_devops.repos, ["a", "b"]);
  assert.deepEqual(resolveSettings({}).values.azure_devops.repos, []);
  const bad = resolveSettings({ azure_devops: { repos: ["a", ""] } });
  assert.deepEqual(bad.invalid, ["azure_devops.repos"]);
  assert.deepEqual(bad.values.azure_devops.repos, []);
  assert.deepEqual(resolveSettings({ azure_devops: { repos: "a" } }).invalid, ["azure_devops.repos"]);
  const saved = setKey({ version: 1, azure_devops: { repo: "old", project: "P" } }, "azure_devops.repos", ["a", "b"]);
  assert.deepEqual(saved.azure_devops, { repo: "old", project: "P", repos: ["a", "b"] }, "other keys are kept");
  assert.throws(() => setKey({}, "azure_devops.repos", ["a", ""]), /invalid value/);
});

test("the PRs of several repos are one list, newest first, each naming its repo; every repo keeps its own baseline", () => {
  const A = repoKey("org", "P", "alpha");
  const B = repoKey("org", "P", "beta");
  let raw = applyFetch(null, A, [pr(10), pr(12)], 1000).next;
  raw = applyFetch(raw, B, [pr(11)], 1000).next;
  assert.deepEqual(rowsForRepos(raw, "org", "P", ["alpha", "beta"]).map((r) => [r.id, r.repo]), [[12, "alpha"], [11, "beta"], [10, "alpha"]]);
  // alpha gets a new PR after its baseline: owed. beta is read for the first time later: that is its own baseline, no toasts.
  const next = applyFetch(raw, A, [pr(10), pr(12), pr(13)], 2000);
  assert.deepEqual(next.owed.map((p) => p.id), [13]);
  const gamma = applyFetch(next.next, repoKey("org", "P", "gamma"), [pr(20), pr(21)], 3000);
  assert.deepEqual(gamma.owed, [], "a newly added repo is a baseline and shows no toasts");
  assert.deepEqual(rowsForRepos(gamma.next, "org", "P", ["alpha", "gamma"]).map((r) => r.id), [21, 20, 13, 12, 10]);
});

test("marking seen in one repo leaves the others' marks; a repo not asked for is not listed", () => {
  const A = repoKey("org", "P", "alpha");
  const B = repoKey("org", "P", "beta");
  let raw = applyFetch(null, A, [pr(1)], 1000).next;
  raw = applyFetch(raw, B, [pr(2)], 1000).next;
  raw = applyFetch(raw, A, [pr(1), pr(3)], 2000).next;
  raw = applyFetch(raw, B, [pr(2), pr(4)], 2000).next;
  raw = markSeen(raw, A, 3);
  const rows = rowsForRepos(raw, "org", "P", ["alpha", "beta"]);
  assert.deepEqual(rows.map((r) => [r.id, r.unseen]), [[4, true], [3, false], [2, false], [1, false]]);
  assert.deepEqual(rowsForRepos(raw, "org", "P", ["alpha"]).map((r) => r.id), [3, 1]);
  assert.deepEqual(rowsForRepos(raw, "org", "P", []), []);
});
