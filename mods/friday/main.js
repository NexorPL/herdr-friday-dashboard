// Friday: one mod, drawn as whichever widget `props().widget` names. A Friday tab holds several
// panes of it. The same mod also draws its own dialogs, with `props().dialog`.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState } from "gpui-base";
import { props, theme, panes, spaces, focused, run, layout, openOverlay, closeOverlay, nextCommand, shared, setShared, watchFolder, window } from "herdr";
import { Hub } from "./hub.js";
import { startSaving, restoreTab, documentPath } from "./arrangement.js";
import { WIDGETS, widgetById, DEFAULT_SPLITS } from "./core/widgets.js";
import { planArrangement, splitTarget, arrangesByDefault } from "./core/arrange.js";
import { restoreWidget } from "./core/arrangement.js";
import { planLaunch } from "./core/launch.js";
import { inPanel, isCollapsed, layoutHeadsPane, planAutoHide, planCollapse, shownWidgets } from "./core/panel.js";
import { renderSummary } from "./widgets/summary.js";
import { renderLedger, flatRows } from "./widgets/ledger.js";
import { renderMeetings, meetingRows, joinRow } from "./widgets/meetings.js";
import { renderPrs, prRows, openPr } from "./widgets/prs.js";
import { renderFavorites, favoriteList, favoritesFile, logRow, moveFavoriteRow } from "./widgets/favorites.js";
import { renderTodos, renderNotes, renderPriorities, priorityList, todoList, noteList, toggleTodoRow, todoToBoard, moveListRowAt, editFile, submitNote } from "./widgets/lists.js";
import { renderBoard, boardKey, boardOf } from "./widgets/board.js";
import { PaneHead, DOC_UNREADABLE } from "./widgets/pane-head.js";
import { importCandidates } from "./core/board.js";
import { AddLineDialog } from "./dialogs/addline.js";
import { DeleteCardDialog } from "./dialogs/deletecard.js";
import { readList, readDataText, dataDir, ARRANGEMENT_FILE, LIST_FILES } from "./store.js";
import { LogTimeDialog, AddFavoriteDialog } from "./dialogs/jira-dialogs.js";
import { LogDayDialog } from "./dialogs/logday.js";
import { SettingsDialog } from "./dialogs/settings.js";
import { AddMenu } from "./dialogs/add.js";
import { PanelMenu } from "./dialogs/panel.js";
import { iconButton, note, openAddMenu, openSettingsDialog, widgetHeader } from "./ui.js";
import { openLink, openPath } from "./open.js";

const DIALOGS = { settings: SettingsDialog, add: AddMenu, panel: PanelMenu, logtime: LogTimeDialog, addfavorite: AddFavoriteDialog, logday: LogDayDialog, addline: AddLineDialog, deletecard: DeleteCardDialog };
const BODIES = { summary: renderSummary, ledger: renderLedger, meetings: renderMeetings, favorites: renderFavorites, prs: renderPrs, todos: renderTodos, notes: renderNotes, priorities: renderPriorities, board: renderBoard };
const LISTS = ["todos", "notes", "priorities", "board"];
/** The side panel's expanded sizes: widget -> weight. */
const PANEL_SIZES = "friday.panel_sizes";

