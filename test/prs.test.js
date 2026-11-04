import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFetch, markSeen, rowsFor, prToast, repoKey, KEEP_INACTIVE_MS } from "../mods/friday/core/prs.js";
import { updateJson } from "../mods/friday/core/datafile.js";

const K = repoKey("o", "P", "r");
const pr = (id, extra = {}) => ({ id, title: `PR ${id}`, author: "Ann", created_at: "", is_draft: false, url: `https://x.test/${id}`, ...extra });
const T = 1_000_000;
const DAY = 24 * 3_600_000;

test("the first fetch of a repo is the baseline: nothing unseen, no toast", () => {
  const { next, owed } = applyFetch(null, K, [pr(1), pr(2, { is_draft: true })], T);
  assert.deepEqual(owed, []);
  assert.equal(next.repos[K].baseline_set, true);
  assert.deepEqual(rowsFor(next, K).map((r) => [r.id, r.unseen]), [[2, false], [1, false]]);
});

test("a PR first seen later is unseen and owes one toast; the next fetch owes none", () => {
  const base = applyFetch(null, K, [pr(1)], T).next;
  const a = applyFetch(base, K, [pr(1), pr(3)], T + 1);
  assert.deepEqual(a.owed.map((o) => o.id), [3]);
  assert.deepEqual(rowsFor(a.next, K).map((r) => [r.id, r.unseen]), [[3, true], [1, false]]);
  assert.deepEqual(applyFetch(a.next, K, [pr(1), pr(3)], T + 2).owed, []);
});

test("a new draft is unseen but waits; it owes a toast when it becomes ready, once", () => {
  const base = applyFetch(null, K, [], T).next;
  const a = applyFetch(base, K, [pr(4, { is_draft: true })], T + 1);
  assert.deepEqual(a.owed, []);
  assert.equal(rowsFor(a.next, K)[0].unseen, true);
  assert.deepEqual(applyFetch(a.next, K, [pr(4, { is_draft: true })], T + 2).owed, []);
  const ready = applyFetch(a.next, K, [pr(4)], T + 3);
  assert.deepEqual(ready.owed.map((o) => o.id), [4]);
  assert.deepEqual(applyFetch(ready.next, K, [pr(4)], T + 4).owed, []);
});

test("a baseline draft that becomes ready is unseen and owes a toast", () => {
  const base = applyFetch(null, K, [pr(5, { is_draft: true })], T).next;
  assert.equal(rowsFor(base, K)[0].unseen, false);
  const r = applyFetch(base, K, [pr(5)], T + 1);
  assert.deepEqual(r.owed.map((o) => o.id), [5]);
  assert.equal(rowsFor(r.next, K)[0].unseen, true);
});

test("a PR that leaves the list goes inactive, and coming back is not new", () => {
  const base = applyFetch(null, K, [pr(1)], T).next;
  const gone = applyFetch(base, K, [], T + 1);
  assert.deepEqual(rowsFor(gone.next, K), []);
  assert.equal(gone.next.repos[K].prs["1"].active, false);
  const back = applyFetch(gone.next, K, [pr(1)], T + 2);
  assert.deepEqual(back.owed, []);
  assert.deepEqual(rowsFor(back.next, K).map((r) => [r.id, r.unseen]), [[1, false]]);
});

test("inactive rows older than 30 days are pruned, active and younger ones are not", () => {
  let s = applyFetch(null, K, [pr(1), pr(2)], T).next;
  s = applyFetch(s, K, [pr(2)], T + 1).next; // 1 goes inactive, last seen at T
  const young = applyFetch(s, K, [pr(2)], T + KEEP_INACTIVE_MS - 1).next;
  assert.ok(young.repos[K].prs["1"]);
  const old = applyFetch(s, K, [pr(2)], T + KEEP_INACTIVE_MS + 1).next;
  assert.equal(old.repos[K].prs["1"], undefined);
  assert.ok(old.repos[K].prs["2"]);
});

test("each repo has its own baseline and other repos are kept", () => {
  const a = applyFetch(null, K, [pr(1)], T).next;
  const other = repoKey("o", "P", "other");
  const b = applyFetch(a, other, [pr(9)], T + 1);
  assert.deepEqual(b.owed, [], "another repo starts with its own baseline");
  assert.deepEqual(rowsFor(b.next, K).map((r) => r.id), [1]);
  assert.deepEqual(rowsFor(b.next, other).map((r) => r.id), [9]);
});

