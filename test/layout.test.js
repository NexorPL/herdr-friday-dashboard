import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { widgetById } from "../mods/friday/core/widgets.js";

const layout = JSON.parse(readFileSync(new URL("../layouts/friday.json", import.meta.url), "utf8"));
const walk = (n) => [n, ...(n.children ?? []).flatMap(walk)];

test("layouts/friday.json: every Friday block names a known widget and says it is a block", () => {
  const nodes = walk(layout);
  const ids = nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, "node ids are unique");
  const mine = nodes.filter((n) => n.content?.mod === "friday");
  assert.deepEqual(mine.map((n) => n.content.props.widget), ["summary", "meetings", "prs", "jira", "priorities", "todos"]);
  for (const n of mine) {
    assert.ok(widgetById(n.content.props.widget), n.id);
    assert.equal(n.content.props.block, true, `${n.id} sets block, so it never arranges or splits`);
  }
  assert.ok(nodes.some((n) => n.content?.tab === "active"), "the active tab stays");
  assert.equal(layout.theme, undefined, "no theme of its own");
  assert.equal(layout.font, undefined, "no font of its own");
});

test("layouts/friday-board.json: the board is first, the rest of the window is the main layout's", () => {
  const board = JSON.parse(readFileSync(new URL("../layouts/friday-board.json", import.meta.url), "utf8"));
  const nodes = walk(board);
  const ids = nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, "node ids are unique");
  const mine = nodes.filter((n) => n.content?.mod === "friday");
  assert.deepEqual(mine.map((n) => n.content.props.widget), ["board", "summary", "meetings", "prs", "ledger", "jira", "favorites", "notes"]);
  for (const n of mine) {
    assert.ok(widgetById(n.content.props.widget), n.id);
    assert.equal(n.content.props.block, true, `${n.id} sets block, so it never arranges or splits`);
  }
  assert.ok(nodes.some((n) => n.content?.tab === "active"), "the active tab stays");
  assert.ok(nodes.some((n) => n.content?.mod === "tabs"), "the tab bar stays");
  assert.equal(board.theme, undefined, "no theme of its own");
  assert.equal(board.font, undefined, "no font of its own");
  // the sidebar, the status bar and the hidden panel are the ones of layouts/friday.json
  const copy = (layoutNodes, id) => JSON.stringify(layoutNodes.find((n) => n.id === id));
  for (const id of ["sidebar", "status", "panel"]) assert.equal(copy(nodes, id), copy(walk(layout), id), id);
  // the tab bar keeps the top of the window (it draws the window buttons), the board sits above everything else of Friday's
  const lower = nodes.find((n) => n.id === "lower");
  assert.equal(nodes.find((n) => n.id === "work-body").children[0].id, "friday-board");
  assert.deepEqual(lower.children.map((n) => n.id), ["friday-grid", "main", "panel"]);
  assert.deepEqual(nodes.find((n) => n.id === "work").children.map((n) => n.id), ["tabs", "work-body", "status"]);
  assert.deepEqual(nodes.find((n) => n.id === "friday-grid").children.map((n) => n.id), ["friday-col-1", "friday-col-2", "friday-col-3", "friday-notes"]);
});
