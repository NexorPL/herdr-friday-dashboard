// Where panes go. `tabPanes` and `focused` come from herdr-app's `panes()` and `focused()`.

/**
 * The first pane of a new Friday tab arranges the default panes, and only when it is the only pane
 * in its tab, so an arranged tab is never rearranged (spec, Edge Cases). Returns the `pane.split`
 * arguments to run, in order; empty when nothing should happen. Every split names the pane, so
 * nothing depends on which pane has the keyboard. A copy in a layout block (`props().block`) is not
 * a pane of any tab: panes() does not list it and focused() is the owner's terminal, so it never
 * arranges, even when the shown tab happens to hold a single Friday pane.
 */
export function planArrangement(tabPanes, splits, block = false) {
  const lone = block ? null : lonePane(tabPanes);
  if (!lone) return [];
  return splits.map(([widget, direction]) => ({ pane: lone.pane, direction, mod: "friday", props: { widget } }));
}

/** The Friday pane that is the only pane in its tab, or null: the one guard for arranging and for restoring. */
export function lonePane(tabPanes) {
  return tabPanes.length === 1 && tabPanes[0].mod === "friday" ? tabPanes[0] : null;
}

/**
 * The props of a pane added beside others. A new copy starts before panes() lists it, so a summary
 * added beside a lone pane sees that pane alone; `arranged` keeps it from splitting that pane with the defaults.
 */
export const addedPane = (widget) => ({ widget, arranged: true });

/** Whether a summary pane with these props may run the default arrangement: only the first pane of a plain new tab. */
export const arrangesByDefault = (props) => props.block !== true && props.restore !== true && props.arranged !== true;

/**
 * The pane the + menu splits: the focused pane, and only if it is a Friday pane. A pane's own id is
 * not in its props, so the focus at click time is how a pane finds itself; a click on a mod pane
 * focuses it first.
 */
export function splitTarget(focused, allPanes) {
  if (!focused || !focused.pane) return null;
  const info = allPanes.find((p) => p.pane === focused.pane);
  return info && info.mod === "friday" ? info.pane : null;
}
