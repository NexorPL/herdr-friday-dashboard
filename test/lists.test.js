import { test } from "node:test";
import assert from "node:assert/strict";
import { todoRows, noteRows, priorityRows, priorityLine, noteLine, toggleTodo, addEntry, ADD_ERROR } from "../mods/friday/core/lists.js";

const issues = [{ key: "DEMO-12", summary: "Tidy the settings form", status: "In Progress", url: "https://x.example/browse/DEMO-12" }];
const PRI = "# Today\n1. DEMO-12 fix it\n- Prepare the demo\n\n* DEMO-99 unknown\n";

test("priority rows show the key, Jira's summary and status, and the line's own annotation", () => {
  const rows = priorityRows(PRI, issues);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { n: 1, text: "DEMO-12 fix it", key: "DEMO-12", note: "fix it", summary: "Tidy the settings form", status: "In Progress", url: issues[0].url, label: "Tidy the settings form — fix it" });
  assert.equal(priorityRows("DEMO-12\n", issues)[0].label, "Tidy the settings form");
  assert.equal(rows[1].label, "Prepare the demo");
  assert.equal(rows[1].key, null);
  assert.equal(rows[2].key, "DEMO-99");
  assert.equal(rows[2].status, "", "an unknown key has no status");
  assert.equal(rows[2].label, "unknown", "and shows the line's own text beside the key");
});

test("priority rows are plain text without Jira data", () => {
  for (const none of [null, undefined, []]) {
    const rows = priorityRows(PRI, none);
    assert.deepEqual(rows.map((r) => [r.label, r.status, r.url, r.summary]), [["fix it", "", null, ""], ["Prepare the demo", "", null, ""], ["unknown", "", null, ""]]);
    assert.equal(rows[0].key, "DEMO-12");
  }
  assert.deepEqual(priorityRows(null, issues), []);
});

test("priority headings are judged on the raw line, so items that mention # still show", () => {
  const rows = priorityRows("# Heading\n## Sub\n3. # Ship it\n- #1 thing\n#2 bare\n", null);
  assert.deepEqual(rows.map((r) => r.text), ["# Ship it", "#1 thing", "#2 bare"]);
});

test("todo and note rows", () => {
  assert.deepEqual(todoRows("# T\n- [ ] a\r\n- [x] b\nplain\n"), [{ line: 1, text: "- [ ] a", count: 1, rank: 0, done: false, body: "a" }, { line: 2, text: "- [x] b", count: 1, rank: 0, done: true, body: "b" }]);
  assert.deepEqual(todoRows("- [ ] a\n- [ ] a\n").map((r) => [r.count, r.rank]), [[2, 0], [2, 1]]);
  assert.deepEqual(noteRows("#1 idea\n## H\n"), [{ line: 0, text: "#1 idea" }]);
  assert.deepEqual(noteRows("# Notes\none\n\n  two \n"), [{ line: 1, text: "one" }, { line: 3, text: "two" }]);
  assert.deepEqual(todoRows(null), []);
});

function disk(initial) {
  const f = { text: initial };
  f.io = { read: async () => f.text, write: async (_p, next, expected) => { if (expected !== f.text) throw new Error("changed"); f.text = next; } };
  return f;
}

test("toggleTodo writes through the R10 writer and refuses a line that is gone", async () => {
  const f = disk("- [ ] a\r\n- [ ] b");
  assert.equal((await toggleTodo(f.io, "t.md", todoRows(f.text)[1])).ok, true);
  assert.equal(f.text, "- [ ] a\r\n- [x] b");
  f.text = "- [ ] a\n";
  assert.equal((await toggleTodo(f.io, "t.md", { line: 1, text: "- [ ] b", count: 1, rank: 0, done: false, body: "b" })).message, "file changed, try again");
  assert.equal(f.text, "- [ ] a\n");
});

test("a priority is added in the file's own list style, never as bare text or a heading", () => {
  assert.equal(priorityLine("1. a\n2. b\n", "c"), "3. c");
  assert.equal(priorityLine("1) a\n2) b\n", "c"), "3) c");
  assert.equal(priorityLine("- a\n- b\n", "c"), "- c");
  assert.equal(priorityLine("* a\n", "c"), "* c");
  assert.equal(priorityLine("+ a\n", "c"), "+ c");
  assert.equal(priorityLine("", "c"), "- c");
  assert.equal(priorityLine(null, "c"), "- c");
  assert.equal(priorityLine("# Today\nplain line\n", "c"), "- c");
  assert.equal(priorityLine("1. a\n", "# big"), "2. # big", "text starting with # is not a heading");
  assert.equal(priorityLine("- a\n", "# big"), "- # big");
  // a lazy continuation of the last numbered item, and a sub-item, do not break the numbering
  assert.equal(priorityLine("1. a\n2. b\ncontinues b\n", "c"), "3. c");
  assert.equal(priorityLine("1. a\n2. b\n   - sub\n   more\n", "c"), "3. c");
  assert.equal(priorityLine("9. a\n", "c"), "10. c");
});

test("addEntry: todos at the end, notes on top after the heading with a timestamp, priorities in style", async () => {
  const now = new Date(2026, 10, 4, 9, 5);
  assert.equal(noteLine("idea", now), "- 2026-11-04 09:05 idea");
  const f = disk("- [ ] a\n");
  await addEntry(f.io, "t.md", "todos", " call the bank ", now);
  assert.equal(f.text, "- [ ] a\n- [ ] call the bank\n");
  const n = disk("# Notes\r\n- 2026-11-03 08:00 older\r\n");
  await addEntry(n.io, "n.md", "notes", "idea", now);
  assert.equal(n.text, "# Notes\r\n- 2026-11-04 09:05 idea\r\n- 2026-11-03 08:00 older\r\n");
  const m = disk(null);
  await addEntry(m.io, "n.md", "notes", "first", now);
  assert.equal(m.text, "- 2026-11-04 09:05 first\n");
  const p = disk("1. a\r\n2. b");
  await addEntry(p.io, "p.md", "priorities", "DEMO-1", now);
  assert.equal(p.text, "1. a\r\n2. b\r\n3. DEMO-1");
  assert.deepEqual(await addEntry(p.io, "p.md", "notes", "  ", now), { ok: false, message: ADD_ERROR });
});
