// The Friday tab's arrangement (D46): which widgets, how they are split, how large. It comes from the
// core's document, which is only ever read, and lives in arrangement.json. Pure: the wiring is in ../arrangement.js.
// A node is { widget, weight } or { split: "row" | "column", weight, children }, with children in order.
// Anything unexpected in the document or the file gives null, and the owner gets the default arrangement.
import { parseJson, SUPPORTED_VERSION } from "./datafile.js";
import { widgetById } from "./widgets.js";

const DIRECTION = { row: "right", column: "down" };

const validWeight = (w) => typeof w === "number" && Number.isFinite(w) && w > 0;
/** A node with no size counts as weight 1: a split halves its anchor (0.5, 0.5) beside a sibling with none. */
const weightOf = (w) => (validWeight(w) ? w : 1);

/** Where the core keeps its documents, or null where that is not known (saving then does nothing). */
export function docPath(platform, home) {
  return platform === "windows" ? `${home}/AppData/Local/herdr-core/default/docs.json` : null;
}

/** A tab's tree, ids kept, without terminals and unknown widgets; a node left with one child collapses, keeping its own place and size. Sizes in px count as weight 1 (none seen in a tab). */
function prune(node) {
  if (!node || typeof node !== "object") return null;
  const weight = weightOf(node.size?.weight);
  if (node.type === "block") {
    const { mod, props } = node.content ?? {};
    return mod === "friday" && widgetById(props?.widget) ? { id: node.id, widget: props.widget, weight } : null;
  }
  if ((node.type !== "row" && node.type !== "column") || !Array.isArray(node.children)) return null;
  const children = node.children.map((c) => prune(c)).filter(Boolean);
  if (!children.length) return null;
  if (children.length === 1) return { ...children[0], id: node.id, weight };
  return { id: node.id, split: node.type, weight, children };
}

/** A row directly in a row (or column in column) becomes one level, keeping the shares: a split beside its anchor can only build it flat. */
function flatten(node) {
  if (!node.children) return node;
  const children = node.children.map(flatten).flatMap((c) => {
    if (c.split !== node.split) return [c];
    const sum = c.children.reduce((s, k) => s + k.weight, 0);
    return c.children.map((k) => ({ ...k, weight: (c.weight * k.weight) / sum }));
  });
  return { ...node, children };
}

/** Only what the file holds, in a fixed key order; weights to 4 places, so a drag's noise is not a change. */
function canonical(node) {
  const weight = Math.max(0.0001, Math.round(node.weight * 10000) / 10000);
  if (node.widget) return { widget: node.widget, weight };
  return { split: node.split, weight, children: node.children.map(canonical) };
}

function tabsOf(docText) {
  return JSON.parse(docText)["herdr-app"].value.spaces.flatMap((s) => s.tabs);
}

const leafCount = (node) => (node.children ? node.children.reduce((sum, c) => sum + leafCount(c), 0) : 1);

/** The arrangement of the tab with the most Friday panes (the first of those on a tie), so one Friday pane beside a terminal is not taken for the Friday tab. Null when there is none or the document is not as expected. */
export function arrangementFromDoc(docText) {
  try {
    let best = null;
    for (const tab of tabsOf(docText)) {
      const root = prune(tab?.root);
      if (root && (!best || leafCount(root) > leafCount(best))) best = root;
    }
    return best && canonical(flatten(best));
  } catch {
    // an unexpected document reads as no Friday tab
  }
  return null;
}

/** One tab's tree with its node ids, as it stands; nesting is not flattened, so a tree that differs does not match. */
export function liveTree(docText, tabId) {
  try {
    return prune(tabsOf(docText).find((t) => t?.id === tabId)?.root);
  } catch {
    return null;
  }
}

/** The file's text. Unchanged arrangements give the same text, so they cause no write. */
export function renderArrangement(arrangement) {
  const { weight: _rootHasNoSize, ...root } = arrangement;
  return `${JSON.stringify({ version: SUPPORTED_VERSION, root }, null, 2)}\n`;
}

function checked(node) {
  const { widget, split, children, weight = 1 } = node;
  if (!validWeight(weight)) throw new Error("bad weight");
  if (widget !== undefined) {
    if (!widgetById(widget) || split !== undefined || children !== undefined) throw new Error("bad leaf");
    return { widget, weight };
  }
  if ((split !== "row" && split !== "column") || !Array.isArray(children) || children.length < 2) throw new Error("bad split");
  return { split, weight, children: children.map((c) => checked(c)) };
}

/** The saved file's arrangement, or null for a missing, broken or newer file. Never throws. */
export function parseArrangement(text) {
  try {
    const parsed = parseJson(text);
    return parsed.state === "ok" ? checked(parsed.value.root) : null;
  } catch {
    return null;
  }
}

/**
 * How to build an arrangement from one pane: `first` is that pane's widget, and each split adds
 * leaf number `leaf` beside leaf number `anchor` (leaves counted depth first, 0 being the first
 * pane). Later children split their previous sibling's first leaf, outer levels before inner ones,
 * because a split can only land after its anchor (no left or up).
 */
export function splitPlan(root) {
  const widgets = [];
  const number = new Map();
  const count = (n) => {
    if (n.children) n.children.forEach(count);
    else number.set(n, widgets.push(n.widget) - 1);
  };
  count(root);
  const firstLeaf = (n) => (n.children ? firstLeaf(n.children[0]) : number.get(n));
  const splits = [];
  const walk = (n) => {
    if (!n.children) return;
    n.children.slice(1).forEach((child, i) => {
      const leaf = firstLeaf(child);
      splits.push({ anchor: firstLeaf(n.children[i]), leaf, direction: DIRECTION[n.split], widget: widgets[leaf] });
    });
    n.children.forEach(walk);
  };
  walk(root);
  return { first: widgets[0], splits };
}

/** The widget a restored tab starts with, or null: with a bad or missing file the owner gets the default. */
export function restoreWidget(text) {
  const saved = parseArrangement(text);
  return saved ? splitPlan(saved).first : null;
}

/** The `layout.resize` arguments that give the rebuilt tab its saved sizes, matched by position; null when the shapes differ. */
export function resizePlan(saved, live) {
  const calls = [];
  const match = (s, l, root) => {
    if (!l || s.widget !== l.widget || s.split !== l.split || s.children?.length !== l.children?.length) return false;
    if (!root && s.weight !== l.weight) calls.push({ id: l.id, weight: s.weight });
    return !s.children || s.children.every((c, i) => match(c, l.children[i], false));
  };
  return match(saved, live, true) ? calls : null;
}
