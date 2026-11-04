// Toggling a checkbox and a quick note (Phase 5, R10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toggleCheckbox, onlyToggled, checkboxOf, quickNote, editMd, isTooLargeError, CHANGED } from "../mods/friday/core/mdfile.js";

const BOM = "﻿";
/** A row as todoRows makes it: the raw line, which copy of it this is (`rank`) and how many there were (`count`). */
const row = (text, rank = 0, count = 1) => ({ text, rank, count });

function disk(initial, beforeWrite) {
  const f = { text: initial, hook: beforeWrite };
  f.io = {
    read: async () => f.text,
    write: async (_p, next, expected) => {
      if (f.hook) { const h = f.hook; f.hook = null; h(f); }
      if (expected !== f.text) throw new Error("changed");
      f.text = next;
    },
  };
  return f;
}

test("toggling flips only the bracket character and keeps every terminator", () => {
  assert.equal(toggleCheckbox("- [ ] a\n- [ ] b\n", row("- [ ] b"), 1), "- [ ] a\n- [x] b\n");
  assert.equal(toggleCheckbox("- [ ] a\r\n- [ ] b\r\n", row("- [ ] a"), 0), "- [x] a\r\n- [ ] b\r\n");
  assert.equal(toggleCheckbox("- [x] a\n", row("- [x] a"), 0), "- [ ] a\n");
  assert.equal(toggleCheckbox("- [X] a\n", row("- [X] a"), 0), "- [ ] a\n");
  assert.equal(toggleCheckbox("* [ ] a  b\n", row("* [ ] a  b"), 0), "* [x] a  b\n");
});

test("toggling a mixed-ending, BOM or final-newline-less file changes one character", () => {
  assert.equal(toggleCheckbox("x\r\n- [ ] a\n\t- [ ] b\r\nlast", row("\t- [ ] b"), 2), "x\r\n- [ ] a\n\t- [x] b\r\nlast");
  assert.equal(toggleCheckbox(`${BOM}- [ ] a`, row("- [ ] a"), 0), `${BOM}- [x] a`);
  assert.equal(toggleCheckbox("- [ ] a\r\n- [ ] b", row("- [ ] b"), 1), "- [ ] a\r\n- [x] b");
});

test("a unique line moved by edits is still found; a missing one is refused", () => {
  assert.equal(toggleCheckbox("new\n- [ ] a\n- [ ] b\n", row("- [ ] b"), 1), "new\n- [ ] a\n- [x] b\n");
  assert.equal(toggleCheckbox("- [ ] a\n", row("- [ ] gone"), 0), null);
  assert.equal(toggleCheckbox("- [x] a\n", row("- [ ] a"), 0), null, "already toggled by someone else");
  assert.equal(toggleCheckbox("plain\n", row("plain"), 0), null);
});

const WH = "## Work\n- [ ] email\n## Home\n- [ ] email\n";
const HOME = row("- [ ] email", 1, 2); // the Home copy, drawn from WH at line 3
const WORK = row("- [ ] email", 0, 2);

test("two equal lines under two headings: a copy is toggled only where it was drawn", () => {
  assert.equal(toggleCheckbox(WH, HOME, 3), "## Work\n- [ ] email\n## Home\n- [x] email\n");
  assert.equal(toggleCheckbox(WH, WORK, 1), "## Work\n- [x] email\n## Home\n- [ ] email\n");
});

test("lines added above two equal rows: never the wrong copy (the Work email stays open)", () => {
  const two = `x\ny\n${WH}`; // two lines added on top: hint 3 is now the Work email
  assert.equal(toggleCheckbox(two, HOME, 3), null);
  assert.equal(toggleCheckbox(two, WORK, 1), null);
  const one = `x\n${WH}`;
  assert.equal(toggleCheckbox(one, HOME, 3), null);
  assert.equal(toggleCheckbox(one, WORK, 1), null);
  assert.equal(toggleCheckbox(`x\ny\nz\n${WH}`, HOME, 3), null);
});

test("the same through editMd's retry: a file changed underneath is refused, never mis-toggled", async () => {
  const f = disk(WH, (d) => { d.text = `x\ny\n${WH}`; });
  assert.deepEqual(await editMd(f.io, "x.md", (t) => toggleCheckbox(t, HOME, 3), onlyToggled), { ok: false, message: CHANGED });
  assert.equal(f.text, `x\ny\n${WH}`);
});

test("a deleted target with a same-body sibling is not toggled in its place", () => {
  assert.equal(toggleCheckbox("## Work\n- [ ] email\n## Home\n", HOME, 3), null);
  assert.equal(toggleCheckbox("## Work\n- [ ] email\n", row("- [ ] email"), 3), "## Work\n- [x] email\n", "a row that was unique may have moved");
});

