import { test } from "node:test";
import assert from "node:assert/strict";
import { todoRows, noteRows, priorityRows, toggleTodo, addEntry, ADD_ERROR } from "../mods/friday/core/lists.js";

const issues = [{ key: "DEMO-12", summary: "Tidy the settings form", status: "In Progress", url: "https://x.example/browse/DEMO-12" }];
const PRI = "# Today\n1. DEMO-12 fix it\n- Prepare the demo\n\n* DEMO-99 unknown\n";

test("priority rows show the Jira status when friday.jira has the key", () => {
  const rows = priorityRows(PRI, issues);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { n: 1, text: "DEMO-12 fix it", key: "DEMO-12", summary: "Tidy the settings form", status: "In Progress", url: issues[0].url });
  assert.equal(rows[1].summary, "Prepare the demo");
  assert.equal(rows[1].key, null);
  assert.equal(rows[2].key, "DEMO-99");
  assert.equal(rows[2].status, "", "an unknown key stays plain text");
  assert.equal(rows[2].summary, "DEMO-99 unknown");
});

test("priority rows are plain text without Jira data", () => {
  for (const none of [null, undefined, []]) {
    const rows = priorityRows(PRI, none);
    assert.deepEqual(rows.map((r) => [r.summary, r.status, r.url]), [["DEMO-12 fix it", "", null], ["Prepare the demo", "", null], ["DEMO-99 unknown", "", null]]);
    assert.equal(rows[0].key, "DEMO-12");
  }
  assert.deepEqual(priorityRows(null, issues), []);
});

test("todo and note rows", () => {
  assert.deepEqual(todoRows("# T\n- [ ] a\r\n- [x] b\nplain\n"), [{ line: 1, done: false, body: "a" }, { line: 2, done: true, body: "b" }]);
  assert.deepEqual(noteRows("one\n\n  two \n"), [{ line: 0, text: "one" }, { line: 2, text: "two" }]);
  assert.deepEqual(todoRows(null), []);
});

function disk(initial) {
  const f = { text: initial };
  f.io = { read: async () => f.text, write: async (_p, next, expected) => { if (expected !== f.text) throw new Error("changed"); f.text = next; } };
  return f;
}

test("toggleTodo and addEntry write through the R10 writer", async () => {
  const f = disk("- [ ] a\r\n- [ ] b");
  assert.equal((await toggleTodo(f.io, "t.md", todoRows(f.text)[1])).ok, true);
  assert.equal(f.text, "- [ ] a\r\n- [x] b");
  f.text = "- [ ] a\n";
  assert.equal((await toggleTodo(f.io, "t.md", { line: 1, done: false, body: "b" })).message, "file changed, try again");
  assert.equal(f.text, "- [ ] a\n");
  await addEntry(f.io, "t.md", "todos", " call the bank ");
  assert.equal(f.text, "- [ ] a\n- [ ] call the bank\n");
  const n = disk(null);
  await addEntry(n.io, "n.md", "notes", "idea");
  assert.equal(n.text, "- idea\n");
  const p = disk("1. a\n");
  await addEntry(p.io, "p.md", "priorities", "DEMO-1");
  assert.equal(p.text, "1. a\nDEMO-1\n");
  assert.deepEqual(await addEntry(p.io, "p.md", "notes", "  "), { ok: false, message: ADD_ERROR });
});
