// Toggling a checkbox and a quick note (Phase 5, R10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toggleCheckbox, onlyToggled, checkboxOf, quickNote, editMd, CHANGED } from "../mods/friday/core/mdfile.js";

const BOM = "﻿";
const on = (body) => ({ body, done: false });

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
  assert.equal(toggleCheckbox("- [ ] a\n- [ ] b\n", on("b"), 1), "- [ ] a\n- [x] b\n");
  assert.equal(toggleCheckbox("- [ ] a\r\n- [ ] b\r\n", on("a")), "- [x] a\r\n- [ ] b\r\n");
  assert.equal(toggleCheckbox("- [x] a\n", { body: "a", done: true }), "- [ ] a\n");
  assert.equal(toggleCheckbox("- [X] a\n", { body: "a", done: true }), "- [ ] a\n");
  assert.equal(toggleCheckbox("* [ ] a  b\n", on("a  b")), "* [x] a  b\n");
});

test("toggling a mixed-ending, BOM or final-newline-less file changes one character", () => {
  assert.equal(toggleCheckbox("x\r\n- [ ] a\n\t- [ ] b\r\nlast", on("b"), 2), "x\r\n- [ ] a\n\t- [x] b\r\nlast");
  assert.equal(toggleCheckbox(`${BOM}- [ ] a`, on("a")), `${BOM}- [x] a`);
  assert.equal(toggleCheckbox("- [ ] a\r\n- [ ] b", on("b"), 1), "- [ ] a\r\n- [x] b");
});

test("toggling finds the line by content in a changed file, nearest the old index", () => {
  assert.equal(toggleCheckbox("new\n- [ ] a\n- [ ] b\n", on("b"), 1), "new\n- [ ] a\n- [x] b\n");
  assert.equal(toggleCheckbox("- [ ] a\n- [ ] a\n- [ ] a\n", on("a"), 2), "- [ ] a\n- [ ] a\n- [x] a\n");
  assert.equal(toggleCheckbox("- [ ] a\n", on("gone")), null);
  assert.equal(toggleCheckbox("- [x] a\n", on("a")), null, "already toggled by someone else");
  assert.equal(toggleCheckbox("plain\n", on("plain")), null);
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

test("editMd toggles against a file changed underneath, and refuses when the line is gone", async () => {
  const edit = (t) => toggleCheckbox(t, on("b"), 1);
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

test("a quick note appends one line and leaves the rest byte for byte", () => {
  assert.equal(quickNote("n1\r\nn2\r\n", "call back"), "n1\r\nn2\r\ncall back\r\n");
  assert.equal(quickNote("n1\nn2", "x"), "n1\nn2\nx");
  assert.equal(quickNote(`${BOM}n1\r\n`, "x"), `${BOM}n1\r\nx\r\n`);
  assert.equal(quickNote(null, "first"), "first\n");
  assert.throws(() => quickNote("a\n", "two\nlines"));
});
