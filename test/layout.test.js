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
