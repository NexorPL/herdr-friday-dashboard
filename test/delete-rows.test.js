import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteListRow } from "../mods/friday/core/lists.js";
import { deleteFavorite, favoriteKeys } from "../mods/friday/core/favorites.js";
import { CHANGED } from "../mods/friday/core/mdfile.js";

const BOM = "﻿";
const fake = (text) => {
  const f = { text, writes: 0 };
  f.io = { read: async () => f.text, write: async (_p, next, prev) => { if (prev !== f.text) throw new Error("changed"); f.text = next; f.writes++; } };
  return f;
};

test("deleting a priority removes its line and nothing else", async () => {
  const f = fake("# Today\n1. DEMO-12 fix it\n- Prepare the demo\n\n* DEMO-99 unknown\n");
  assert.deepEqual(await deleteListRow(f.io, "priorities.md", "priorities", 0, "DEMO-12 fix it"), { ok: true, changed: true });
  assert.equal(f.text, "# Today\n- Prepare the demo\n\n* DEMO-99 unknown\n", "the heading, the blank line and the other rows stay byte for byte");
});

test("a priority is only deleted while its line is the one that was drawn", async () => {
  const f = fake("- a\n- b\n");
  assert.deepEqual(await deleteListRow(f.io, "priorities.md", "priorities", 1, "a"), { ok: false, message: CHANGED }, "row 1 is b now");
  assert.deepEqual(await deleteListRow(f.io, "priorities.md", "priorities", 5, "b"), { ok: false, message: CHANGED }, "no such row");
  assert.equal(f.writes, 0);
  assert.equal(f.text, "- a\n- b\n");
});

test("deleting keeps CRLF, a BOM and a missing final newline", async () => {
  const f = fake(`${BOM}- a\r\n- b\r\n- c`);
  assert.deepEqual(await deleteListRow(f.io, "priorities.md", "priorities", 2, "c"), { ok: true, changed: true });
  assert.equal(f.text, `${BOM}- a\r\n- b\r\n`, "the last row goes; the earlier lines keep their terminators and the BOM");
  assert.deepEqual(await deleteListRow(f.io, "priorities.md", "priorities", 0, "a"), { ok: true, changed: true });
  assert.equal(f.text, `${BOM}- b\r\n`);
});

test("deleting a favorite removes the first line of its key", async () => {
  const f = fake("# my keys\nAA-1\nsome text\nBB-2 note\nAA-1 again\nCC-3\n");
  assert.deepEqual(await deleteFavorite(f.io, "favorites.md", "BB-2"), { ok: true, changed: true });
  assert.equal(f.text, "# my keys\nAA-1\nsome text\nAA-1 again\nCC-3\n", "text on other lines stays");
  assert.deepEqual(favoriteKeys(f.text), ["AA-1", "CC-3"]);
  assert.deepEqual(await deleteFavorite(f.io, "favorites.md", "AA-1"), { ok: true, changed: true });
  assert.deepEqual(favoriteKeys(f.text), ["AA-1", "CC-3"], "a key repeated on a later line shows again");
});

test("deleting a favorite that is gone gives the changed message and writes nothing", async () => {
  const f = fake("AA-1\n");
  assert.deepEqual(await deleteFavorite(f.io, "favorites.md", "ZZ-9"), { ok: false, message: CHANGED });
  assert.equal(f.writes, 0);
});