test("mark seen clears one PR or every PR of the repo", () => {
  const base = applyFetch(null, K, [], T).next;
  const s = applyFetch(base, K, [pr(1), pr(2)], T + 1).next;
  assert.deepEqual(rowsFor(markSeen(s, K, 1), K).map((r) => [r.id, r.unseen]), [[2, true], [1, false]]);
  assert.deepEqual(rowsFor(markSeen(s, K), K).map((r) => r.unseen), [false, false]);
  assert.deepEqual(rowsFor(markSeen(null, K), K), []);
});

test("toast wording", () => {
  assert.deepEqual(prToast({ id: 812, title: "Add retry", author: "Ann" }), { title: "New PR !812", body: "Add retry — Ann" });
});

// R11: through the real compare-and-swap writer, two copies racing for one new PR, and a restart.
function memIo(files) {
  return {
    read: async (p) => files[p] ?? null,
    write: async (p, text, expected) => {
      if ((files[p] ?? null) !== expected) throw new Error("changed underneath");
      files[p] = text;
    },
  };
}
const poll = (io, prs, now) => {
  let owed = [];
  return updateJson(io, "prs.json", (raw) => {
    const r = applyFetch(raw, K, prs, now);
    owed = r.owed;
    return r.next;
  }, now, false).then(() => owed);
};

test("R11: a new PR gets one toast, also across a restart and between racing copies", async () => {
  const files = {};
  const io = memIo(files);
  assert.deepEqual(await poll(io, [pr(1)], T), [], "baseline");
  const [a, b] = await Promise.all([poll(io, [pr(1), pr(2)], T + 1), poll(io, [pr(1), pr(2)], T + 1)]);
  assert.equal(a.length + b.length, 1, "exactly one of two copies shows the toast");
  assert.deepEqual(await poll(io, [pr(1), pr(2)], T + 2), []);
  // a restart: nothing but prs.json is left
  assert.deepEqual(await poll(memIo({ ...files }), [pr(1), pr(2)], T + DAY), []);
  assert.deepEqual((await poll(io, [pr(1), pr(2), pr(3)], T + 3)).map((o) => o.id), [3]);
});

test("an organization switch re-baselines silently: the key includes the organization", () => {
  const a = applyFetch(null, repoKey("org1", "P", "r"), [pr(1)], T).next;
  const b = applyFetch(a, repoKey("org2", "P", "r"), [pr(1), pr(2)], T + 1);
  assert.deepEqual(b.owed, [], "no toast on the new organization's first fetch");
  assert.deepEqual(rowsFor(b.next, repoKey("org2", "P", "r")).map((r) => r.unseen), [false, false]);
  assert.deepEqual(rowsFor(b.next, repoKey("org1", "P", "r")).map((r) => r.id), [1], "the old organization is kept");
});

test("a damaged row in prs.json counts as absent", () => {
  const raw = { version: 1, repos: { [K]: { baseline_set: true, prs: { 1: "junk", 2: null, 3: 5 } } } };
  const r = applyFetch(raw, K, [pr(1), pr(9)], T);
  assert.deepEqual(r.owed.map((o) => o.id).sort(), [1, 9], "a damaged row is a new PR");
  assert.deepEqual(Object.keys(r.next.repos[K].prs).sort(), ["1", "9"], "damaged rows not in the fetch are dropped");
});

test("inactive rows keep four fields and are pruned in every repo", () => {
  const other = repoKey("o", "P", "other");
  const row = { title: "t", author: "a", url: "u", created_at: "c", first_seen_at: 1, unseen: true, is_draft: true, notified: true, active: false };
  const raw = { version: 1, repos: {
    [K]: { baseline_set: true, prs: { 1: { ...row, last_seen_at: T }, 2: { ...row, last_seen_at: T - KEEP_INACTIVE_MS - 5 } } },
    [other]: { baseline_set: true, prs: { 7: { ...row, last_seen_at: T - KEEP_INACTIVE_MS - 5 }, 8: { ...row, last_seen_at: T - 10 } } },
  } };
  const n = applyFetch(raw, K, [], T).next;
  assert.deepEqual(n.repos[K].prs, { 1: { active: false, is_draft: true, notified: true, last_seen_at: T } });
  assert.deepEqual(Object.keys(n.repos[other].prs), ["8"], "another repo is pruned too");
  assert.equal(n.repos[other].baseline_set, true);
  // a comeback of a slimmed row is not new and not unseen
  const back = applyFetch(n, K, [pr(1, { is_draft: true })], T + 1);
  assert.deepEqual(back.owed, []);
  assert.deepEqual(rowsFor(back.next, K).map((r) => [r.id, r.unseen, r.title]), [[1, false, "PR 1"]]);
});
