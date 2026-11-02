// The setup checklist the summary pane shows until Settings has been saved once: one row per
// source that is built (Phase 1: the review ledger), with its state and the Settings section its
// button opens. `status` is shared("friday.status").
import { widgetState } from "./due.js";
import { SOURCES } from "./widgets.js";

const ROWS = [{ id: "ledger", label: "Review ledger", section: "ledger" }];

/** state: "ok", "todo" or "error"; `detail` is one short line for the row. */
export function checklist({ status, now }) {
  return ROWS.map((row) => {
    const rec = status?.[row.id];
    const s = widgetState({ rec, intervalSec: SOURCES[row.id].interval, now });
    if (s === "error") return { ...row, state: "error", detail: rec.error ?? "token rejected" };
    if (s === "ok" || s === "stale") return { ...row, state: "ok", detail: "found" };
    return { ...row, state: "todo", detail: "checking" };
  });
}
