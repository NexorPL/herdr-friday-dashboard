// The summary: the clock (R05), the date and today's review minutes; until Settings has been saved
// once, the setup checklist instead of the totals.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { clockText, dateText, ymd, reviewLine } from "../core/format.js";
import { totalFor } from "../core/ledger.js";
import { checklist } from "../core/setup.js";
import { button, note, stateColor } from "../ui.js";

function settingsNotice(t, settings) {
  if (settings.state === "newer") return note(t, `settings.json is version ${settings.version}; this Friday reads version 1. Update Friday.`, "error");
  if (settings.state === "corrupt") return note(t, "settings.json is not valid. Settings copies it aside and starts over when you save.", "error");
  if (settings.invalid.length) return note(t, `settings.json: invalid ${settings.invalid.join(", ")}, defaults used`, "stale");
  return null;
}

function checklistRows(t, v, now) {
  const rows = checklist({ status: v.hub.status(), now });
  return v_flex().gap(6).mt(8)
    .child(div().text_size(12).font_semibold().child("Set up Friday"))
    .children(rows.map((r) => h_flex().gap(8).items_center()
      .child(div().w(8).h(8).flex_none().rounded(4).bg(stateColor(t, r.state === "todo" ? "loading" : r.state)))
      .child(div().w(110).flex_none().text_size(12).child(r.label))
      .child(div().flex_1().truncate().text_size(11).text_color(t.dim).child(r.detail))
      .child(button(t, `setup-${r.id}`, "Set up", () => v.openSettings(r.section)))));
}

function totals(t, v, now) {
  const state = v.hub.state("ledger", now.getTime());
  const ledger = v.hub.ledger();
  if (ledger && (state === "ok" || state === "stale")) {
    return div().text_size(14).text_color(t.foreground).child(reviewLine(totalFor(ledger.data, ymd(now))));
  }
  if (state === "error") return note(t, `review: ${v.hub.status().ledger?.error ?? "error"}`, "error");
  return note(t, "review: reading the ledger…");
}

export function renderSummary(v) {
  const t = theme();
  const now = new Date();
  const notice = settingsNotice(t, v.hub.settings);
  return v_flex().size_full().p(14).gap(4).overflow_y_scrollbar()
    .child(div().text_size(34).font_semibold().text_color(t.foreground).child(clockText(now)))
    .child(div().text_size(14).text_color(t.muted).child(dateText(now)))
    .child(div().h(6))
    .when(Boolean(notice), (el) => el.child(notice))
    .child(v.hub.settings.state === "loading" ? note(t, "loading…") : v.hub.settings.saved ? totals(t, v, now) : checklistRows(t, v, now));
}
