// Todos, notes and priorities (D26, R10): the owner's plain `.md` files. Space or a click toggles a
// todo, Shift+Up and Shift+Down move the row, `b` puts a todo on the board, `a` adds a line (notes: moves to the input), `e` opens the file in the default program, `r`
// reads it again.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, setShared } from "herdr";
import { SETTINGS_REV } from "../hub.js";
import { jiraKeys } from "../core/jira.js";
import { todoRows, noteRows, priorityRows, submitLine } from "../core/lists.js";
import { dataPath, LIST_FILES, toggleInTodos, addToList, addToBoard, moveInList } from "../store.js";
import { field } from "../dialogs/jira-dialogs.js";
import { openLink, openPath } from "../open.js";
import { button, note, tip } from "../ui.js";

const listFile = (id) => dataPath(LIST_FILES[id]).replaceAll("\\", "/");

/** `e`: opens the file in the default program, once there is a file to open. */
export function editFile(v) {
  if (v.list.text === null && !v.list.error) v.message = "no file yet, add a line first";
  else openPath(listFile(v.widget.id));
}

export const todoList = (v) => todoRows(v.list.text);
export const noteList = (v) => noteRows(v.list.text);
/** Priorities use the issues of friday.jira when there are any; plain text otherwise. */
export const priorityList = (v) => priorityRows(v.list.text, v.hub.jira()?.data.issues);

/** Flips one todo; one toggle at a time, then the file is read again. */
export function toggleTodoRow(v, row, cx) {
  if (!row || v.busy) return;
  v.busy = true;
  v.message = null;
  cx.spawn(async (cx) => {
    try {
      const r = await toggleInTodos(row).catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) v.message = r.message;
      await v.readInto(true);
    } finally {
      v.busy = false;
      cx.notify();
    }
  });
}

/** Shift+Up, Shift+Down or the Up and Down buttons: moves the cursor's row; one write at a time, the cursor follows the row. */
export function moveListRowAt(v, rows, dir, cx) {
  const i = v.cursor;
  const row = rows[i];
  const edge = dir === "up" ? i <= 0 : i >= rows.length - 1;
  if (!row || edge || v.busy) return;
  v.busy = true;
  v.message = null;
  cx.spawn(async (cx) => {
    try {
      const r = await moveInList(v.widget.id, i, row, dir).catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) v.message = r.message;
      else if (r.changed) v.cursor = i + (dir === "up" ? -1 : 1);
      await v.readInto(true);
    } finally {
      v.busy = false;
      cx.notify();
    }
  });
}

/** `b` or the row's button: puts the todo's text on the board's TODO column, unless a card with that text is there. */
export function todoToBoard(v, row, cx) {
  if (!row || v.busy) return;
  v.busy = true;
  v.message = null;
  cx.spawn(async (cx) => {
    try {
      const r = await addToBoard("todo", row.body.trim(), true).catch(() => ({ ok: false, message: "could not write the file" }));
      v.message = r.ok ? (r.changed ? "added to the board" : "already on the board") : r.message;
      if (r.ok && r.changed && jiraKeys(row.body).length > 0) setShared(SETTINGS_REV, Date.now()); // a new key reaches Jira on the next poll
    } finally {
      v.busy = false;
      cx.notify();
    }
  });
}

/** Enter in the note input: one write at a time, then the file is read again. */
export function submitNote(v, cx) {
  if (v.busy) return;
  v.busy = true;
  v.message = null;
  cx.spawn(async (cx) => {
    try {
      const r = await submitLine(v.noteInput, (text) => addToList("notes", text));
      if (!r.ok) v.message = r.message;
      await v.readInto(true);
    } finally {
      v.busy = false;
      cx.notify();
    }
  });
}

const EMPTY = { todos: "No todos yet. Add one with a.", notes: "No notes yet. Type one above.", priorities: "No priorities yet. Add one with a." };

/** The frame shared by the three: toolbar, messages, and the rows `draw(row, i)` makes. */
function renderList(v, rows, draw) {
  const t = theme();
  const id = v.widget.id;
  if (!v.list.loaded) return v_flex().size_full().p(12).child(note(t, "Reading the file…"));
  return v_flex().size_full().overflow_y_scrollbar().p(10).gap(4)
    .when(Boolean(v.list.error), (el) => el.child(note(t, `${v.list.error}${v.list.text === null ? "" : " (showing the last read)"}`, "error")))
    .when(Boolean(v.message), (el) => el.child(note(t, v.message, "stale")))
    .child(h_flex().gap(8)
      .when(id !== "notes", (el) => el.child(button(t, `${id}-add`, "Add (a)", () => v.openAddLine()))) // notes has its input
      .child(button(t, `${id}-edit`, "Edit file (e)", () => editFile(v)))
      .child(button(t, `${id}-up`, "▲ Up", (_e, cx) => moveListRowAt(v, rows, "up", cx)))
      .child(button(t, `${id}-down`, "▼ Down", (_e, cx) => moveListRowAt(v, rows, "down", cx))))
    .when(rows.length === 0 && !v.list.error, (el) => el.child(note(t, EMPTY[id])))
    .children(rows.map((r, i) => h_flex().id(`${id}-${i}`).gap(8).px(4).min_h(24).items_center().rounded(4).cursor_pointer()
      .when(i === v.cursor, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((e, cx) => { v.cursor = i; if (v.handle) v.handle.focus(); draw.click(v, r, cx, e); cx.notify(); })
      .child(draw.row(t, r))));
}

export function renderTodos(v) {
  const t = theme();
  return renderList(v, todoList(v), {
    click: (v2, r, cx) => toggleTodoRow(v2, r, cx),
    row: (t2, r) => h_flex().gap(8).flex_1().child(div().w(20).flex_none().text_size(12.5).text_color(r.done ? t2.dim : t2.accent).child(r.done ? "[x]" : "[ ]"))
      .child(tip(div().flex_1().truncate().text_size(12.5).text_color(r.done ? t.dim : t.foreground).child(r.body), r.body))
      .child(button(t, `todos-board-${r.line}`, "To board (b)", (_e, cx) => todoToBoard(v, r, cx))),
  });
}

export function renderNotes(v) {
  const t = theme();
  return v_flex().size_full()
    .child(div().flex_none().px(10).pt(10).child(field(t, v.noteInput))) // above the scrolling rows, so it is always there
    .child(div().flex_1().min_h(0).child(renderList(v, noteList(v), {
      click: () => {},
      row: (t2, r) => tip(div().flex_1().truncate().text_size(12.5).child(r.text), r.text),
    })));
}

export function renderPriorities(v) {
  return renderList(v, priorityList(v), {
    click: (_v, r, _cx, e) => { if (r.url && e.click_count >= 2) openLink(r.url); }, // a click selects; a double-click or Enter opens the issue
    row: (t, r) => h_flex().gap(8).flex_1()
      .child(div().w(20).flex_none().text_size(11).text_color(t.dim).child(String(r.n)))
      .child(div().w(76).flex_none().truncate().text_size(12).text_color(t.accent).child(r.key ?? ""))
      .child(tip(div().flex_1().truncate().text_size(12.5).child(r.label), r.label))
      .child(div().w(84).flex_none().truncate().text_size(11).text_color(t.dim).child(r.status)),
  });
}
