import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangementFromDoc, docPath, liveTree, parseArrangement, renderArrangement, lookupDelay, lookupGaveUp, resizePlan, restoreWidget, splitPlan, widgetOfPane } from "../mods/friday/core/arrangement.js";
import { layoutHeadsPane } from "../mods/friday/core/panel.js";
import { addedPane, arrangesByDefault, lonePane, planArrangement } from "../mods/friday/core/arrange.js";
import { DEFAULT_SPLITS } from "../mods/friday/core/widgets.js";

const block = (id, widget, weight) => ({ id, type: "block", ...(weight ? { size: { weight } } : {}), content: { mod: "friday", props: { widget } } });
const split = (type, id, children, weight) => ({ id, type, ...(weight ? { size: { weight } } : {}), children });
const terminal = (id) => ({ id, type: "block", content: { terminal: "t7" } });
const doc = (...roots) => JSON.stringify({ "herdr-app": { version: 3, value: { spaces: [{ folder: "/some/folder", id: "sp1", name: "a space", tabs: roots.map((root, i) => ({ id: `tb${i}`, name: "a tab", root })) }] } } });

// A default Friday tab as measured on herdr-app 0.1.13: the last child may have no size, and the root is a one-child row.
const SAMPLE = split("row", "tb0", [
  split("column", "sa", [
    split("row", "s69", [
      split("column", "s24", [block("pa", "summary", 0.5), block("pb", "prs")]),
      block("pd", "meetings"),
    ]),
    block("pe", "todos"),
  ]),
]);
const SAMPLE_ARRANGEMENT = {
  split: "column", weight: 1, children: [
    { split: "row", weight: 1, children: [
      { split: "column", weight: 1, children: [{ widget: "summary", weight: 0.5 }, { widget: "prs", weight: 1 }] },
      { widget: "meetings", weight: 1 },
    ] },
    { widget: "todos", weight: 1 },
  ],
};

// My model of herdr, not herdr: a split lands right after its anchor; in a parent of the other direction it wraps the anchor in a new node.
function simulator(first) {
  let next = 0;
  const leaf = (widget) => ({ id: `n${next++}`, type: "block", content: { mod: "friday", props: { widget } } });
  const start = leaf(first);
  const root = { id: "root", type: "row", children: [start] };
  const parentOf = (node, target) => (node.children ?? []).includes(target) ? node : (node.children ?? []).map((c) => parentOf(c, target)).find(Boolean);
  return {
    root,
    start,
    split(anchor, direction, widget) {
      const type = direction === "right" ? "row" : "column";
      const parent = parentOf(root, anchor);
      const at = parent.children.indexOf(anchor);
      const added = leaf(widget);
      if (parent.type === type) parent.children.splice(at + 1, 0, added);
      else parent.children[at] = { id: `n${next++}`, type, children: [anchor, added] };
      return added;
    },
  };
}
const replay = (arrangement) => {
  const plan = splitPlan(arrangement);
  const sim = simulator(plan.first);
  const leaves = [sim.start];
  for (const s of plan.splits) leaves[s.leaf] = sim.split(leaves[s.anchor], s.direction, s.widget);
  return sim.root;
};
/** The shape only: widgets and splits, no sizes or ids. */
const shape = (n) => (n.children ? { split: n.split, children: n.children.map(shape) } : { widget: n.widget });
const rebuilt = (arrangement) => liveTree(JSON.stringify({ "herdr-app": { value: { spaces: [{ tabs: [{ id: "x", root: replay(arrangement) }] }] } } }), "x");

test("the measured default tab gives its widgets, splits and sizes", () => {
  assert.deepEqual(arrangementFromDoc(doc(SAMPLE)), SAMPLE_ARRANGEMENT);
});

test("the saved text holds only widgets, splits, sizes and the version", () => {
  const text = renderArrangement(arrangementFromDoc(doc(SAMPLE)));
  const keys = new Set();
  const walk = (n) => { Object.keys(n).forEach((k) => keys.add(k)); (n.children ?? []).forEach(walk); };
  const file = JSON.parse(text);
  assert.deepEqual(Object.keys(file), ["version", "root"]);
  walk(file.root);
  assert.deepEqual([...keys].sort(), ["children", "split", "weight", "widget"]);
  for (const secret of ["some/folder", "a space", "a tab", "tb0", "pa", "s24"]) assert.ok(!text.includes(`"${secret}"`), secret);
  assert.ok(!text.includes("restore"));
});

