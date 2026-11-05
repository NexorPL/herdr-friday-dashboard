import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMd, renderMd, addLine, cleanLine, keepsEveryLine, editMd, isMissingError, moveLines, onlyMoved, CHANGED } from "../mods/friday/core/mdfile.js";

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
  assert.deepEqual(r, { ok: false, message: "refused: it would change other lines" });
  assert.equal(f.text, "a\nb\nc\n");
});

test("an unchanged result writes nothing", async () => {
  const f = disk("a\n");
  assert.deepEqual(await editMd(f.io, "x.md", (t) => t), { ok: true, changed: false });
  assert.deepEqual(f.writes, []);
});

test("moving lines keeps every line's text and terminator", () => {
  // a b c d: c goes to the top
  const r = moveLines("a\nb\nc\nd\n", { from: 2, to: 0 });
  assert.equal(r.text, "c\na\nb\nd\n");
  assert.deepEqual(r.plan, { from: 2, count: 1, at: 0, added: [] });
  assert.ok(onlyMoved("a\nb\nc\nd\n", r.text, r.plan));
  // a block of two moves down; mixed CRLF and LF stay per line
  const m = moveLines("a\r\nb\nc\r\nd\n", { from: 0, count: 2, to: 2 });
  assert.equal(m.text, "c\r\nd\na\r\nb\n");
  assert.ok(onlyMoved("a\r\nb\nc\r\nd\n", m.text, m.plan));
  // a move that changes nothing gives the same text
  assert.equal(moveLines("a\nb\n", { from: 1, to: 1 }).text, "a\nb\n");
  // the BOM stays
  assert.equal(moveLines(`${BOM}a\nb\n`, { from: 1, to: 0 }).text, `${BOM}b\na\n`);
  // bounds outside the file are refused
  for (const bad of [{ from: 2, to: 0 }, { from: -1, to: 0 }, { from: 0, to: 2 }, { from: 0, count: 0, to: 0 }, { from: 0, count: 3, to: 0 }, { from: 0, to: 0.5 }]) {
    assert.equal(moveLines("a\nb\n", bad), null, JSON.stringify(bad));
  }
});

test("moving around a missing final newline follows the last-line rule", () => {
  // the open last line moves away: it takes the terminator and the new last line has none
  const up = moveLines("a\nb\nc", { from: 2, to: 0 });
  assert.equal(up.text, "c\na\nb");
  assert.ok(onlyMoved("a\nb\nc", up.text, up.plan));
  // a line moves behind the open last line
  const down = moveLines("a\nb\r\nc", { from: 0, to: 2 });
  assert.equal(down.text, "b\r\nc\na");
  assert.ok(onlyMoved("a\nb\r\nc", down.text, down.plan));
  // the old last line takes the file's first terminator
  const crlf = moveLines("a\r\nb\r\nc", { from: 2, to: 0 });
  assert.equal(crlf.text, "c\r\na\r\nb");
  assert.ok(onlyMoved("a\r\nb\r\nc", crlf.text, crlf.plan));
  // a file with a final newline keeps it
  assert.equal(moveLines("a\nb\nc\n", { from: 2, to: 0 }).text, "c\na\nb\n");
});

test("moving can add headings at the end first", () => {
  const r = moveLines("## TODO\n- a\n", { from: 1, to: 2, added: ["## Done"] });
  assert.equal(r.text, "## TODO\n## Done\n- a\n");
  assert.ok(onlyMoved("## TODO\n- a\n", r.text, r.plan));
  // no final newline: the heading takes it, the moved card ends the file
  const open = moveLines("## TODO\n- a", { from: 1, to: 2, added: ["## Done"] });
  assert.equal(open.text, "## TODO\n## Done\n- a");
  assert.ok(onlyMoved("## TODO\n- a", open.text, open.plan));
  // a heading is one line
  assert.equal(moveLines("a\n", { from: 0, to: 0, added: ["x\ny"] }), null);
});

test("onlyMoved refuses everything that is not exactly the planned move", () => {
  const before = "## TODO\r\n- a\r\n- b\n- c\r\n";
  const { text, plan } = moveLines(before, { from: 1, to: 3 });
  assert.ok(onlyMoved(before, text, plan));
  assert.equal(onlyMoved(before, text.replace("- b", "- B"), plan), false, "a changed line");
  assert.equal(onlyMoved(before, text.replace("- c\r\n", "- c\n"), plan), false, "a normalized terminator");
  assert.equal(onlyMoved(before, `${BOM}${text}`, plan), false, "a BOM that appeared");
  assert.equal(onlyMoved(before, "- b\r\n## TODO\r\n- a\r\n- c\r\n", plan), false, "an outside line reordered");
  assert.equal(onlyMoved(before, text + "- extra\r\n", plan), false, "an added line");
  assert.equal(onlyMoved(before, "## TODO\r\n- a\r\n- b\n", plan), false, "a deleted line");
  assert.equal(onlyMoved(before, text, { ...plan, at: 0 }), false, "a plan that points elsewhere");
  assert.equal(onlyMoved(before, text, null), false);
  // a final newline that appeared or went away
  assert.equal(onlyMoved("a\nb", "b\na\n", { from: 0, count: 1, at: 1 }), false);
  assert.equal(onlyMoved("a\nb\n", "b\na", { from: 0, count: 1, at: 1 }), false);
  // an added heading the plan did not announce
  assert.equal(onlyMoved("a\n", "a\n## Done\n", { from: 0, count: 1, at: 0 }), false);
});
