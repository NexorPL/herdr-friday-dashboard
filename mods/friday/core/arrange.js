// Where panes go. `tabPanes` and `focused` come from herdr-app's `panes()` and `focused()`.

/**
 * The first pane of a new Friday tab arranges the default panes, and only when it is the only pane
 * in its tab, so an arranged tab is never rearranged (spec, Edge Cases). Returns the `pane.split`
 * arguments to run, in order; empty when nothing should happen. Every split names the pane, so
 * nothing depends on which pane has the keyboard.
 */
export function planArrangement(tabPanes, splits) {
  if (tabPanes.length !== 1 || tabPanes[0].mod !== "friday") return [];
  const pane = tabPanes[0].pane;
  return splits.map(([widget, direction]) => ({ pane, direction, mod: "friday", props: { widget } }));
}

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
