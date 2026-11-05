// The board (D43, R13): board.md as four columns of cards. Arrows select, Shift+arrows move the
// selected card, `a` adds to the selected column, `e` opens the file, `r` reads it again. The rules
// are in core/board.js; this file only draws and reacts.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, setShared } from "herdr";
import { SETTINGS_REV } from "../hub.js";
import { parseBoard, nextSelection, selectMoved, movePlace, cardsWithoutStatus } from "../core/board.js";
import { moveOnBoard, importToBoard, dismissImport } from "../store.js";
import { openLink } from "../open.js";
import { button, note } from "../ui.js";
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

/** Shift+`dir`: moves the selected card; one write at a time, then the file is read again and the selection follows the card. */
function moveSelected(v, sel, dir, cx) {
  const place = movePlace(boardOf(v), sel, dir);
  if (!place || v.busy) return;
  const card = sel.card;
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
  if (dir && e.modifiers?.shift === true) moveSelected(v, sel, dir, cx);
  else if (dir) v.sel = nextSelection(board, sel, dir);
  else if (e.key === "a") v.openAddLine("board", sel.column);
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

function cardView(v, t, col, card, selected, issue) {
  return div().id(`bd-${col.id}-${card.line}`).flex_none().p(6).rounded(5).border_1().cursor_pointer()
    .border_color(selected ? t.accent : t.border)
    .max_h(62).overflow_hidden().text_size(12.5).text_color(col.id === "done" ? t.dim : t.foreground)
    .when(selected, (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => { v.sel = { column: col.id, card }; if (v.handle) v.handle.focus(); cx.notify(); })
    .child(card.body)
    .when(Boolean(issue), (el) => el.child(div().truncate().text_size(11).text_color(t.dim).child(`${issue.status} · ${issue.summary}`)));
}

function columnView(v, t, col, sel, issues) {
  const here = sel.column === col.id;
  const shown = col.id === "done" ? col.cards.slice(0, DONE_SHOWN) : col.cards;
  const more = col.cards.length - shown.length;
  return v_flex().id(`bd-col-${col.id}`).flex_1().min_w(0).min_h(0).gap(6)
    .child(h_flex().flex_none().px(4).gap(6).items_center()
      .child(div().text_size(12).font_semibold().text_color(here ? t.accent : t.foreground).child(col.title))
      .child(div().text_size(11).text_color(t.dim).child(String(col.cards.length))))
    .child(v_flex().id(`bd-list-${col.id}`).flex_1().min_h(0).overflow_y_scrollbar().gap(4)
      .children(shown.map((card) => cardView(v, t, col, card, here && sel.card?.line === card.line, col.id === "done" ? null : issues.get(card.key))))
      .when(more > 0, (el) => el.child(div().px(4).text_size(11).text_color(t.dim).child(`+${more} more`))));
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
  return v_flex().size_full().p(10).gap(6)
    .when(Boolean(v.list.error), (el) => el.child(note(t, `${v.list.error}${v.list.text === null ? "" : " (showing the last read)"}`, "error")))
    .when(Boolean(v.message), (el) => el.child(note(t, v.message, "stale")))
    .when(board.outside > 0, (el) => el.child(note(t, `${board.outside} ${board.outside === 1 ? "line" : "lines"} in the file not shown`, "stale")))
    .when(unknown > 0, (el) => el.child(note(t, `${unknown} ${unknown === 1 ? "card" : "cards"} without status`, "stale")))
    .when(v.offer.length > 0, (el) => el.child(offerView(v, t)))
    .when(empty && !v.list.error && v.offer.length === 0, (el) => el.child(note(t, "No cards yet. Add one with a.")))
    .child(h_flex().flex_1().min_h(0).gap(8).children(board.columns.map((col) => columnView(v, t, col, sel, issues))));
}
