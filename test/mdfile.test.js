import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMd, renderMd, addLine, cleanLine, keepsEveryLine, editMd, isMissingError, CHANGED } from "../mods/friday/core/mdfile.js";

const BOM = "﻿";

test("parse and render are exact for every kind of file", () => {
  for (const text of ["", "\n", "a", "a\n", "a\r\nb\r\n", "a\nb", `${BOM}a\r\nb`, "a\r\nb\nc\rd\r\n", "\n\n", "lone \r in a line\n"]) {
    assert.equal(renderMd(parseMd(text)), text, JSON.stringify(text));
  }
  assert.deepEqual(parseMd("a\r\nb").lines, [{ text: "a", eol: "\r\n" }, { text: "b", eol: "" }]);
  assert.equal(parseMd(`${BOM}x`).bom, true);
});

test("adding a line keeps LF, CRLF, the BOM and the final newline state", () => {
  assert.equal(addLine("- [ ] a\n- [ ] b\n", "- [ ] c"), "- [ ] a\n- [ ] b\n- [ ] c\n");
  assert.equal(addLine("- [ ] a\r\n- [ ] b\r\n", "- [ ] c"), "- [ ] a\r\n- [ ] b\r\n- [ ] c\r\n");
  assert.equal(addLine(`${BOM}- a\r\n`, "- b"), `${BOM}- a\r\n- b\r\n`);
  // no final newline: the file still has none afterwards, the old last line gets a terminator
  assert.equal(addLine("- a\n- b", "- c"), "- a\n- b\n- c");
  assert.equal(addLine("- a\r\n- b", "- c"), "- a\r\n- b\r\n- c");
  assert.equal(addLine(`${BOM}- a`, "- b"), `${BOM}- a\n- b`);
});

test("adding to a missing or empty file creates one line with a final newline", () => {
  assert.equal(addLine(null, "KEY-1"), "KEY-1\n");
  assert.equal(addLine("", "KEY-1"), "KEY-1\n");
});

test("a mixed-ending file keeps each existing line byte for byte", () => {
  const text = "one\r\ntwo\nthree\r\n\r\n  indented  \n";
  const after = addLine(text, "four");
  assert.ok(after.startsWith(text));
  assert.equal(after, `${text}four\r\n`);
});

test("only a single non-blank line can be added", () => {
  assert.equal(cleanLine("  x  "), "x");
  for (const bad of ["", "   ", null, "a\nb", "a\rb"]) assert.equal(cleanLine(bad), null);
  assert.throws(() => addLine("a\n", "x\ny"));
  assert.throws(() => addLine("a\n", " "));
});

test("the no-deletion guard", () => {
  assert.equal(keepsEveryLine("a\nb\n", "a\nx\nb\n"), true);
  assert.equal(keepsEveryLine("a\nb\n", "a\nb\nc"), true);
  assert.equal(keepsEveryLine("a\nb\n", "a\n"), false);
  assert.equal(keepsEveryLine("a\nb\n", "b\na\n"), false);
  assert.equal(keepsEveryLine(null, "a"), true);
  assert.equal(keepsEveryLine("a\r\nb\r\n", "a\nb\n"), false, "a rewritten line ending is a rewritten line");
  assert.equal(keepsEveryLine("a\r\nb", "a\r\nb\r\nc"), true, "the old last line may gain a terminator");
  assert.equal(keepsEveryLine("a\nb", "a\nb\r\nc"), true);
  assert.equal(keepsEveryLine("a\nb\n", "a\nb\r\nc"), false, "but not a changed one");
  assert.equal(keepsEveryLine(`${BOM}a\n`, "a\nb\n"), false, "the BOM stays");
  assert.equal(keepsEveryLine("a\n", `${BOM}a\nb\n`), false, "and is not added");
  assert.equal(keepsEveryLine(`${BOM}a\n`, `${BOM}a\nb\n`), true);
});

test("only a missing file reads as missing; a real read error is not a missing file", () => {
  for (const m of ["ENOENT: no such file or directory", "No such file or directory (os error 2)", "The system cannot find the file specified. (os error 2)"]) assert.equal(isMissingError(new Error(m)), true, m);
  for (const m of ["Text file exceeds 1 MiB", "permission denied", "EBUSY: resource busy"]) assert.equal(isMissingError(new Error(m)), false, m);
  assert.equal(isMissingError(null), false);
});

/** A fake file with compare-and-swap writes; `beforeWrite` runs once, to change it underneath. */
function disk(initial, { beforeWrite, failWrites = 0 } = {}) {
  const f = { text: initial, writes: [], hook: beforeWrite, fails: failWrites };
  f.io = {
    read: async () => f.text,
    write: async (_p, next, expected) => {
      if (f.hook) { const h = f.hook; f.hook = null; h(f); }
      if (f.fails > 0) { f.fails--; throw new Error("locked"); }
      if (expected !== f.text) throw new Error("The file changed outside Herdr");
      f.text = next;
      f.writes.push(next);
    },
  };
  return f;
}

test("editMd writes the change with the snapshot as the expected content", async () => {
  const f = disk("- a\r\n");
  assert.deepEqual(await editMd(f.io, "x.md", (t) => addLine(t, "- b")), { ok: true, changed: true });
  assert.equal(f.text, "- a\r\n- b\r\n");
});

test("editMd creates a missing file only when asked to add", async () => {
  const f = disk(null);
  assert.deepEqual(await editMd(f.io, "x.md", (t) => addLine(t, "KEY-1")), { ok: true, changed: true });
  assert.equal(f.text, "KEY-1\n");
});

test("a change made underneath is kept: the add is re-applied to the file as it is now", async () => {
  const f = disk("a\n", { beforeWrite: (d) => { d.text = "a\nadded by the owner\n"; } });
  assert.deepEqual(await editMd(f.io, "x.md", (t) => addLine(t, "mine")), { ok: true, changed: true });
  assert.equal(f.text, "a\nadded by the owner\nmine\n");
});

test("a change whose target is gone leaves the file alone with CHANGED", async () => {
  const f = disk("a\nb\n", { beforeWrite: (d) => { d.text = "a\n"; } });
  const edit = (t) => (t.includes("b") ? `${t}x` : null);
  assert.deepEqual(await editMd(f.io, "x.md", edit), { ok: false, message: CHANGED });
  assert.equal(f.text, "a\n");
  assert.deepEqual(f.writes, []);
});

test("two rejected writes give CHANGED, a read failure a message, and nothing is half written", async () => {
  const f = disk("a\n", { failWrites: 2 });
  assert.deepEqual(await editMd(f.io, "x.md", (t) => addLine(t, "b")), { ok: false, message: CHANGED });
  assert.equal(f.text, "a\n");
  const broken = { read: async () => { throw new Error("secret path detail"); }, write: async () => {} };
  assert.deepEqual(await editMd(broken, "x.md", (t) => addLine(t, "b")), { ok: false, message: "could not read the file" });
});

test("a change that would delete a line is refused and never written", async () => {
  const f = disk("a\nb\nc\n");
  const r = await editMd(f.io, "x.md", () => "a\nc\n");
  assert.deepEqual(r, { ok: false, message: "refused: a line would be deleted" });
  assert.equal(f.text, "a\nb\nc\n");
});

test("an unchanged result writes nothing", async () => {
  const f = disk("a\n");
  assert.deepEqual(await editMd(f.io, "x.md", (t) => t), { ok: true, changed: false });
  assert.deepEqual(f.writes, []);
});
