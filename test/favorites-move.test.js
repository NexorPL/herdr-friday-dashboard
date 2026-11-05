import { test } from "node:test";
import assert from "node:assert/strict";
import { moveKey, moveFavorite, favoriteKeys } from "../mods/friday/core/favorites.js";
import { onlyMoved, CHANGED } from "../mods/friday/core/mdfile.js";

const BOM = "﻿";
const FILE = "# my keys\nAA-1\nsome text\nBB-2 note\nAA-1 again\nCC-3\n";

test("a favorite moves past the nearest line holding another key", () => {
  const down = moveKey(FILE, "AA-1", "down");
  assert.equal(down.text, "# my keys\nBB-2 note\nAA-1\nsome text\nAA-1 again\nCC-3\n", "the next key's line goes above this one; text and the repeated key stay where they are");
  assert.deepEqual(favoriteKeys(down.text), ["BB-2", "AA-1", "CC-3"]);
  const up = moveKey(FILE, "CC-3", "up");
  assert.equal(up.text, "# my keys\nAA-1\nsome text\nCC-3\nBB-2 note\nAA-1 again\n");
  for (const r of [down, up]) assert.ok(onlyMoved(FILE, r.text, r.plan));
});

test("nothing moves at the edges, and a missing key is not found", () => {
  assert.equal(moveKey(FILE, "AA-1", "up").text, FILE);
  assert.equal(moveKey(FILE, "CC-3", "down").text, FILE);
  assert.equal(moveKey(FILE, "ZZ-9", "up"), null);
  assert.equal(moveKey(null, "AA-1", "up"), null);
  // a line with two keys is read by its first key, as favoriteKeys does
  assert.equal(moveKey("AA-1 and BB-2\nCC-3\n", "BB-2", "up"), null);
  assert.deepEqual(favoriteKeys(moveKey("AA-1 and BB-2\nCC-3\n", "CC-3", "up").text), ["CC-3", "AA-1"]);
});

test("line endings, the BOM and a missing final newline are kept", () => {
  const crlf = `${BOM}AA-1\r\nBB-2\nCC-3`;
  const r = moveKey(crlf, "CC-3", "up");
  assert.equal(r.text, `${BOM}AA-1\r\nCC-3\r\nBB-2`); // the old last line takes the file's first terminator
  assert.ok(onlyMoved(crlf, r.text, r.plan));
  assert.equal(moveKey(crlf, "AA-1", "down").text, `${BOM}BB-2\nAA-1\r\nCC-3`);
});

test("moveFavorite writes through the guard, and a gone key gives the changed message", async () => {
  const f = { text: FILE, writes: 0 };
  const io = { read: async () => f.text, write: async (_p, text, prev) => { if (prev !== f.text) throw new Error("changed"); f.text = text; f.writes++; } };
  assert.deepEqual(await moveFavorite(io, "favorites.md", "BB-2", "up"), { ok: true, changed: true });
  assert.deepEqual(favoriteKeys(f.text), ["BB-2", "AA-1", "CC-3"]);
  assert.deepEqual(await moveFavorite(io, "favorites.md", "BB-2", "up"), { ok: true, changed: false }, "at the top: nothing is written");
  assert.equal(f.writes, 1);
  assert.deepEqual(await moveFavorite(io, "favorites.md", "ZZ-9", "up"), { ok: false, message: CHANGED });
});

test("a repeated key does not break the swap: rows and moves stay in step", () => {
  for (const [text, key, dir, rows] of [
    ["AA-1\nBB-2\nAA-1\nCC-3", "BB-2", "down", ["AA-1", "CC-3", "BB-2"]],
    ["AA-1\nAA-1\nBB-2", "AA-1", "down", ["BB-2", "AA-1"]],
    ["AA-1\nBB-2\nAA-1\nCC-3", "CC-3", "up", ["AA-1", "CC-3", "BB-2"]],
    ["AA-1\nBB-2\nAA-1\nCC-3", "AA-1", "down", ["BB-2", "AA-1", "CC-3"]],
  ]) {
    const r = moveKey(text, key, dir);
    assert.deepEqual(favoriteKeys(r.text), rows, `${key} ${dir} in ${JSON.stringify(text)}`);
    assert.ok(onlyMoved(text, r.text, r.plan));
  }
});
