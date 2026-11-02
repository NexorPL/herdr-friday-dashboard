// The setup checklist the summary pane shows until Settings has been saved once: one row per
// source that is built (the review ledger, the calendar), with its state and the Settings section its
// button opens. `status` is shared("friday.status").
import { widgetState } from "./due.js";
import { SOURCES } from "./widgets.js";

const ROWS = [
  { id: "ledger", label: "Review ledger", section: "ledger" },
  { id: "calendar", label: "Calendar", section: "calendar" },
];

/** state: "ok", "todo" or "error"; `detail` is one short line for the row. */
export function checklist({ status, now }) {
  return ROWS.map((row) => {
    const rec = status?.[row.id];
    const s = widgetState({ rec, intervalSec: SOURCES[row.id].interval, now });
    if (s === "not_set_up") return { ...row, state: "todo", detail: "needs the iCal address" };
    if (s === "error") return { ...row, state: "error", detail: rec.error ?? "token rejected" };
    if (s === "ok" || s === "stale") return { ...row, state: "ok", detail: row.id === "calendar" ? "feed read" : "found" };
    return { ...row, state: "todo", detail: "checking" };
  });
}
