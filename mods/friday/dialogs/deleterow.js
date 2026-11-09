// Delete in the priorities and favorites widgets: asks first, then removes the row's line from its file (D51).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, props, closeOverlay, setShared } from "herdr";
import { SETTINGS_REV } from "../hub.js";
import { deleteInFavorites, deleteInList } from "../store.js";
import { button, note } from "../ui.js";

export class DeleteRowDialog {
  init() {
    const p = props() || {};
    this.list = p.list; // "priorities" or "favorites"
    this.index = p.index ?? 0;
    this.text = p.text ?? ""; // the row as drawn: a priority's text, a favorite's key
    this.message = null;
    this.busy = false; // no second delete while a write is in flight or after it succeeded
  }

  submit(cx) {
    if (this.busy || !["priorities", "favorites"].includes(this.list)) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      const r = await (this.list === "favorites" ? deleteInFavorites(this.text) : deleteInList(this.list, this.index, { text: this.text })).catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) {
        this.busy = false;
        this.message = { text: r.message, state: "error" };
        return cx.notify();
      }
      setShared(SETTINGS_REV, Date.now()); // the widgets read their file again
      closeOverlay((props() || {}).overlay);
    });
  }

  render() {
    const t = theme();
    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(12.5).p(18).gap(8)
      .child(div().text_size(15).font_semibold().child(this.list === "favorites" ? "Delete this favorite?" : "Delete this priority?"))
      .child(div().max_h(60).overflow_hidden().text_color(t.muted).child(this.text))
      .child(note(t, `Its line goes from ${this.list}.md. This cannot be undone.`, "stale"))
      .when(Boolean(this.message), (el) => el.child(note(t, this.message.text, this.message.state)))
      .child(h_flex().gap(8).justify_end()
        .child(button(t, "dr-cancel", "Cancel", () => closeOverlay((props() || {}).overlay)))
        .child(button(t, "dr-delete", this.busy ? "Deleting…" : "Delete", (_e, cx) => this.submit(cx), true)));
  }
}