test("a restore prop never reaches the file", () => {
  const root = split("row", "r", [{ id: "a", type: "block", content: { mod: "friday", props: { widget: "summary", restore: true } } }, block("b", "ledger")]);
  assert.ok(!renderArrangement(arrangementFromDoc(doc(root))).includes("restore"));
});

test("terminals and unknown widgets are dropped, and a node left with one child collapses", () => {
  const root = split("row", "r", [
    block("a", "summary", 2),
    split("column", "c", [terminal("t"), block("b", "ledger", 0.25), block("x", "no-such-widget")], 3),
    { id: "other", type: "block", content: { mod: "files", props: {} } },
  ]);
  assert.deepEqual(arrangementFromDoc(doc(root)), { split: "row", weight: 1, children: [{ widget: "summary", weight: 2 }, { widget: "ledger", weight: 3 }] });
});

test("a tab with one widget left is that widget", () => {
  assert.deepEqual(arrangementFromDoc(doc(split("row", "r", [terminal("t"), block("a", "todos")]))), { widget: "todos", weight: 1 });
});

test("the tab with the most Friday panes is saved, the first of those on a tie", () => {
  const beside = split("row", "t", [terminal("t1"), block("a", "notes")]);
  const friday = split("row", "f", [block("b", "summary"), block("c", "ledger")]);
  const other = split("row", "o", [block("d", "jira"), block("e", "prs")]);
  const widgets = (text) => arrangementFromDoc(text).children.map((c) => c.widget);
  assert.deepEqual(widgets(doc(beside, friday)), ["summary", "ledger"]);
  assert.deepEqual(widgets(doc(friday, other)), ["summary", "ledger"]);
  assert.equal(arrangementFromDoc(doc(split("row", "x", [terminal("t2")]))), null);
});

test("a split directly in a split of the same direction is flattened, keeping the shares", () => {
  const root = split("column", "r", [
    split("column", "c", [block("a", "summary", 1), block("b", "prs", 3)], 2),
    block("d", "ledger", 1),
  ]);
  assert.deepEqual(arrangementFromDoc(doc(root)), { split: "column", weight: 1, children: [{ widget: "summary", weight: 0.5 }, { widget: "prs", weight: 1.5 }, { widget: "ledger", weight: 1 }] });
  // ...also when collapsing a node is what makes the two levels meet
  const collapsed = split("row", "r", [block("a", "summary"), split("column", "c", [terminal("t"), split("row", "i", [block("b", "prs"), block("d", "jira")])])]);
  assert.deepEqual(shape(arrangementFromDoc(doc(collapsed))), { split: "row", children: [{ widget: "summary" }, { widget: "prs" }, { widget: "jira" }] });
});

test("the first tab with a Friday pane is the one saved", () => {
  const onlyTerminal = split("row", "r0", [terminal("t")]);
  const onlyUnknown = split("row", "r1", [block("x", "no-such-widget")]);
  assert.deepEqual(shape(arrangementFromDoc(doc(onlyTerminal, onlyUnknown, block("a", "notes"), block("b", "todos")))), { widget: "notes" });
});

test("no Friday tab, or a document in another format, gives null", () => {
  assert.equal(arrangementFromDoc(doc(split("row", "r", [terminal("t")]))), null);
  for (const bad of [null, "", "not json", "null", "{}", '{"herdr-app":{}}', '{"herdr-app":{"value":{"spaces":[{"tabs":[{"root":{"type":"tree"}}]}]}}}', '{"herdr-app":{"value":{"spaces":[null]}}}']) {
    assert.equal(arrangementFromDoc(bad), null, String(bad));
    assert.equal(liveTree(bad, "tb0"), null, String(bad));
  }
});

test("a bad file gives null", () => {
  const ok = (root) => JSON.stringify({ version: 1, root });
  const leaf = { widget: "summary" };
  for (const bad of [
    null, "", "not json", "[]", "{}", '{"version":1}',
    ok(null), ok("summary"), ok({}),
    ok({ widget: "no-such-widget" }),
    ok({ widget: "summary", weight: 0 }), ok({ widget: "summary", weight: -1 }), ok({ widget: "summary", weight: "1" }),
    ok({ widget: "summary", children: [] }),
    ok({ split: "row", children: [leaf] }), ok({ split: "row" }), ok({ split: "stack", children: [leaf, leaf] }), ok({ split: "constructor", children: [leaf, leaf] }),
    ok({ split: "row", children: [leaf, { widget: "gone" }] }),
    JSON.stringify({ version: 2, root: leaf }), JSON.stringify({ version: "1", root: leaf }),
  ]) assert.equal(parseArrangement(bad), null, String(bad));
});

