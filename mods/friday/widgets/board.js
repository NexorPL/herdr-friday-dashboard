// The board (D43, R13): board.md as four columns of cards. Arrows select, Shift+arrows move the
// selected card, a press and a release elsewhere moves a card by mouse, `a` or `+` adds to the selected
// column, `k` rewrites the card, `Delete` deletes it after a question, `p` flags it as a priority (a "! " before its text, D44), `e` opens the file, `r` reads it again. The rules are in core/board.js; this file only
// draws and reacts.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, setShared } from "herdr";
import { SETTINGS_REV } from "../hub.js";
import { parseBoard, priorityCards, nextSelection, selectMoved, movePlace, cardsWithoutStatus, cardFace, dropPlace, dropSlot } from "../core/board.js";
import { moveOnBoard, flagOnBoard, importToBoard, dismissImport } from "../store.js";
import { openLink } from "../open.js";
import { button, note, stateColor, tip } from "../ui.js";
import { editFile } from "./lists.js";

/** Done can grow forever (R10 forbids deleting), so only this many of its cards are drawn. */
const DONE_SHOWN = 50;

/** The parsed board of the file as last read; parsed once per read. */
export function boardOf(v) {
  if (!v.boardCache || v.boardCache.text !== v.list.text) v.boardCache = { text: v.list.text, board: parseBoard(v.list.text) };
  return v.boardCache.board;
}

/** The selection on the current board: the card is found again after a read, else the column's first card. */
export function selectionOf(v) {
  const board = boardOf(v);
  const s = v.sel;
  const col = board.columns.find((c) => c.id === s?.column);
  if (!col) return nextSelection(board, null, "down");
  const was = s.card;
  const card = was ? (col.cards.find((c) => c.text === was.text && c.line === was.line) ?? col.cards.find((c) => c.text === was.text) ?? col.cards[0]) : col.cards[0];
  return { column: col.id, card: card ?? null };
}

/** Moves `card` to `place` (null does nothing); one write at a time, then the file is read again and the selection follows the card. */
function moveTo(v, card, place, cx) {
  if (!place || v.busy) return;
  v.busy = true;
  cx.spawn(async (cx) => {
    try {
      const r = await moveOnBoard(card, place).catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) v.message = r.message;
      else if (card.key && card.column === "done") setShared(SETTINGS_REV, Date.now()); // a card back from Done takes a slot: its status arrives on the next poll
      await v.readInto(true);
      v.sel = selectMoved(boardOf(v), card, place) ?? selectionOf(v);
    } finally {
      v.busy = false;
      cx.notify();
    }
  });
}

/** Sets or clears the priority flag of `card`; one write at a time, then the file is read again and the selection stays on the card. */
function flagCard(v, card, cx) {
  if (!card || v.busy) return;
  v.busy = true;
  cx.spawn(async (cx) => {
    try {
      const r = await flagOnBoard(card, !card.flag).catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) v.message = r.message;
      await v.readInto(true);
      const col = boardOf(v).columns.find((c) => c.id === card.column);
      const now = col?.cards.find((c) => c.body === card.body && c.flag !== card.flag);
      v.sel = now ? { column: col.id, card: now } : selectionOf(v);
    } finally {
      v.busy = false;
      cx.notify();
    }
  });
}

/** The pointer is `over` a target while a card is held; a redraw only when the target changes (every redraw redraws the window). */
function setOver(v, over, cx) {
  const d = v.drag;
  if (!d || (d.over?.column === over?.column && d.over?.card?.line === over?.card?.line)) return;
  d.over = over;
  cx.notify();
}

function cancelDrag(v, cx) {
  if (!v.drag) return;
  v.drag = null;
  cx.notify();
}

/** A release: moves the held card to where the mark is. The kit has no release outside the pane, so leaving the board ends the drag. */
function drop(v, cx) {
  const d = v.drag;
  if (!d) return;
  v.drag = null;
  moveTo(v, d.card, dropPlace(d.card, d.over), cx);
  cx.notify();
}

/** Enter or `o`: opens the card's Jira issue when friday.jira knows its key. */
function openCard(v, card) {
  const issue = card?.key ? v.hub.jira()?.data.issues?.find((i) => i.key === card.key) : null;
  if (issue?.url) openLink(issue.url);
}

/** The keys of the focused board. Shift comes first, because `e.key` is "down" with Shift held too. */
export function boardKey(v, e, cx) {
  const board = boardOf(v);
  const sel = selectionOf(v);
  const dir = ["up", "down", "left", "right"].includes(e.key) ? e.key : null;
  v.message = null;
  if (dir && e.modifiers?.shift === true) moveTo(v, sel.card, movePlace(board, sel, dir), cx);
  else if (dir) v.sel = nextSelection(board, sel, dir);
  else if (e.key === "a" || e.key === "+" || e.key_char === "+") v.openAddLine("board", sel.column); // "+" is the numpad key too
  else if (e.key === "k" && sel.card) v.openEditCard(sel.card);
  else if (e.key === "delete" && sel.card) v.openDeleteCard(sel.card);
  else if (e.key === "p" && sel.card) { flagCard(v, sel.card, cx); return; } // the write redraws when it ends
  else if (e.key === "enter" || e.key === "o") openCard(v, sel.card);
  else if (e.key === "e") editFile(v);
  else if (e.key === "n") v.openAddLine("notes");
  else if (e.key === "r") { v.reload(cx); v.hub.refresh(cx); }
  else return;
  cx.notify();
}

