// Remembering the Friday tab (D46). Panes check how their tab is arranged and save it; a tab opened
// with props().restore rebuilds it. The rules are in core/arrangement.js; the core's document is only read.
import { focused, home, panes, readTextFile, run, setShared, shared, window } from "herdr";
import { sleep } from "./hub.js";
import { ARRANGEMENT_FILE, readDataText, writeArrangement } from "./store.js";
import { addedPane, lonePane } from "./core/arrange.js";
import { arrangementFromDoc, docPath, liveTree, parseArrangement, renderArrangement, resizePlan, splitPlan } from "./core/arrangement.js";

/** Until when (ms) nothing is saved: a tab being rebuilt must not overwrite the file with a half-built one. */
const RESTORING = "friday.restoring";
const RESTORE_LIMIT = 60_000;
/** The core's file can be 5 s behind, so the sizes of a finished rebuild show a moment later. */
const AFTER_RESTORE = 6000;
/** A rebuild that failed leaves a partial tab, and saving it would replace the good file. ponytail: a fixed hour, long enough to close the tab and press the key again. */
const AFTER_FAILED_RESTORE = 3_600_000;
/** The lease that picks the one copy that reads the document. */
const LEASE = "arrangement";

export const documentPath = () => docPath(window()?.platform, home());

/** Every 10 s the lease holder reads the document and saves a changed arrangement. No Friday tab in it keeps the last saved one. */
export function startSaving(cx, hub) {
  cx.timer.every(10_000, (cx) => {
    if (!documentPath() || shared(RESTORING) > Date.now()) return;
    cx.spawn(async (cx) => {
      try {
        if (!(await hub.lease(cx, LEASE))) return;
        const arrangement = arrangementFromDoc(await readTextFile(documentPath()));
        if (arrangement) await writeArrangement(renderArrangement(arrangement));
      } catch {
        // the last saved arrangement stays; the next check tries again
      }
    });
  });
}

/** The pane alone in the shown tab. The copy starts before herdr-app has shown its tab, so wait until the shown tab has a Friday pane. */
async function loneFridayPane(cx) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const tab = focused()?.tab;
    const inTab = panes().filter((p) => p.tab === tab);
    if (inTab.some((p) => p.mod === "friday")) return lonePane(inTab);
    await sleep(cx, 300);
  }
  return null;
}

/** Runs the splits. run() returns nothing, so each new pane is found as the one panes() did not list before. False when one does not appear. */
async function addPanes(cx, first, splits) {
  const ids = [first.pane];
  for (const s of splits) {
    const known = new Set(panes().map((p) => p.pane));
    run("pane.split", { pane: ids[s.anchor], direction: s.direction, mod: "friday", props: addedPane(s.widget) });
    let added = null;
    for (let i = 0; i < 30 && !added; i++) {
      added = panes().find((p) => p.tab === first.tab && !known.has(p.pane));
      await (added ? cx.sleep(0) : sleep(cx, 100));
    }
    if (!added) return false;
    ids[s.leaf] = added.pane;
  }
  return true;
}

/** Waits for the document to show the rebuilt tab, for the ids of its nodes. If it never does, or the shape differs, the sizes are skipped and it returns false. */
async function applySizes(cx, tab, saved) {
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(cx, 1000);
    const calls = resizePlan(saved, liveTree(await readTextFile(documentPath()), tab));
    if (calls) {
      for (const call of calls) run("layout.resize", call);
      return true;
    }
  }
  return false;
}

/** A pane opened with props().restore: it is the saved arrangement's first leaf, and builds the rest while it is alone in its tab. */
export function restoreTab(cx, widget) {
  cx.spawn(async (cx) => {
    try {
      const saved = parseArrangement(await readDataText(ARRANGEMENT_FILE));
      const plan = saved && splitPlan(saved);
      if (!plan || plan.first !== widget || !plan.splits.length) return;
      const first = await loneFridayPane(cx);
      if (!first) return;
      setShared(RESTORING, Date.now() + RESTORE_LIMIT);
      let done = false;
      try {
        done = (await addPanes(cx, first, plan.splits)) && (!documentPath() || (await applySizes(cx, first.tab, saved)));
      } finally {
        setShared(RESTORING, Date.now() + (done ? AFTER_RESTORE : AFTER_FAILED_RESTORE));
      }
    } catch {
      // what was built stays, and a failure never reaches the pane
    }
  });
}
