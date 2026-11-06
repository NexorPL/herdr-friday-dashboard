// The side panel of layouts/friday-panel.json: a closed column holding one closed block per widget. Pure;
// `root` is herdr-app's `layout()`.

export const PANEL = "friday-panel";
export const panelChild = (widget) => `${PANEL}-${widget}`;
const widgetOf = (child) => child.id.slice(panelChild("").length);

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

/** Whether a copy's own header would repeat the layout's: only a pane in a tab, under Friday's pane header, while that header can find widgets. */
export const layoutHeadsPane = (root, { block, widget, path, unreadable }) => Boolean(!block && widget && path && !unreadable && paneHeadIsFriday(root));

/** Whether the layout's pane header is Friday's own (widgets/pane-head.js). */
export function paneHeadIsFriday(node) {
  if (node?.content?.pane?.header?.content?.mod === "friday") return true;
  return (node?.children ?? []).some(paneHeadIsFriday);
}

/** A collapsed block's height: the header's 28 px and the block's border. The layout's `min` for these blocks is the same. */
export const COLLAPSED_PX = 30;

/** Whether this widget has a block in the panel; a Friday block elsewhere has no collapse. */
export const inPanel = (root, widget) => Boolean(find(root, panelChild(widget)));

export const isCollapsed = (root, widget) => find(root, panelChild(widget))?.size?.px === COLLAPSED_PX;

/** The `layout.resize` arguments for a click on the chevron, and the expanded sizes to keep (`sizes`: widget -> weight), so expanding gives the earlier size back. */
export function planCollapse(root, widget, sizes) {
  const id = panelChild(widget);
  if (isCollapsed(root, widget)) return { args: { id, weight: sizes[widget] ?? 1 }, sizes };
  return { args: { id, px: COLLAPSED_PX }, sizes: { ...sizes, [widget]: find(root, id)?.size?.weight ?? 1 } };
}

/** Every widget of the panel, top to bottom: the owner's order, kept in the layout. */
export const panelOrder = (root) => (find(root, PANEL)?.children ?? []).map(widgetOf);

/** The widgets the open panel shows, top to bottom. */
export function shownWidgets(root) {
  const panel = find(root, PANEL);
  if (!panel || panel.hidden) return [];
  return panel.children.filter((c) => !c.hidden).map(widgetOf);
}

/** Commands for a click on a widget's checkbox. The panel opens with its first widget and closes with its last. */
export function planPanel(root, widget) {
  const shown = shownWidgets(root);
  const child = { id: panelChild(widget) };
  if (!shown.includes(widget)) return [["layout.show", child], ["layout.show", { id: PANEL }]];
  return shown.length === 1 ? [["layout.hide", child], ["layout.hide", { id: PANEL }]] : [["layout.hide", child]];
}

/** The widget a shown widget swaps with for `delta` (-1 up, 1 down): its shown neighbour, past unchecked ones. Null at an end. */
export function swapTarget(root, widget, delta) {
  const shown = shownWidgets(root);
  return shown[shown.indexOf(widget) + delta] ?? null;
}

/** A copy of the layout with the two widgets swapped, for `layout.set`, which writes it to the layout file. */
export function swapped(root, a, b) {
  const copy = JSON.parse(JSON.stringify(root));
  const children = find(copy, PANEL).children;
  const i = children.findIndex((c) => c.id === panelChild(a));
  const j = children.findIndex((c) => c.id === panelChild(b));
  [children[i], children[j]] = [children[j], children[i]];
  return copy;
}
