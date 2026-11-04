// The setup checklist the summary pane shows until Settings has been saved once: one row per
// source that is built (the review ledger, the calendar, Jira, Azure DevOps), with its state and the Settings section its
// button opens. `status` is shared("friday.status").
import { widgetState } from "./due.js";
import { SOURCES } from "./widgets.js";

const ROWS = [
  { id: "ledger", label: "Review ledger", section: "ledger", needs: "needs the ledger file", done: "found" },
  { id: "calendar", label: "Calendar", section: "calendar", needs: "needs the iCal address", done: "feed read" },
  { id: "jira", label: "Jira", section: "jira", needs: "needs the site, e-mail and token", done: "issues read" },
  { id: "ado", label: "Azure DevOps", section: "ado", needs: "needs the organization, PAT and repo", done: "PRs read" },
];

/** state: "ok", "todo" or "error"; `detail` is one short line for the row. */
export function checklist({ status, now }) {
  return ROWS.map((row) => {
    const rec = status?.[row.id];
    const s = widgetState({ rec, intervalSec: SOURCES[row.id].interval, now });
    if (s === "not_set_up") return { ...row, state: "todo", detail: row.needs };
    if (s === "error") return { ...row, state: "error", detail: rec.error ?? "token rejected" };
    if (s === "ok" || s === "stale") return { ...row, state: "ok", detail: row.done };
    return { ...row, state: "todo", detail: "checking" };
  });
}
