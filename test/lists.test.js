import { test } from "node:test";
import assert from "node:assert/strict";
import { todoRows, noteRows, priorityRows, priorityLine, noteLine, toggleTodo, addEntry, submitLine, moveRow, moveListRow, ADD_ERROR } from "../mods/friday/core/lists.js";
import { onlyMoved, CHANGED } from "../mods/friday/core/mdfile.js";

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
  assert.deepEqual(todoRows("# T\n- [ ] a\r\n- [x] b\nplain\n"), [{ line: 1, text: "- [ ] a", count: 1, above: null, done: false, body: "a" }, { line: 2, text: "- [x] b", count: 1, above: null, done: true, body: "b" }]);
  assert.deepEqual(todoRows("# T\n- [ ] a\n- [ ] a\n").map((r) => [r.count, r.above]), [[2, ["# T"]], [2, ["# T", "- [ ] a"]]]);
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

test("submitLine clears the input only after a write that worked, and never loses what is typed", async () => {
  const input = (value) => ({ value: () => value, set_value(v) { value = v; } });
  const ok = input("idea");
  assert.deepEqual(await submitLine(ok, async (text) => ({ ok: text === "idea" })), { ok: true });
  assert.equal(ok.value(), "");

  const refused = input("two");
  assert.deepEqual(await submitLine(refused, async () => ({ ok: false, message: "no" })), { ok: false, message: "no" });
  assert.equal(refused.value(), "two");

  const thrown = input("three");
  const r = await submitLine(thrown, async () => { throw new Error("C:/secret/path"); });
  assert.deepEqual(r, { ok: false, message: "could not write the file" });
  assert.equal(thrown.value(), "three");

  const still = input("four");
  await submitLine(still, async () => { still.set_value("four and more"); return { ok: true }; });
  assert.equal(still.value(), "four and more", "typed while the write ran: stays");
});

test("moveRow swaps a row with its neighbour and carries the indented lines under it", () => {
  const todos = "# Todos\r\n- [ ] a\r\n  detail of a\r\nnote between\r\n- [x] b\r\n- [ ] c";
  const up = moveRow(todos, "todos", 1, "- [x] b", "up");
  assert.equal(up.text, "# Todos\r\n- [x] b\r\n- [ ] a\r\n  detail of a\r\nnote between\r\n- [ ] c", "b goes above a with its detail; the text between stays");
  assert.ok(onlyMoved(todos, up.text, up.plan));
  assert.equal(moveRow(todos, "todos", 0, "- [ ] a", "down").text, up.text, "a down is b up");
  assert.equal(moveRow(todos, "todos", 0, "- [ ] a", "up").text, todos, "the first row does not move up");
  assert.equal(moveRow(todos, "todos", 2, "- [ ] c", "down").text, todos, "the last row does not move down");
  assert.equal(moveRow(todos, "todos", 1, "- [ ] a", "up"), null, "the line there is not the one drawn");
  assert.equal(moveRow(todos, "todos", 5, "x", "up"), null, "not a row");
});

test("moveRow works on notes and on priorities, whatever their list marker", () => {
  const notes = "# Notes\n- 2026-11-09 10:00 second\n- 2026-11-09 09:00 first\n\n- 2026-11-08 08:00 older\n";
  assert.equal(moveRow(notes, "notes", 1, "- 2026-11-09 09:00 first", "up").text, "# Notes\n- 2026-11-09 09:00 first\n- 2026-11-09 10:00 second\n\n- 2026-11-08 08:00 older\n");
  const down = moveRow(notes, "notes", 1, "- 2026-11-09 09:00 first", "down");
  assert.equal(down.text, "# Notes\n- 2026-11-09 10:00 second\n- 2026-11-08 08:00 older\n- 2026-11-09 09:00 first\n\n", "the blank line is not a row and stays after");
  assert.ok(onlyMoved(notes, down.text, down.plan));
  const rows = priorityRows(PRI, issues);
  const first = moveRow(PRI, "priorities", 0, rows[0].text, "down");
  assert.equal(first.text, "# Today\n- Prepare the demo\n1. DEMO-12 fix it\n\n* DEMO-99 unknown\n", "headings and blank lines are not rows; numbers are not renumbered");
  assert.ok(onlyMoved(PRI, first.text, first.plan));
});

test("moveListRow writes through the move guard and refuses a changed file", async () => {
  let text = "- [ ] a\n- [ ] b\n";
  const writes = [];
  const io = { read: async () => text, write: async (_p, next, prev) => { if (prev !== text) throw new Error("changed"); writes.push(next); text = next; } };
  assert.deepEqual(await moveListRow(io, "todos.md", "todos", 1, "- [ ] b", "up"), { ok: true, changed: true });
  assert.equal(text, "- [ ] b\n- [ ] a\n");
  assert.deepEqual(await moveListRow(io, "todos.md", "todos", 1, "- [ ] b", "up"), { ok: false, message: CHANGED }, "b is no longer at 1");
  assert.equal(writes.length, 1);
});
