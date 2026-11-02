// Friday: one mod, drawn as whichever widget `props().widget` names. A Friday tab holds several
// panes of it. The same mod also draws its own dialogs, with `props().dialog`.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, theme, panes, focused, run, openOverlay, nextCommand } from "herdr";
import { Hub } from "./hub.js";
import { WIDGETS, widgetById, DEFAULT_SPLITS } from "./core/widgets.js";
import { planArrangement, splitTarget } from "./core/arrange.js";
import { stateText } from "./core/format.js";
import { renderSummary } from "./widgets/summary.js";
import { renderLedger, flatRows } from "./widgets/ledger.js";
import { renderMeetings, meetingRows, joinRow } from "./widgets/meetings.js";
import { SettingsDialog } from "./dialogs/settings.js";
import { AddMenu } from "./dialogs/add.js";
import { iconButton, note } from "./ui.js";
import { openLink } from "./open.js";

const DIALOGS = { settings: SettingsDialog, add: AddMenu };
const BODIES = { summary: renderSummary, ledger: renderLedger, meetings: renderMeetings };

export default class Friday extends View {
  init(_props, cx) {
    // props() is null while `herdr-app check` loads the mod.
    const p = props() || {};
    const Dialog = DIALOGS[p.dialog];
    if (Dialog) {
      this.dialog = new Dialog();
      this.dialog.init(cx);
      return;
    }
    this.widget = widgetById(p.widget);
    this.cursor = -1;
    this.showPast = false; // meetings: h shows the past ones (R04)
    this.message = null;
    this.handle = cx.focus_handle();
    this.hub = new Hub(this.widget ? [this.widget.id] : []);
    this.hub.start(cx);
    if (this.widget && this.widget.id === "meetings") cx.timer.every(30_000, (cx) => cx.notify()); // rows go past
    if (this.widget && this.widget.id === "summary") {
      cx.timer.every(1000, (cx) => cx.notify()); // R05: the clock updates every second
      this.arrange(cx, 0);
    }
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") this.handle.focus();
        // Key bindings "friday.settings" and "friday.add" open those dialogs; only the summary pane answers, so one opens.
        else if (command === "settings" && this.widget && this.widget.id === "summary") this.openSettings(null);
        else if (command === "add" && this.widget && this.widget.id === "summary") this.openAdd();
        cx.notify();
      }
    });
  }

  /** The first pane of a new Friday tab splits in the default panes, once, when it is alone. */
  arrange(cx, attempt) {
    const tab = focused()?.tab;
    const inTab = panes().filter((p) => p.tab === tab);
    // The copy starts before herdr-app has shown its tab, so wait until the shown tab has a Friday pane.
    if (!inTab.some((p) => p.mod === "friday") && attempt < 10) {
      cx.timer.after(300, (cx) => this.arrange(cx, attempt + 1));
      return;
    }
    for (const split of planArrangement(inTab, DEFAULT_SPLITS)) run("pane.split", split);
  }

  openSettings(section) {
    openOverlay({ mod: "friday", kind: "dialog", width: 540, height: 620, props: { dialog: "settings", section } });
  }

  openAdd() {
    const pane = splitTarget(focused(), panes());
    openOverlay({ mod: "friday", kind: "popup", width: 190, height: 90 + WIDGETS.length * 28, props: { dialog: "add", pane } });
  }

  key(e, cx) {
    if (this.widget && this.widget.id === "meetings") return this.meetingsKey(e, cx);
    if (!this.widget || this.widget.id !== "ledger") return;
    const ledger = this.hub.ledger();
    const rows = ledger ? flatRows(ledger.data) : [];
    if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (e.key === "enter" && rows[this.cursor]) openLink(rows[this.cursor].row.pr_url);
    else if (e.key === "r") this.hub.refresh(cx);
    else return;
    cx.notify();
  }

  meetingsKey(e, cx) {
    this.message = null;
    const rows = meetingRows(this);
    if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (e.key === "enter") joinRow(this, rows[this.cursor]);
    else if (e.key === "h") { this.showPast = !this.showPast; this.cursor = -1; }
    else if (e.key === "r") this.hub.refresh(cx);
    else return;
    cx.notify();
  }

  header(t) {
    const w = this.widget;
    const source = w && w.sources[0];
    const state = source ? this.hub.state(source) : "ok";
    const rec = source ? this.hub.status()[source] : undefined;
    return h_flex().h(28).px(10).gap(4).flex_none().items_center().border_b(1).border_color(t.border)
      .child(div().flex_none().text_size(12).font_semibold().child(w ? w.title : "Friday"))
      .child(div().flex_1().truncate().pl(6).text_size(11).text_color(state === "error" ? t.ansi1 : t.dim).child(source ? stateText(state, rec) : ""))
      .child(iconButton(t, "fr-refresh", "↻", (_e, cx) => this.hub.refresh(cx)))
      .child(iconButton(t, "fr-settings", "⚙", () => this.openSettings(null)))
      .child(iconButton(t, "fr-add", "+", () => this.openAdd()));
  }

  render(cx) {
    if (this.dialog) return this.dialog.render(cx);
    const t = theme();
    const body = this.widget
      ? BODIES[this.widget.id](this)
      : v_flex().p(12).gap(6)
        .child(note(t, `Unknown widget "${(props() || {}).widget ?? ""}".`, "error"))
        .child(note(t, `This Friday knows: ${WIDGETS.map((w) => w.id).join(", ")}. Use + to add one.`));
    return v_flex().id("friday").size_full().text_color(t.foreground).track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .child(this.header(t))
      .child(div().flex_1().min_h(0).child(body));
  }
}