export default class Friday extends View {
  init(_props, cx) {
    // props() is null while `herdr-app check` loads the mod.
    const p = props() || {};
    // The Friday button in layouts/friday-panel.json: no widget or hub. Its one timer closes the panel in a Friday tab.
    if (p.panelMenu) {
      this.panelMenu = true;
      cx.timer.every(1000, (cx) => {
        for (const [cmd, args] of planAutoHide(layout(), panes(), focused()?.tab)) run(cmd, args);
        cx.notify();
      });
      return;
    }
    // `mod.open:friday` opens this mod with only props().overlay: act as the launcher and vanish (no hub, no timers).
    if (p.overlay && !p.dialog && !p.widget) {
      this.launcher = true;
      this.launch(cx, p.overlay);
      return;
    }
    const Dialog = p.paneHead ? PaneHead : DIALOGS[p.dialog];
    if (Dialog) {
      this.dialog = new Dialog();
      this.dialog.init(cx);
      return;
    }
    this.widget = widgetById(p.widget);
    this.block = p.block === true; // a layout block (layouts/friday*.json), not a pane in a tab
    this.cursor = -1;
    this.sel = null; // board: the selected { column, card }
    this.drag = null; // board: the card held by the mouse, { card, over }
    this.showPast = false; // meetings: h shows the past ones (R04)
    this.message = null;
    this.offer = []; // board: the lines the import would add
    this.list = { text: null, loaded: false, error: null }; // todos, notes, priorities: the file as last read
    this.busy = false; // a todo toggle is in flight
    this.reading = false; // a read of the list file is in flight
    this.readSeq = 0; // the newest read; an older result that arrives later is dropped
    this.watching = false; // watchFolder works: the timer is only a slow fallback
    this.handle = cx.focus_handle();
    this.noteFocused = false; // notes: the input has the keyboard, so typed keys are not widget keys
    if (this.widget && this.widget.id === "notes") {
      this.noteInput = InputState.new({ value: "", placeholder: "Type a note, Enter adds it" });
      this.noteInput.on("submit", (_e, cx) => submitNote(this, cx));
      this.noteInput.on("focus", () => { this.noteFocused = true; });
      this.noteInput.on("blur", () => { this.noteFocused = false; });
    }
    this.hub = new Hub(this.widget ? [this.widget.id] : []);
    this.hub.start(cx);
    const restore = !this.block && p.restore === true; // the launcher's new tab: rebuild the saved arrangement, not the default one
    if (!this.block) startSaving(cx, this.hub);
    if (restore) restoreTab(cx, p.widget);
    if (this.widget && LISTS.includes(this.widget.id)) {
      this.reload(cx);
      let tick = 0;
      cx.timer.every(3000, (cx) => { if (!this.watching || ++tick % 5 === 0) this.reload(cx); });
      // herdr-app tells when something in the data folder changed; if the watch cannot start the timer above carries on alone.
      cx.spawn(async (cx) => {
        try {
          while (!this.closed) {
            const paths = await watchFolder(dataDir());
            this.watching = true;
            // only this pane's file, or the root itself (a batch with the root means everything)
            // Windows and macOS file names are case-insensitive, Linux's are not.
            const norm = (s) => (window().platform === "linux" ? s : s.toLowerCase()).replaceAll("\\", "/").replace(/\/$/, "");
            const dir = norm(dataDir());
            const files = this.widget.id === "board" ? [LIST_FILES.board, LIST_FILES.todos, LIST_FILES.priorities] : [LIST_FILES[this.widget.id]]; // the board also watches the files it can import
            const mine = paths.some((p) => { const q = norm(String(p)); return q === dir || files.some((f) => q.endsWith(`/${norm(f)}`)); });
            if (!this.closed && mine && (await this.readInto(true))) cx.notify();
          }
        } catch {
          this.watching = false;
        }
      });
    }
    if (this.widget && this.widget.id === "meetings") cx.timer.every(30_000, (cx) => cx.notify()); // rows go past
    if (this.widget && this.widget.id === "summary") {
      cx.timer.every(1000, (cx) => cx.notify()); // R05: the clock updates every second
      if (arrangesByDefault(p)) this.arrange(cx, 0);
    }
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "focus") this.handle.focus();
        // Key bindings "friday.settings" and "friday.add" open those dialogs; only the summary pane answers, so one opens.
        else if (command === "settings" && this.widget && this.widget.id === "summary") this.openSettings(null);
        else if (command === "add" && this.widget && this.widget.id === "summary") this.openAdd();
        // The pane header's ↻: it has no list of its own to read.
        else if (command === "reload" && this.widget && LISTS.includes(this.widget.id)) this.reload(cx);
        cx.notify();
      }
    });
  }

  /**
   * `mod.open:friday`. Selecting a tab closes the overlay first, so a failing run() leaves none behind.
   * Creating one reads the saved arrangement, and closing a copy cancels its tasks, so there the
   * commands go before the close.
   */
  launch(cx, overlay) {
    const at = focused();
    const plan = (restore) => planLaunch(panes(), spaces(), at?.space, at?.tab, restore);
    const runAll = (steps) => {
      for (const [cmd, args] of steps) {
        try { run(cmd, args); } catch { break; }
      }
    };
    if (!plan(null).some(([cmd]) => cmd === "tab.new")) {
      closeOverlay(overlay);
      runAll(plan(null));
      return;
    }
    cx.spawn(async () => {
      try {
        runAll(plan(restoreWidget(await readDataText(ARRANGEMENT_FILE))));
      } finally {
        closeOverlay(overlay);
      }
    });
  }

  /** Reads this pane's list file (the files have no mtime, so a short poll catches edits made by hand). */
  async readInto(force = false) {
    if (!force && (this.reading || this.busy)) return false; // a tick during a read or a toggle waits for the next one
    const seq = ++this.readSeq;
    this.reading = true;
    try {
      const r = await readList(this.widget.id);
      if (seq !== this.readSeq) return false; // a newer read started meanwhile; its result wins
      const next = r.ok ? { text: r.text, loaded: true, error: null } : { ...this.list, loaded: true, error: r.error };
      let changed = !this.list.loaded || next.text !== this.list.text || next.error !== this.list.error;
      this.list = next;
      if (this.widget.id === "board") changed = (await this.readOffer(seq)) || changed;
      return changed;
    } finally {
      if (seq === this.readSeq) this.reading = false;
    }
  }

  /** The board: the lines todos.md and priorities.md could add, while the marker line is missing. True when the offer changed. */
  async readOffer(seq) {
    const was = JSON.stringify(this.offer ?? []);
    const text = this.list.text;
    let offer = [];
    if (!boardOf(this).imported) {
      const [todos, priorities] = await Promise.all([readList("todos"), readList("priorities")]);
      offer = importCandidates(text, todos.ok ? todos.text : null, priorities.ok ? priorities.text : null);
    }
    if (seq !== this.readSeq) return false; // a newer read started meanwhile; its offer wins
    this.offer = offer;
    return JSON.stringify(offer) !== was;
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      if (await this.readInto()) cx.notify();
    });
  }

  /** The host closes this copy: the folder watch loop ends after its next event. */
  close() {
    this.closed = true;
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
    for (const split of planArrangement(inTab, DEFAULT_SPLITS, this.block)) run("pane.split", split);
  }

  openSettings(section) {
    openSettingsDialog(section);
  }

  openAdd() {
    if (this.block) return; // the + splits a pane of a tab; a block has none
    openAddMenu(splitTarget(focused(), panes()));
  }

  key(e, cx) {
    if (this.noteFocused) { // a key in the input also reaches this handler on its way up the focus path
      if (e.key === "escape") this.handle.focus();
      return;
    }
    if (this.widget && this.widget.id === "board") return boardKey(this, e, cx);
    if (this.widget && LISTS.includes(this.widget.id)) return this.listKey(e, cx);
    if (this.widget && this.widget.id === "meetings") return this.meetingsKey(e, cx);
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
    if ((e.key === "down" || e.key === "up") && e.modifiers?.shift === true) moveFavoriteRow(this, rows, e.key, cx); // Shift first: e.key is "down" with Shift held too
    else if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (e.key === "enter") logRow(this, rows[this.cursor]);
    else if (e.key === "o" && rows[this.cursor]?.url) openLink(rows[this.cursor].url);
    else if (e.key === "a") this.openAddFavorite();
    else if (e.key === "e") openPath(favoritesFile());
    else if (e.key === "r") this.hub.refresh(cx);
    else return;
    cx.notify();
  }

  openAddLine(list = this.widget.id, column = undefined) {
    openOverlay({ mod: "friday", kind: "dialog", width: 380, height: 210, props: { dialog: "addline", list, column } });
  }

  /** The board: a dialog with the text of `card` (a card as drawn) to rewrite. */
  openEditCard(card) {
    openOverlay({ mod: "friday", kind: "dialog", width: 380, height: 210, props: { dialog: "addline", list: "board", card } });
  }

  /** The board: asks before deleting `card` (a card as drawn). */
  openDeleteCard(card) {
    openOverlay({ mod: "friday", kind: "dialog", width: 380, height: 190, props: { dialog: "deletecard", card } });
  }

  listKey(e, cx) {
    const id = this.widget.id;
    const rows = id === "todos" ? todoList(this) : id === "notes" ? noteList(this) : priorityList(this);
    this.message = null;
    if ((e.key === "down" || e.key === "up") && e.modifiers?.shift === true) moveListRowAt(this, rows, e.key, cx); // Shift first: e.key is "down" with Shift held too
    else if (e.key === "down") this.cursor = Math.min(rows.length - 1, this.cursor + 1);
    else if (e.key === "up") this.cursor = Math.max(0, this.cursor - 1);
    else if (id === "todos" && (e.key === "space" || e.key === " " || e.key === "enter")) toggleTodoRow(this, rows[this.cursor], cx);
    else if (id === "todos" && e.key === "b") todoToBoard(this, rows[this.cursor], cx);
    else if (id === "priorities" && e.key === "enter" && rows[this.cursor]?.url) openLink(rows[this.cursor].url);
    else if (id === "notes" && (e.key === "a" || e.key === "n")) this.noteInput.focus();
    else if (e.key === "a") this.openAddLine();
    else if (e.key === "n") this.openAddLine("notes"); // a quick note from any list (G29)
    else if (e.key === "e") editFile(this);
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
    return widgetHeader(t, this.widget, this.hub, {
      refresh: (cx) => { this.hub.refresh(cx); if (LISTS.includes(this.widget?.id)) this.reload(cx); },
      settings: () => this.openSettings(null),
      add: this.block ? null : () => this.openAdd(),
      before: this.collapseButton(t),
    }).h(28);
  }

  /** The chevron of a widget in the side panel: folds it to this header and back. */
  collapseButton(t) {
    const id = this.widget?.id;
    if (!this.block || !inPanel(layout(), id)) return [];
    return [iconButton(t, "fr-collapse", isCollapsed(layout(), id) ? "▸" : "▾", () => {
      const { args, sizes } = planCollapse(layout(), id, shared(PANEL_SIZES) ?? {});
      setShared(PANEL_SIZES, sizes);
      run("layout.resize", args);
    })];
  }

  /** The layout's pane header draws this pane's title and buttons, so its own would repeat them. */
  headedByLayout() {
    return layoutHeadsPane(layout(), { block: this.block, widget: this.widget, path: documentPath(), unreadable: shared(DOC_UNREADABLE) });
  }

  /** The button before the tab bar, drawn like its Files and Changes buttons. Its press must not drag the window. */
  renderPanelMenu(t) {
    const on = shownWidgets(layout()).length > 0;
    return h_flex().size_full().pl(10).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("fr-panel-menu").h(26).px(8).flex_none().items_center().rounded(6).text_size(12)
        .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => openOverlay({ mod: "friday", kind: "popup", width: 220, height: 76 + WIDGETS.length * 32, props: { dialog: "panel" } }))
        .child("Friday ▾"));
  }

  render(cx) {
    if (this.panelMenu) return this.renderPanelMenu(theme());
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
      .when(!this.headedByLayout(), (el) => el.child(this.header(t)))
      .child(div().flex_1().min_h(0).child(body));
  }
}
