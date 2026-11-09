// Active pull requests of the chosen Azure DevOps repo, newest first. A dot marks a new one (new
// since you last looked, G15), "draft" a draft. A click on a row, or Enter, opens the PR in the
// browser and clears its mark; "Mark all seen" (m) clears every mark.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { openLink } from "../open.js";
import { button, note, tip } from "../ui.js";

/** The rows to draw now, for the view and its keys alike. */
export function prRows(v) {
  const p = v.hub.prs();
  return p ? p.data.prs : [];
}

/** Opens a row (https only, via open.js) and clears its mark. */
export function openPr(v, row, cx) {
  if (!row) return;
  openLink(row.url);
  if (row.unseen) v.hub.markSeen(cx, row.id);
}

export function renderPrs(v) {
  const t = theme();
  const state = v.hub.state("ado");
  const status = v.hub.status().ado;
  if (state === "not_set_up") {
    return v_flex().size_full().p(12).gap(8)
      .child(note(t, "Azure DevOps needs your organization, a PAT and a repo."))
      .child(h_flex().child(button(t, "prs-settings", "Set up Azure DevOps", () => v.openSettings("ado"), true)));
  }
  const p = v.hub.prs();
  if (!p) {
    return v_flex().size_full().p(12).gap(8)
      .child(state === "error" ? note(t, status?.error ?? "error", "error") : note(t, "Reading pull requests…"))
      .when(state === "error", (el) => el.child(h_flex().child(button(t, "prs-settings", "Open Settings", () => v.openSettings("ado")))));
  }
  const rows = prRows(v);
  const unseen = rows.filter((r) => r.unseen).length;
  return v_flex().size_full().overflow_y_scrollbar().p(10).gap(4)
    .when(state === "error", (el) => el.child(note(t, `${status?.error} (showing the last read)`, "error")))
    .when(rows.length === 0, (el) => el.child(note(t, "No active pull requests.")))
    .when(unseen > 0, (el) => el.child(h_flex().gap(8).items_center()
      .child(div().flex_1().text_size(11).text_color(t.dim).child(`${unseen} new`))
      .child(button(t, "prs-seen", "Mark all seen (m)", (_e, cx) => v.hub.markSeen(cx, null)))))
    .children(rows.map((r, i) => h_flex().id(`pr-${i}`).gap(8).px(4).h(24).items_center().rounded(4).cursor_pointer()
      .when(i === v.cursor, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { v.cursor = i; if (v.handle) v.handle.focus(); openPr(v, r, cx); cx.notify(); })
      .child(div().w(12).flex_none().text_size(12).text_color(t.accent).child(r.unseen ? "●" : ""))
      .child(div().w(52).flex_none().truncate().text_size(12).text_color(t.accent).child(`!${r.id}`))
      .child(tip(div().flex_1().truncate().text_size(12.5).child(r.title), r.title))
      .child(div().w(44).flex_none().text_size(11).text_color(t.dim).child(r.is_draft ? "draft" : ""))
      .child(div().w(96).flex_none().truncate().text_size(11).text_color(t.muted).child(r.author))));
}