test("an unchanged arrangement renders the same text, also after a round trip through the file", () => {
  const text = renderArrangement(arrangementFromDoc(doc(SAMPLE)));
  assert.equal(renderArrangement(arrangementFromDoc(doc(SAMPLE))), text);
  assert.equal(renderArrangement(parseArrangement(text)), text);
});

test("weights are rounded and never reach zero, so the file always parses", () => {
  const root = split("row", "r", [block("a", "summary", 1 / 3), block("b", "ledger", 0.000001)]);
  const saved = arrangementFromDoc(doc(root));
  assert.deepEqual(saved.children.map((c) => c.weight), [0.3333, 0.0001]);
  assert.ok(parseArrangement(renderArrangement(saved)));
});

test("the split plan of the measured tab: the first leaf first, outer levels before inner ones", () => {
  assert.deepEqual(splitPlan(SAMPLE_ARRANGEMENT), {
    first: "summary",
    splits: [
      { anchor: 0, leaf: 3, direction: "down", widget: "todos" },
      { anchor: 0, leaf: 2, direction: "right", widget: "meetings" },
      { anchor: 0, leaf: 1, direction: "down", widget: "prs" },
    ],
  });
});

test("the simulator agrees with the measured tab: the default splits build the measured shape", () => {
  const sim = simulator("summary");
  for (const [widget, direction] of DEFAULT_SPLITS) sim.split(sim.start, direction, widget);
  const measure = (n) => (n.children ? { type: n.type, children: n.children.map(measure) } : n.content.props.widget);
  assert.deepEqual(measure(sim.root), measure(SAMPLE));
});

test("replaying a plan builds the original shape", () => {
  const leaf = (widget) => ({ widget, weight: 1 });
  const node = (s, ...children) => ({ split: s, weight: 1, children });
  const a = leaf("summary"), b = leaf("prs"), c = leaf("jira"), d = leaf("ledger"), e = leaf("todos"), f = leaf("notes");
  for (const tree of [
    a,
    node("row", a, b),
    node("column", a, b, c),
    SAMPLE_ARRANGEMENT,
    node("row", node("column", a, b), node("column", c, d), e),
    node("column", node("row", a, b, c), node("row", d, e), f),
    node("row", node("column", node("row", a, b), c), node("column", d, node("row", e, f))),
    node("column", a, node("row", b, node("column", c, node("row", d, e)), f)),
    node("row", leaf("summary"), leaf("summary"), leaf("summary")), // the same widget twice is two panes
  ]) {
    assert.deepEqual(shape(rebuilt(tree)), shape(tree));
  }
});

test("resizes match by position, on inner nodes too, and treat a missing size as 1", () => {
  const live = rebuilt(SAMPLE_ARRANGEMENT);
  const sized = JSON.parse(JSON.stringify(SAMPLE_ARRANGEMENT));
  sized.children[0].weight = 3; // an inner split
  sized.children[0].children[0].children[1].weight = 0.25; // a leaf
  const calls = resizePlan(sized, live);
  assert.equal(calls.length, 3, "the 0.5 differs from the rebuilt tab's missing size as well");
  const row = live.children[0];
  assert.deepEqual(calls[0], { id: row.id, weight: 3 });
  assert.deepEqual(calls.at(-1), { id: row.children[0].children[1].id, weight: 0.25 });
  assert.deepEqual(resizePlan({ ...SAMPLE_ARRANGEMENT, weight: 7 }, { ...live }).some((c) => c.id === live.id), false, "the root has no size");
});

test("every child gets its size back: a size equal to the rebuilt one needs no call", () => {
  const live = { id: "r", split: "row", weight: 1, children: [{ id: "a", widget: "summary", weight: 0.5 }, { id: "b", widget: "prs", weight: 0.5 }] };
  const saved = { split: "row", weight: 1, children: [{ widget: "summary", weight: 1 }, { widget: "prs", weight: 0.5 }] };
  assert.deepEqual(resizePlan(saved, live), [{ id: "a", weight: 1 }]);
  assert.deepEqual(resizePlan({ widget: "summary", weight: 1 }, { id: "a", widget: "summary", weight: 1 }), []);
});

test("the rebuilt tab's root keeps its outer id when its one-child row collapses", () => {
  assert.equal(liveTree(doc(SAMPLE), "tb0").id, "tb0");
  assert.equal(liveTree(doc(SAMPLE), "no-such-tab"), null);
});

