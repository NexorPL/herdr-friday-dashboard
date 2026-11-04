// My Jira issues (G19): the issues assigned to the owner that are not done, highest priority first,
// then by key. A click on a row, or Enter on the cursor, opens the issue in the browser.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { myRows } from "../core/jira.js";
import { openLink } from "../open.js";
import { button, note } from "../ui.js";

/** The rows to draw now, for the view and its keys alike. */
export function jiraRows(v) {
  const j = v.hub.jira();
  return j ? myRows(j.data.issues) : [];
}

export function renderJira(v) {
  const t = theme();
  const state = v.hub.state("jira");
  const status = v.hub.status().jira;
  if (state === "not_set_up") {
    return v_flex().size_full().p(12).gap(8)
      .child(note(t, "Jira needs your site, e-mail and an API token."))
      .child(h_flex().child(button(t, "jira-settings", "Set up Jira", () => v.openSettings("jira"), true)));
  }
  const j = v.hub.jira();
  if (!j) {
    return v_flex().size_full().p(12).gap(8)
      .child(state === "error" ? note(t, status?.error ?? "error", "error") : note(t, "Reading Jira…"))
      .when(state === "error", (el) => el.child(h_flex().child(button(t, "jira-settings", "Open Settings", () => v.openSettings("jira")))));
  }
  const rows = jiraRows(v);
  return v_flex().size_full().overflow_y_scrollbar().p(10).gap(4)
    .when(state === "error", (el) => el.child(note(t, `${status?.error} (showing the last read)`, "error")))
    .when(rows.length === 0, (el) => el.child(note(t, "No open issues assigned to you.")))
    .children(rows.map((r, i) => h_flex().id(`jira-${i}`).gap(8).px(4).h(24).items_center().rounded(4).cursor_pointer()
      .when(i === v.cursor, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { v.cursor = i; if (v.handle) v.handle.focus(); openLink(r.url); cx.notify(); })
      .child(div().w(84).flex_none().truncate().text_size(12).text_color(t.accent).child(r.key))
      .child(div().flex_1().truncate().text_size(12.5).child(r.summary))
      .child(div().w(84).flex_none().truncate().text_size(11).text_color(t.dim).child(r.status))
      .child(div().w(64).flex_none().truncate().text_size(11).text_color(t.muted).child(r.priority))));
}