test("a unique row with an identical line pasted above is refused, not guessed", () => {
  assert.equal(toggleCheckbox("- [ ] email\n## Home\n- [ ] email\n", row("- [ ] email"), 1), null);
});

test("a stale open row is not applied to a done line or to an open duplicate", () => {
  assert.equal(toggleCheckbox("- [x] a\n- [x] a\n", row("- [ ] a"), 0), null, "line 0 is now done");
  assert.equal(toggleCheckbox("- [x] a\n- [ ] a\n", row("- [ ] a", 0, 2), 0), null, "the open duplicate below is not the row that was drawn at line 0");
});

test("onlyToggled accepts one flipped box and nothing else", () => {
  assert.equal(onlyToggled("- [ ] a\nb\n", "- [x] a\nb\n"), true);
  assert.equal(onlyToggled("- [ ] a\n", "- [ ] a\n"), true);
  assert.equal(onlyToggled("- [ ] a\n- [ ] b\n", "- [x] a\n- [x] b\n"), false);
  assert.equal(onlyToggled("- [ ] a\n", "- [x] changed\n"), false);
  assert.equal(onlyToggled("- [ ] a\r\n", "- [x] a\n"), false);
  assert.equal(onlyToggled("- [ ] a\n", ""), false);
  assert.equal(onlyToggled("a\n", "b\n"), false);
  assert.deepEqual(checkboxOf("- [x]"), { done: true, body: "" });
  assert.equal(checkboxOf("- [] a"), null);
});

test("onlyToggled refuses changed indent, marker or spacing around the box", () => {
  assert.equal(onlyToggled("  - [ ] a\n", "- [x] a\n"), false);
  assert.equal(onlyToggled("- [ ] a\n", "* [x] a\n"), false);
  assert.equal(onlyToggled("- [ ] a\n", "-  [x] a\n"), false);
  assert.equal(onlyToggled("- [ ] a\n", "- [x]  a\n"), false);
  assert.equal(onlyToggled("- [ ] a\n", "- [y] a\n"), false);
  assert.equal(onlyToggled("- [ ] a\n", "- [x] a\n"), true);
});

test("editMd toggles against a file changed underneath, and refuses when the line is gone", async () => {
  const edit = (t) => toggleCheckbox(t, row("- [ ] b"), 1);
  const f = disk("- [ ] a\n- [ ] b\n", (d) => { d.text = "top\r\n- [ ] a\n- [ ] b\n"; });
  assert.deepEqual(await editMd(f.io, "x.md", edit, onlyToggled), { ok: true, changed: true });
  assert.equal(f.text, "top\r\n- [ ] a\n- [x] b\n");
  const g = disk("- [ ] a\n- [ ] b\n", (d) => { d.text = "- [ ] a\n"; });
  assert.deepEqual(await editMd(g.io, "x.md", edit, onlyToggled), { ok: false, message: CHANGED });
  assert.equal(g.text, "- [ ] a\n");
  const h = disk("- [ ] a\n");
  assert.equal((await editMd(h.io, "x.md", () => "- [x] a\n- [x] a\n", onlyToggled)).ok, false, "a toggle that adds a line is refused");
  assert.equal(h.text, "- [ ] a\n");
});

test("a read error that says the file is too large is told apart", async () => {
  assert.equal(isTooLargeError(new Error("Text file exceeds 1 MiB")), true);
  assert.equal(isTooLargeError(new Error("permission denied")), false);
  const big = { read: async () => { throw new Error("Text file exceeds 1 MiB"); }, write: async () => {} };
  assert.deepEqual(await editMd(big, "x.md", (t) => t), { ok: false, message: "file too large" });
});

test("a quick note goes on top, after the first heading, in the file's own line ending", () => {
  assert.equal(quickNote("# Notes\nold\n", "new"), "# Notes\nnew\nold\n");
  assert.equal(quickNote("# Notes\r\nold\r\n", "new"), "# Notes\r\nnew\r\nold\r\n");
  assert.equal(quickNote("old\nolder\n", "new"), "new\nold\nolder\n");
  assert.equal(quickNote(`${BOM}# N\nold`, "new"), `${BOM}# N\nnew\nold`);
  assert.equal(quickNote("# Notes", "new"), "# Notes\nnew", "heading is the last line, no final newline: same as an append");
  assert.equal(quickNote("# Notes\n", "new"), "# Notes\nnew\n");
  assert.equal(quickNote("a\nb", "new"), "new\na\nb", "no final newline stays");
  assert.equal(quickNote(null, "first"), "first\n");
  assert.throws(() => quickNote("a\n", "two\nlines"));
});
