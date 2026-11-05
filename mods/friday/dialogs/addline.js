// `a` in the todos, notes and priorities widgets: one line, appended to the owner's file.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState } from "gpui-base";
import { theme, props, closeOverlay, setShared } from "herdr";
import { SETTINGS_REV } from "../hub.js";
import { addToList, addToBoard } from "../store.js";
import { COLUMNS } from "../core/board.js";
import { jiraKeys } from "../core/jira.js";
import { field, label } from "./jira-dialogs.js";
import { button, note } from "../ui.js";

const TITLES = { todos: "Add a todo", notes: "Add a note", priorities: "Add a priority", board: "Add a card" };

export class AddLineDialog {
  init() {
    this.list = (props() || {}).list;
    this.column = COLUMNS.find((c) => c.id === (props() || {}).column)?.id ?? "todo"; // the board: the column the card goes to
    this.message = null;
    this.busy = false; // no second submit while a write is in flight or after it succeeded
    this.input = InputState.new({ value: "", placeholder: this.list === "priorities" || this.list === "board" ? "KEY-12 or text" : "Text" });
    this.input.on("submit", (_e, cx) => this.submit(cx));
  }

  submit(cx) {
    if (this.busy || !TITLES[this.list]) return;
    const text = this.input.value();
    this.busy = true;
    cx.spawn(async (cx) => {
      const r = await (this.list === "board" ? addToBoard(this.column, text) : addToList(this.list, text)).catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) {
        this.busy = false;
        this.message = { text: r.message, state: "error" };
        return cx.notify();
      }
      if (this.list === "priorities" || (this.list === "board" && jiraKeys(text).length > 0)) setShared(SETTINGS_REV, Date.now()); // a new key reaches Jira on the next poll
      closeOverlay((props() || {}).overlay);
    });
  }

  render() {
    const t = theme();
    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(12.5).p(18).gap(8)
      .child(div().text_size(15).font_semibold().child(this.list === "board" ? `Add a card to ${COLUMNS.find((c) => c.id === this.column).title}` : TITLES[this.list] ?? "Add a line"))
      .child(label(t, "One line"))
      .child(field(t, this.input))
      .when(Boolean(this.message), (el) => el.child(note(t, this.message.text, this.message.state)))
      .child(h_flex().gap(8).justify_end()
        .child(button(t, "al-cancel", "Cancel", () => closeOverlay((props() || {}).overlay)))
        .child(button(t, "al-add", this.busy ? "Adding…" : "Add", (_e, cx) => this.submit(cx), true)));
  }
}
