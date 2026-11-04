// The widgets a Friday pane can show. The ids are saved in the owner's tabs as
// { "mod": "friday", "props": { "widget": "<id>" } }, so an id is never renamed or reused
// (BACKWARD_COMPATIBILITY.md). A phase adds its widgets here when it builds them.

export const WIDGETS = [
  { id: "summary", title: "Summary", sources: ["ledger", "calendar", "jira"] },
  { id: "ledger", title: "Review ledger", sources: ["ledger"] },
  { id: "meetings", title: "Meetings", sources: ["calendar"] },
  { id: "jira", title: "Jira", sources: ["jira"] },
  { id: "favorites", title: "Favorites", sources: ["jira"] },
];

export const widgetById = (id) => WIDGETS.find((w) => w.id === id) ?? null;

/** What the first pane of a new Friday tab splits in, in order: [widget, direction]. */
export const DEFAULT_SPLITS = [["ledger", "down"], ["meetings", "right"], ["jira", "down"]];

/** The sources the hub polls, and how often (seconds). A phase adds its own. */
export const SOURCES = {
  // herdr-app's readTextFile has no mtime, so the ledger is read and compared on a short interval.
  ledger: { interval: 15 },
  // The calendar's lease holder also runs the alert loop, so it keeps the lease between fetches.
  // `interval` is the default of calendar.interval, which the hub reads from settings.
  calendar: { interval: 600, persistent: true },
  // `interval` is the default of jira.interval.
  jira: { interval: 300 },
};

/** The sources a set of widgets needs. */
export function sourcesFor(widgetIds) {
  return [...new Set(widgetIds.flatMap((id) => widgetById(id)?.sources ?? []))];
}
