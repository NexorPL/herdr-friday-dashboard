// Today's meetings (D07, D24): all-day events on top, then the timed ones in order. Meetings whose
// time has passed are hidden (R04); `h` or the link at the top shows them in their slots. A click on
// a row, or Enter on the cursor, joins the meeting (A01) in the browser or the Teams/Meet app.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { todayRows, rowTime, localDay } from "../core/meetings.js";
import { offsetNow } from "../net.js";
import { openLink } from "../open.js";
import { button, note, rowAction, tip } from "../ui.js";

/** The rows to draw now, for the view and its keys alike. */
export function meetingRows(v, now = Date.now()) {
  const m = v.hub.meetings();
  if (!m) return [];
  const offsetMin = offsetNow();
  return todayRows(m.data.meetings, { today: localDay(now, offsetMin), offsetMin, now, showPast: v.showPast });
}

/** Joins a row; the message says why when it cannot. */
export function joinRow(v, row) {
  if (!row) return;
  v.message = row.join_url ? null : "no join link";
  if (row.join_url) openLink(row.join_url);
}

export function renderMeetings(v) {
  const t = theme();
  const state = v.hub.state("calendar");
  const status = v.hub.status().calendar;
  if (state === "not_set_up") {
    return v_flex().size_full().p(12).gap(8)
      .child(note(t, "Meetings need the secret iCal address of your calendar."))
      .child(h_flex().child(button(t, "mt-settings", "Set up the calendar", () => v.openSettings("calendar"), true)));
  }
  const m = v.hub.meetings();
  if (!m) {
    return v_flex().size_full().p(12).gap(8)
      .child(state === "error" ? note(t, status?.error ?? "error", "error") : note(t, "Reading the calendar…"))
      .when(state === "error", (el) => el.child(h_flex().child(button(t, "mt-settings", "Open Settings", () => v.openSettings("calendar")))));
  }
  const offsetMin = offsetNow();
  const rows = meetingRows(v);
  return v_flex().size_full().overflow_y_scrollbar().p(10).gap(4)
    .when(state === "error", (el) => el.child(note(t, `${status?.error} (showing the last read)`, "error")))
    .when(Boolean(m.data.note), (el) => el.child(note(t, m.data.note, "stale")))
    .when(Boolean(v.message), (el) => el.child(note(t, v.message, "stale")))
    .child(div().id("mt-past").text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => { v.showPast = !v.showPast; cx.notify(); })
      .child(v.showPast ? "Hide past meetings (h)" : "Show past meetings (h)"))
    .when(rows.length === 0, (el) => el.child(note(t, v.showPast ? "No meetings today." : "No more meetings today.")))
    .children(rows.map((r, i) => h_flex().id(`mt-${i}`).gap(8).px(4).h(24).items_center().rounded(4).cursor_pointer()
      .when(i === v.cursor, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((e, cx) => { v.cursor = i; if (v.handle) v.handle.focus(); if (e.click_count >= 2) joinRow(v, r); cx.notify(); }) // a click selects; a double-click or Enter joins
      .child(rowAction(t, `mt-join-${i}`, "▶", `Join ${r.join_kind ?? "the meeting"} (Enter)`, r.join_url ? (_e, cx) => { v.cursor = i; joinRow(v, r); cx.notify(); } : null))
      .child(div().w(54).flex_none().text_size(12).text_color(r.past ? t.dim : t.muted).child(rowTime(r, offsetMin)))
      .child(tip(div().flex_1().truncate().text_size(12.5).text_color(r.past ? t.dim : t.foreground).child(r.title), r.title))
      .child(div().flex_none().text_size(11).text_color(t.accent).child(r.join_kind ?? ""))));
}