/** Import or Dismiss: one write at a time, then the file is read again. */
function runImport(v, run, cx) {
  if (v.busy) return;
  v.busy = true;
  v.message = null;
  cx.spawn(async (cx) => {
    try {
      const r = await run().catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) v.message = r.message;
      else if (run === importToBoard) setShared(SETTINGS_REV, Date.now()); // imported cards with a key get their status on the next poll
      await v.readInto(true);
    } finally {
      v.busy = false;
      cx.notify();
    }
  });
}

function offerView(v, t) {
  const n = v.offer.length;
  return h_flex().flex_none().gap(8).items_center()
    .child(note(t, `Import ${n} ${n === 1 ? "line" : "lines"} from todos.md and priorities.md`))
    .child(button(t, "bd-import", "Import", (_e, cx) => runImport(v, importToBoard, cx), true))
    .child(button(t, "bd-dismiss", "Dismiss", (_e, cx) => runImport(v, dismissImport, cx)));
}

const LEGEND = "arrows select · Shift+arrows move · a or + add · k edit · p priority · Delete delete · Enter or o open in Jira · n note · e edit file · r refresh";

const pill = (text, color) => div().flex_none().px(6).rounded(8).border_1().border_color(color).text_size(10.5).text_color(color).child(text);

/** The color of Jira's status: the text says the status, this only helps the eye. */
function statusColor(t, issue) {
  if (issue.status_category === "done") return stateColor(t, "ok");
  return issue.status_category === "indeterminate" ? t.accent : t.muted;
}

function cardView(v, t, col, card, selected, issue) {
  const { title, detail } = cardFace(card, issue);
  const done = col.id === "done";
  return v_flex().id(`bd-${col.id}-${card.line}`).flex_none().gap(6).p(10).rounded(8).border_1().shadow_sm().cursor_pointer()
    .bg(selected ? t.selected : t.background)
    .border_color(selected || card.flag ? t.accent : t.border)
    .when(v.drag?.card.line === card.line, (el) => el.opacity(0.5))
    .hover((s) => s.bg(t.hover))
    .on_hover((over, cx) => { if (over) setOver(v, { column: col.id, card }, cx); }) // leaving keeps the target, so crossing a gap does not move the mark
    .on_mouse_down("left", (_e, cx) => {
      cx.stop_propagation(); // the board's own press cancels a drag
      v.message = null;
      v.sel = { column: col.id, card };
      v.drag = { card, over: { column: col.id, card } };
      if (v.handle) v.handle.focus();
      cx.notify();
    })
    .child(tip(div().max_h(53).overflow_hidden().line_height(1.35).text_size(13).text_color(done ? t.dim : t.foreground).child(title), card.body))
    .when(Boolean(detail), (el) => el.child(tip(div().truncate().text_size(11).text_color(t.dim).child(detail), detail)))
    .when(Boolean(card.key) || card.flag, (el) => el.child(h_flex().flex_wrap().gap(4).items_center()
      .when(card.flag, (row) => row.child(pill("priority", t.accent)))
      .when(Boolean(card.key), (row) => row.child(pill(card.key, t.dim)))
      .when(Boolean(issue), (row) => row.child(pill(issue.status, statusColor(t, issue))))));
}

/** The priorities in one row above the columns; a click selects the card in its column. */
function priorityStrip(v, t, board, sel, issues) {
  const cards = priorityCards(board);
  if (cards.length === 0) return null;
  return h_flex().id("bd-priorities").flex_none().flex_wrap().gap(6).items_center().px(8).py(4).rounded(8).border_1().border_color(t.accent)
    .child(div().text_size(11).font_semibold().text_color(t.accent).child("Priority"))
    .children(cards.map((card) => h_flex().id(`bd-prio-${card.line}`).max_w(240).h(24).px(8).items_center().rounded(8).border_1().cursor_pointer()
      .border_color(sel.card?.line === card.line ? t.accent : t.border)
      .bg(sel.card?.line === card.line ? t.selected : t.background)
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { v.sel = { column: card.column, card }; if (v.handle) v.handle.focus(); cx.notify(); })
      .child(tip(div().truncate().text_size(12).child(cardFace(card, issues.get(card.key)).title), card.body))));
}

/** The room above a card and below the last one. It is always there, so showing the mark moves nothing under the pointer. */
const markGap = (t, on) => div().flex_none().h(2).rounded(1).when(on, (el) => el.bg(t.accent));