test("no resize at all when the shapes differ", () => {
  const live = liveTree(doc(SAMPLE), "tb0");
  assert.equal(resizePlan(SAMPLE_ARRANGEMENT, null), null, "the document has not caught up");
  assert.equal(resizePlan({ widget: "summary", weight: 1 }, live), null);
  assert.equal(resizePlan({ ...SAMPLE_ARRANGEMENT, split: "row" }, live), null);
  assert.equal(resizePlan({ ...SAMPLE_ARRANGEMENT, children: SAMPLE_ARRANGEMENT.children.slice(1).concat({ widget: "todos", weight: 1 }) }, live), null);
  const otherWidget = JSON.parse(JSON.stringify(SAMPLE_ARRANGEMENT));
  otherWidget.children[1].widget = "notes";
  assert.equal(resizePlan(otherWidget, live), null);
  const nested = split("column", "r", [split("column", "c", [block("a", "summary"), block("b", "prs")]), block("d", "ledger")]);
  const flat = arrangementFromDoc(doc(nested));
  assert.equal(resizePlan(flat, liveTree(doc(nested), "tb0")), null, "a live tree is not flattened, so a nested one does not match");
});

test("the launcher's widget: the first leaf, or null for the default arrangement", () => {
  assert.equal(restoreWidget(renderArrangement(arrangementFromDoc(doc(SAMPLE)))), "summary");
  assert.equal(restoreWidget(null), null);
  assert.equal(restoreWidget("not json"), null);
});

test("the document's path is known on Windows only", () => {
  assert.equal(docPath("windows", "C:\\Users\\someone"), "C:\\Users\\someone/AppData/Local/herdr-core/default/docs.json");
  assert.equal(docPath("linux", "/home/someone"), null);
  assert.equal(docPath("macos", "/Users/someone"), null);
});

test("only a Friday pane alone in its tab arranges or restores, so a restart never rearranges", () => {
  const friday = { pane: "p1", mod: "friday", tab: "t1" };
  assert.equal(lonePane([friday]), friday);
  assert.equal(lonePane([friday, { pane: "p2", mod: "friday", tab: "t1" }]), null);
  assert.equal(lonePane([]), null);
  assert.equal(lonePane([{ pane: "p1", mod: null, tab: "t1" }]), null);
  assert.deepEqual(planArrangement([friday], [["ledger", "down"]]), [{ pane: "p1", direction: "down", mod: "friday", props: { widget: "ledger" } }]);
});

test("a summary pane added beside others never runs the default arrangement: panes() does not list a new copy yet", () => {
  assert.equal(arrangesByDefault({ widget: "summary" }), true);
  assert.equal(arrangesByDefault(addedPane("summary")), false);
  assert.equal(arrangesByDefault({ widget: "summary", restore: true }), false);
  assert.equal(arrangesByDefault({ widget: "summary", block: true }), false);
});

test("widgetOfPane: a block's id is its pane's id", () => {
  const text = doc(split("row", "r", [block("p1", "board"), split("column", "c", [block("p2", "jira"), terminal("p3")])]));
  assert.equal(widgetOfPane(text, "p1"), "board");
  assert.equal(widgetOfPane(text, "p2"), "jira");
  assert.equal(widgetOfPane(text, "p3"), null, "a terminal");
  assert.equal(widgetOfPane(text, "r"), null, "a split");
  assert.equal(widgetOfPane(text, "gone"), null, "not in the document yet");
  assert.equal(widgetOfPane(doc(block("p9", "nosuch")), "p9"), null, "an unknown widget");
  assert.equal(widgetOfPane("not json", "p1"), null);
  assert.equal(widgetOfPane(null, "p1"), null);
});

test("a pane's widget not found: reads go on slower, and the widgets keep their own headers", () => {
  assert.equal(lookupGaveUp(14), false);
  assert.equal(lookupGaveUp(15), true);
  assert.equal(lookupDelay(1), 2000);
  assert.equal(lookupDelay(15), 60_000);

  const root = { id: "m", content: { tab: "active", pane: { header: { content: { mod: "friday" } } } } };
  const pane = { block: false, widget: { id: "jira" }, path: "/docs.json", unreadable: false };
  assert.equal(layoutHeadsPane(root, pane), true);
  assert.equal(layoutHeadsPane(root, { ...pane, unreadable: true }), false, "the document could not be used");
  assert.equal(layoutHeadsPane(root, { ...pane, path: null }), false, "no document on this platform");
  assert.equal(layoutHeadsPane(root, { ...pane, block: true }), false, "a block is not under a pane header");
  assert.equal(layoutHeadsPane(root, { ...pane, widget: null }), false, "an unknown widget keeps its message and buttons");
  assert.equal(layoutHeadsPane({ id: "m", content: { tab: "active", pane: { header: { content: { mod: "pane" } } } } }, pane), false, "another layout's header");
});
