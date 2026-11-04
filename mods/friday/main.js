// Friday: one mod, drawn as whichever widget `props().widget` names. A Friday tab holds several
// panes of it. The same mod also draws its own dialogs, with `props().dialog`.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, theme, panes, spaces, focused, run, openOverlay, closeOverlay, nextCommand } from "herdr";
import { Hub } from "./hub.js";
import { WIDGETS, widgetById, DEFAULT_SPLITS } from "./core/widgets.js";
import { planArrangement, splitTarget } from "./core/arrange.js";
import { planLaunch } from "./core/launch.js";
import { stateText } from "./core/format.js";
import { renderSummary } from "./widgets/summary.js";
import { renderLedger, flatRows } from "./widgets/ledger.js";
import { renderMeetings, meetingRows, joinRow } from "./widgets/meetings.js";
import { renderJira, jiraRows } from "./widgets/jira.js";
import { renderPrs, prRows, openPr } from "./widgets/prs.js";
import { renderFavorites, favoriteList, favoritesFile, logRow } from "./widgets/favorites.js";
import { renderTodos, renderNotes, renderPriorities, priorityList, todoList, noteList, toggleTodoRow, listFile } from "./widgets/lists.js";
import { AddLineDialog } from "./dialogs/addline.js";
import { readList } from "./store.js";
import { LogTimeDialog, AddFavoriteDialog } from "./dialogs/jira-dialogs.js";
import { LogDayDialog } from "./dialogs/logday.js";
import { SettingsDialog } from "./dialogs/settings.js";
import { AddMenu } from "./dialogs/add.js";
import { iconButton, note } from "./ui.js";
import { openLink, openPath } from "./open.js";

const DIALOGS = { settings: SettingsDialog, add: AddMenu, logtime: LogTimeDialog, addfavorite: AddFavoriteDialog, logday: LogDayDialog, addline: AddLineDialog };
const BODIES = { summary: renderSummary, ledger: renderLedger, meetings: renderMeetings, jira: renderJira, favorites: renderFavorites, prs: renderPrs, todos: renderTodos, notes: renderNotes, priorities: renderPriorities };
const LISTS = ["todos", "notes", "priorities"];

export default class Friday extends View {
  init(_props, cx) {
    // props() is null while `herdr-app check` loads the mod.
    const p = props() || {};
    // `mod.open:friday` opens this mod with only props().overlay: act as the launcher and vanish (no hub, no timers).
    if (p.overlay && !p.dialog && !p.widget) {
      this.launcher = true;
      closeOverlay(p.overlay); // first, so a failing run() leaves no overlay behind
      const at = focused();
      for (const [cmd, args] of planLaunch(panes(), spaces(), at?.space, at?.tab)) {
        try { run(cmd, args); } catch { break; }
      }
      return;
    }
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
    this.list = { text: null, loaded: false, error: null }; // todos, notes, priorities: the file as last read
    this.busy = false; // a todo toggle is in flight
    this.handle = cx.focus_handle();
    this.hub = new Hub(this.widget ? [this.widget.id] : []);
    this.hub.start(cx);
    if (this.widget && LISTS.includes(this.widget.id)) {
      this.reload(cx);
      cx.timer.every(3000, (cx) => this.reload(cx));
    }
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

  /** Reads this pane's list file (the files have no mtime, so a short poll catches edits made by hand). */
  async readInto() {
    const r = await readList(this.widget.id);
    this.list = r.ok ? { text: r.text, loaded: true, error: null } : { ...this.list, loaded: true, error: "could not read the file" };
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      await this.readInto();
      cx.notify();
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
    if (this.widget && LISTS.includes(this.widget.id)) return this.listKey(e, cx);
    if (this.widget && this.widget.id === "meetings") return this.meetingsKey(e, cx);
    if (this.widget && this.widget.id === "jira") return this.jiraKey(e, cx);
    if (this.widget && this.widget.id === "favorites") return this.favoritesKey(e, cx);
    if (this.widget && this.widget.id === "prs") return this.prsKey(e, cx);
    if (!this.widget || this.widget.id !== "ledger") return;
    const ledger = this.hub.ledger();
    const rows = ledger ? flatRows(ledger.data) : [];
    if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (e.key === "enter" && rows[this.cursor]) openLink(rows[this.cursor].row.pr_url);
    else if (e.key === "l" || e.key === "L") this.openLogDay(rows[this.cursor]?.day ?? ledger?.data.days[0]?.date);
    else if (e.key === "r") this.hub.refresh(cx);
    else return;
    cx.notify();
  }

  openLogTime(row) {
    openOverlay({ mod: "friday", kind: "dialog", width: 420, height: 400, props: { dialog: "logtime", key: row.key, summary: row.summary } });
  }

  openLogDay(day) {
    openOverlay({ mod: "friday", kind: "dialog", width: 520, height: 460, props: { dialog: "logday", day } });
  }

  openAddFavorite() {
    openOverlay({ mod: "friday", kind: "dialog", width: 360, height: 210, props: { dialog: "addfavorite" } });
  }

  favoritesKey(e, cx) {
    this.message = null;
    const rows = favoriteList(this);
    if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (e.key === "enter") logRow(this, rows[this.cursor]);
    else if (e.key === "o" && rows[this.cursor]?.url) openLink(rows[this.cursor].url);
    else if (e.key === "a") this.openAddFavorite();
    else if (e.key === "e") openPath(favoritesFile());
    else if (e.key === "r") this.hub.refresh(cx);
    else return;
    cx.notify();
  }

  openAddLine() {
    openOverlay({ mod: "friday", kind: "dialog", width: 380, height: 210, props: { dialog: "addline", list: this.widget.id } });
  }

  listKey(e, cx) {
    const id = this.widget.id;
    const rows = id === "todos" ? todoList(this) : id === "notes" ? noteList(this) : priorityList(this);
    this.message = null;
    if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (id === "todos" && (e.key === "space" || e.key === " " || e.key === "enter")) toggleTodoRow(this, rows[this.cursor], cx);
    else if (id === "priorities" && e.key === "enter" && rows[this.cursor]?.url) openLink(rows[this.cursor].url);
    else if (e.key === "a") this.openAddLine();
    else if (e.key === "e") openPath(listFile(id));
    else if (e.key === "r") { this.reload(cx); this.hub.refresh(cx); }
    else return;
    cx.notify();
  }

  prsKey(e, cx) {
    const rows = prRows(this);
    if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (e.key === "enter") openPr(this, rows[this.cursor], cx);
    else if (e.key === "m") this.hub.markSeen(cx, null);
    else if (e.key === "r") this.hub.refresh(cx);
    else return;
    cx.notify();
  }

  jiraKey(e, cx) {
    const rows = jiraRows(this);
    if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (e.key === "enter" && rows[this.cursor]) openLink(rows[this.cursor].url);
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
      .child(iconButton(t, "fr-refresh", "↻", (_e, cx) => { this.hub.refresh(cx); if (LISTS.includes(w?.id)) this.reload(cx); }))
      .child(iconButton(t, "fr-settings", "⚙", () => this.openSettings(null)))
      .child(iconButton(t, "fr-add", "+", () => this.openAdd()));
  }

  render(cx) {
    if (this.launcher) return div();
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