function columnView(v, t, col, sel, issues) {
  const here = sel.column === col.id;
  const shown = col.id === "done" ? col.cards.slice(0, DONE_SHOWN) : col.cards;
  const more = col.cards.length - shown.length;
  const free = (over, cx) => { if (over) setOver(v, { column: col.id, card: null }, cx); };
  const slot = v.drag ? dropSlot(dropPlace(v.drag.card, v.drag.over), col.id, shown) : -1;
  return v_flex().id(`bd-col-${col.id}`).flex_1().min_w(0).min_h(0).gap(8).p(8).rounded(10).bg(t.canvas)
    .border_1().border_color(v.drag?.over?.column === col.id ? t.accent : t.canvas)
    .on_hover((over, cx) => {
      if (over && v.drag?.over?.column !== col.id) setOver(v, { column: col.id, card: null }, cx);
      else if (!over && v.drag?.over?.column === col.id) setOver(v, null, cx);
    })
    .child(h_flex().id(`bd-head-${col.id}`).flex_none().px(2).gap(6).items_center().on_hover(free)
      .child(div().text_size(12).font_semibold().text_color(here ? t.accent : t.foreground).child(col.title))
      .child(div().px(6).rounded(8).bg(t.raised).text_size(11).text_color(t.muted).child(String(col.cards.length))))
    .child(v_flex().id(`bd-list-${col.id}`).flex_1().min_h(0).overflow_y_scrollbar().gap(2)
      .children(shown.flatMap((card, i) => [markGap(t, slot === i), cardView(v, t, col, card, here && sel.card?.line === card.line, col.id === "done" ? null : issues.get(card.key))]))
      .child(markGap(t, slot === shown.length))
      .when(more > 0, (el) => el.child(div().px(4).text_size(11).text_color(t.dim).child(`+${more} more`)))
      .child(div().id(`bd-free-${col.id}`).flex_1().min_h(24).on_hover(free))); // always room to drop below the last card
}

export function renderBoard(v) {
  const t = theme();
  if (!v.list.loaded) return v_flex().size_full().p(12).child(note(t, "Reading the file…"));
  const board = boardOf(v);
  const sel = selectionOf(v);
  const jira = v.hub.jira(); // Jira's status of a keyed card; without Jira, or when it fails, a card is just its text
  const issues = new Map((jira?.data.issues ?? []).map((i) => [i.key, i]));
  const unknown = jira ? cardsWithoutStatus(board, jira.data.issues, jira.data.missing) : 0;
  const empty = board.columns.every((c) => c.cards.length === 0);
  return v_flex().id("bd-board").size_full().p(10).gap(6)
    .on_hover((over, cx) => { if (!over) cancelDrag(v, cx); })
    .on_mouse_down("left", (_e, cx) => cancelDrag(v, cx))
    .on_mouse_down_out((_e, cx) => cancelDrag(v, cx)) // a pointer that left too fast for a hover event
    .on_mouse_up("left", (_e, cx) => drop(v, cx))
    .child(h_flex().flex_none().gap(8)
      .child(button(t, "bd-add", "+ Add card", () => v.openAddLine("board", sel.column))) // the selected column; a is the same
      .when(Boolean(sel.card), (el) => el
        .child(button(t, "bd-edit", "Edit card (k)", () => v.openEditCard(sel.card)))
        .child(button(t, "bd-flag", sel.card.flag ? "Not a priority (p)" : "Priority (p)", (_e, cx) => flagCard(v, sel.card, cx)))
        .child(button(t, "bd-delete", "Delete (Del)", () => v.openDeleteCard(sel.card)))))
    .when(priorityCards(board).length > 0, (el) => el.child(priorityStrip(v, t, board, sel, issues)))
    .when(Boolean(v.list.error), (el) => el.child(note(t, `${v.list.error}${v.list.text === null ? "" : " (showing the last read)"}`, "error")))
    .when(Boolean(v.message), (el) => el.child(note(t, v.message, "stale")))
    .when(board.outside > 0, (el) => el.child(note(t, `${board.outside} ${board.outside === 1 ? "line" : "lines"} in the file not shown`, "stale")))
    .when(unknown > 0, (el) => el.child(note(t, `${unknown} ${unknown === 1 ? "card" : "cards"} without status`, "stale")))
    .when(v.offer.length > 0, (el) => el.child(offerView(v, t)))
    .when(empty && !v.list.error && v.offer.length === 0, (el) => el.child(note(t, "No cards yet. Add one with a.")))
    .child(h_flex().flex_1().min_h(0).gap(8).items_stretch().children(board.columns.map((col) => columnView(v, t, col, sel, issues)))) // h_flex centers its children: without the stretch a column collapses to its header and no card shows
    .child(div().flex_none().truncate().text_size(11).text_color(t.dim).child(LEGEND));
}
