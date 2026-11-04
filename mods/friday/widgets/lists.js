// Todos, notes and priorities (D26, R10): the owner's plain `.md` files. Space or a click toggles a
// todo, `a` adds a line, `e` opens the file in the default program, `r` reads it again.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { todoRows, noteRows, priorityRows } from "../core/lists.js";
import { dataPath, LIST_FILES, toggleInTodos } from "../store.js";
import { openLink, openPath } from "../open.js";
import { button, note } from "../ui.js";

const listFile = (id) => dataPath(LIST_FILES[id]).replaceAll("\\", "/");

/** `e`: opens the file in the default program, once there is a file to open. */
export function editFile(v) {
  if (v.list.text === null) v.message = "no file yet, add a line first";
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

const EMPTY = { todos: "No todos yet. Add one with a.", notes: "No notes yet. Add one with a.", priorities: "No priorities yet. Add one with a." };

/** The frame shared by the three: toolbar, messages, and the rows `draw(row, i)` makes. */
function renderList(v, rows, draw) {
  const t = theme();
  const id = v.widget.id;
  if (!v.list.loaded) return v_flex().size_full().p(12).child(note(t, "Reading the file…"));
  return v_flex().size_full().overflow_y_scrollbar().p(10).gap(4)
    .when(Boolean(v.list.error), (el) => el.child(note(t, `${v.list.error}${v.list.text === null ? "" : " (showing the last read)"}`, "error")))
    .when(Boolean(v.message), (el) => el.child(note(t, v.message, "stale")))
    .child(h_flex().gap(8)
      .child(button(t, `${id}-add`, "Add (a)", () => v.openAddLine()))
      .child(button(t, `${id}-edit`, "Edit file (e)", () => editFile(v))))
    .when(rows.length === 0 && !v.list.error, (el) => el.child(note(t, EMPTY[id])))
    .children(rows.map((r, i) => h_flex().id(`${id}-${i}`).gap(8).px(4).min_h(24).items_center().rounded(4).cursor_pointer()
      .when(i === v.cursor, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { v.cursor = i; if (v.handle) v.handle.focus(); draw.click(v, r, cx); cx.notify(); })
      .child(draw.row(t, r))));
}

export function renderTodos(v) {
  const t = theme();
  return renderList(v, todoList(v), {
    click: (v2, r, cx) => toggleTodoRow(v2, r, cx),
    row: (t2, r) => h_flex().gap(8).flex_1().child(div().w(20).flex_none().text_size(12.5).text_color(r.done ? t2.dim : t2.accent).child(r.done ? "[x]" : "[ ]"))
      .child(div().flex_1().truncate().text_size(12.5).text_color(r.done ? t.dim : t.foreground).child(r.body)),
  });
}

export function renderNotes(v) {
  return renderList(v, noteList(v), {
    click: () => {},
    row: (t, r) => div().flex_1().truncate().text_size(12.5).child(r.text),
  });
}

export function renderPriorities(v) {
  return renderList(v, priorityList(v), {
    click: (_v, r) => { if (r.url) openLink(r.url); },
    row: (t, r) => h_flex().gap(8).flex_1()
      .child(div().w(20).flex_none().text_size(11).text_color(t.dim).child(String(r.n)))
      .child(div().w(76).flex_none().truncate().text_size(12).text_color(t.accent).child(r.key ?? ""))
      .child(div().flex_1().truncate().text_size(12.5).child(r.label))
      .child(div().w(84).flex_none().truncate().text_size(11).text_color(t.dim).child(r.status)),
  });
}
