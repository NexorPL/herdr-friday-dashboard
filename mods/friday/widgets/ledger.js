// The review ledger: days newest first, each with the day's total from the file's summary table
// (R08) and its rows. A click on the PR or the task opens its link; ↑ ↓ and Enter do the same
// from the keyboard. Rows the parser could not read are counted, not hidden (G27).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { minutesText, weekdayOf } from "../core/format.js";
import { totalFor } from "../core/ledger.js";
import { openLink } from "../open.js";
import { button, note, rowAction, tip } from "../ui.js";

/** At most this many days are drawn; the rest stay in the file. */
const MAX_DRAWN_DAYS = 60;

/** The rows in drawing order, for the keyboard cursor. */
export function flatRows(ledger) {
  return ledger.days.slice(0, MAX_DRAWN_DAYS).flatMap((d) => d.rows.map((row) => ({ day: d.date, row })));
}

function link(t, id, text, url, width) {
  return div().id(id).w(width).flex_none().truncate().text_size(12).text_color(url ? t.accent : t.dim)
    .when(Boolean(url), (el) => el.cursor_pointer())
    .on_click((_e, cx) => { cx.stop_propagation(); if (url) openLink(url); })
    .child(text);
}

const SAMPLE = [
  "## Summary",
  "| Day | Runs | Minutes |",
  "|---|---|---|",
  "| 2026-11-05, Thursday | 7 | 35 |",
  "",
  "## 2026-11-05, Thursday",
  "| Task | PR | Runs | Times | Minutes |",
  "|---|---|---|---|---|",
  "| [PROJ-11](https://jira.example/browse/PROJ-11) | [!501](https://dev.example/pr/501) | 3 | 09:20, 12:57, 18:07 | 15 |",
];

/** Shown while no ledger file is set: what the file is for and how it must look. */
function setupHelp(t, v) {
  return v_flex().size_full().overflow_y_scrollbar().p(12).gap(8)
    .child(div().text_size(12).font_semibold().child("Review ledger (optional)"))
    .child(note(t, "For reviewers without a review bot: a markdown file that your own script or hook keeps up, one row per reviewed PR. Friday shows the days and logs the minutes to Jira. It never writes the file."))
    .child(note(t, "The file looks like this. Cells are read by position, so the header text does not matter; a Summary table gives each day's total, and a section per day lists the PRs."))
    .child(v_flex().gap(1).p(8).rounded(6).bg(t.hover).children(SAMPLE.map((line) => div().text_size(11).text_color(t.muted).child(line || " "))))
    .child(h_flex().child(button(t, "led-settings", "Set the file", () => v.openSettings("ledger"))));
}

export function renderLedger(v) {
  const t = theme();
  const state = v.hub.state("ledger");
  const ledger = v.hub.ledger();
  if (state === "not_set_up") return setupHelp(t, v);
  if (!ledger) {
    const error = v.hub.status().ledger?.error;
    return v_flex().size_full().p(12).gap(8)
      .child(state === "error" ? note(t, error ?? "error", "error") : note(t, "Reading the ledger…"))
      .when(state === "error", (el) => el.child(h_flex().child(button(t, "led-settings", "Open Settings", () => v.openSettings("ledger")))));
  }
  const { days, skipped } = ledger.data;
  let index = -1;
  return v_flex().size_full().overflow_y_scrollbar().p(10).gap(10)
    .when(state === "error", (el) => el.child(note(t, `${v.hub.status().ledger?.error} (showing the last read)`, "error")))
    .when(skipped > 0, (el) => el.child(note(t, `${skipped} ${skipped === 1 ? "row" : "rows"} could not be read`, "stale")))
    .when(days.length === 0, (el) => el.child(note(t, "No days in the ledger yet.")))
    .children(days.slice(0, MAX_DRAWN_DAYS).map((d) => {
      const total = totalFor(ledger.data, d.date);
      return v_flex().gap(2)
        .child(h_flex().gap(8).items_center()
          .child(div().text_size(12).font_semibold().child(`${d.date} ${weekdayOf(d.date)}`))
          .child(div().flex_1().text_size(11).text_color(t.dim).child(total ? `${minutesText(total.minutes)} · ${total.runs} ${total.runs === 1 ? "run" : "runs"}` : ""))
          .child(button(t, `led-log-${d.date}`, "Log day (L)", () => v.openLogDay(d.date))))
        .children(d.rows.map((r) => {
          const i = ++index;
          const here = i === v.cursor;
          return h_flex().id(`led-${d.date}-${i}`).gap(8).px(4).h(22).items_center().rounded(4).cursor_pointer()
            .when(here, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click((e, cx) => { v.cursor = i; if (v.handle) v.handle.focus(); if (e.click_count >= 2) openLink(r.pr_url); cx.notify(); }) // a click selects; a double-click or Enter opens the pull request
            .child(rowAction(t, `led-open-${d.date}-${i}`, "↗", "Open the pull request (Enter)", r.pr_url ? (_e, cx) => { v.cursor = i; openLink(r.pr_url); cx.notify(); } : null))
            .child(link(t, `led-t-${d.date}-${i}`, r.task ? r.task.key : "—", r.task ? r.task.url : null, 76))
            .child(link(t, `led-p-${d.date}-${i}`, `!${r.pr}`, r.pr_url, 56))
            .child(div().w(34).flex_none().text_size(12).text_color(t.muted).child(`${r.runs}×`))
            .child(tip(div().flex_1().truncate().text_size(11).text_color(t.dim).child(r.times.join(", ")), r.times.join(", ")))
            .child(div().w(54).flex_none().text_size(12).child(minutesText(r.minutes)));
        }));
    }));
}
