// The launcher: what `mod.open:friday` does. Pure; `panes()`, `spaces()` and `focused()` come from herdr-app.

/**
 * Commands to run to bring the owner to Friday: select an existing Friday tab (current space first,
 * else the first one anywhere, switching space), or create it. Each item is [command, args].
 */
export function planLaunch(allPanes, allSpaces, currentSpace, currentTab) {
  const ids = new Set(allPanes.filter((p) => p.mod === "friday").map((p) => p.tab));
  if (ids.has(currentTab)) return []; // already on a Friday tab
  const hits = [];
  for (const s of allSpaces) for (const t of s.tabs) if (ids.has(t.id)) hits.push({ space: s.id, tab: t.id });
  const hit = hits.find((h) => h.space === currentSpace) || hits[0];
  if (!hit) return [["tab.new", { name: "Friday", mod: "friday", props: { widget: "summary" } }]];
  const plan = [];
  if (hit.space !== currentSpace) plan.push(["space.select", { id: hit.space }]);
  plan.push(["tab.select", { id: hit.tab }]);
  return plan;
}
