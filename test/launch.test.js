import { test } from "node:test";
import assert from "node:assert/strict";
import { planLaunch } from "../mods/friday/core/launch.js";

const spaces = [
  { id: "s1", tabs: [{ id: "t1" }, { id: "t2" }] },
  { id: "s2", tabs: [{ id: "t3" }, { id: "t4" }] },
];
const pane = (tab, mod) => ({ pane: "p" + tab, tab, mod });

test("no Friday pane: create the tab", () => {
  assert.deepEqual(planLaunch([pane("t1")], spaces, "s1"), [
    ["tab.new", { name: "Friday", mod: "friday", props: { widget: "summary" } }],
  ]);
});
test("one in the current space: select it", () => {
  assert.deepEqual(planLaunch([pane("t2", "friday")], spaces, "s1"), [["tab.select", { id: "t2" }]]);
});
test("several: current space first, then the first", () => {
  const ps = [pane("t4", "friday"), pane("t2", "friday"), pane("t1", "friday")];
  assert.deepEqual(planLaunch(ps, spaces, "s1"), [["tab.select", { id: "t1" }]]);
  assert.deepEqual(planLaunch([pane("t4", "friday"), pane("t3", "friday")], spaces, "s1"), [
    ["space.select", { id: "s2" }],
    ["tab.select", { id: "t3" }],
  ]);
});
test("pane of another space: switch space, then tab", () => {
  assert.deepEqual(planLaunch([pane("t4", "friday")], spaces, "s1"), [
    ["space.select", { id: "s2" }],
    ["tab.select", { id: "t4" }],
  ]);
});
test("already on a Friday tab: stay", () => {
  const ps = [pane("t1", "friday"), pane("t2", "friday")];
  assert.deepEqual(planLaunch(ps, spaces, "s1", "t2"), []);
  assert.deepEqual(planLaunch(ps, spaces, "s1", "t3"), [["tab.select", { id: "t1" }]]);
});
