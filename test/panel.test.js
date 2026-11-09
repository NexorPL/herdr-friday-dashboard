import { test } from "node:test";
import assert from "node:assert/strict";
import { panelChild, panelOrder, shownWidgets, checkedWidgets, planHideAll, planShowAll, planPanel, planAutoHide, swapTarget, swapped, PANEL } from "../mods/friday/core/panel.js";

const WIDGETS = ["summary", "notes", "board"];
const root = (...shown) => ({ id: "root", children: [
  { id: "main" },
  { id: PANEL, hidden: shown.length === 0, children: WIDGETS.map((w) => ({ id: panelChild(w), hidden: !shown.includes(w) })) },
] });
const show = (id) => ["layout.show", { id }];
const hide = (id) => ["layout.hide", { id }];

test("shownWidgets: the checked widgets in the open panel", () => {
  assert.deepEqual(shownWidgets(root("summary", "notes")), ["summary", "notes"]);
  assert.deepEqual(shownWidgets(root()), []);
  assert.deepEqual(shownWidgets({ ...root("notes"), children: [{ id: PANEL, hidden: true, children: [{ id: panelChild("notes") }] }] }), [], "a closed panel shows nothing");
  assert.deepEqual(shownWidgets(null), []);
});

test("planPanel: checking a widget adds it, and the first one opens the panel", () => {
  assert.deepEqual(planPanel(root(), "summary"), [show(panelChild("summary")), show(PANEL)]);
  assert.deepEqual(planPanel(root("summary"), "notes"), [show(panelChild("notes")), show(PANEL)]);
});

test("planPanel: unchecking a widget leaves the others, and the last one closes the panel", () => {
  assert.deepEqual(planPanel(root("summary", "notes"), "summary"), [hide(panelChild("summary"))]);
  assert.deepEqual(planPanel(root("notes"), "notes"), [hide(panelChild("notes")), hide(PANEL)]);
});

test("swapTarget: the shown neighbour, past unchecked widgets, and none at an end", () => {
  const r = root("summary", "board");
  assert.equal(swapTarget(r, "board", -1), "summary", "notes between them is unchecked");
  assert.equal(swapTarget(r, "summary", 1), "board");
  assert.equal(swapTarget(r, "summary", -1), null);
  assert.equal(swapTarget(r, "board", 1), null);
});

test("swapped: only the two widgets trade places, and the layout it was given stays as it was", () => {
  const r = root("summary", "board");
  const next = swapped(r, "summary", "board");
  assert.deepEqual(panelOrder(next), ["board", "notes", "summary"]);
  assert.deepEqual(shownWidgets(next), ["board", "summary"]);
  assert.deepEqual(panelOrder(r), WIDGETS);
});

test("planAutoHide: closes an open panel in a tab with Friday panes, and only then", () => {
  const panes = [{ pane: "p1", mod: "friday", tab: "t1" }, { pane: "p2", terminal: "x", tab: "t2" }];
  assert.deepEqual(planAutoHide(root("summary", "board"), panes, "t1"), [hide(panelChild("summary")), hide(panelChild("board")), hide(PANEL)]);
  assert.deepEqual(planAutoHide(root("summary"), panes, "t2"), [], "a terminal tab keeps the panel");
  assert.deepEqual(planAutoHide(root(), panes, "t1"), [], "a closed panel stays as it is");
  assert.deepEqual(planAutoHide(root("summary"), panes, undefined), [], "no focused tab");
});

test("planHideAll closes the open panel and keeps its widgets checked, planShowAll opens it again", () => {
  assert.deepEqual(planHideAll(root("summary", "notes")), [hide(PANEL)]);
  assert.deepEqual(planHideAll(root()), [], "a closed panel has nothing to hide");
  const parked = { id: "root", children: [{ id: PANEL, hidden: true, children: WIDGETS.map((w) => ({ id: panelChild(w), hidden: w === "board" })) }] };
  assert.deepEqual(checkedWidgets(parked), ["summary", "notes"]);
  assert.deepEqual(shownWidgets(parked), [], "a hidden panel shows nothing");
  assert.deepEqual(planShowAll(parked), [show(PANEL)]);
  assert.deepEqual(planShowAll(root()), [], "nothing is kept checked");
  assert.deepEqual(planShowAll(root("summary")), [], "an open panel is not shown again");
});

test("planPanel in a hidden panel that kept its widgets: unchecking leaves it hidden, checking opens it", () => {
  const parked = { id: "root", children: [{ id: PANEL, hidden: true, children: WIDGETS.map((w) => ({ id: panelChild(w), hidden: w === "board" })) }] };
  assert.deepEqual(planPanel(parked, "notes"), [hide(panelChild("notes"))]);
  assert.deepEqual(planPanel(parked, "board"), [show(panelChild("board")), show(PANEL)]);
});
