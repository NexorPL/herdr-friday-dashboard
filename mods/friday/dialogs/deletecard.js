// Delete on the board: asks first, then removes the card's lines from board.md (D49). The only dialog that deletes.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, props, closeOverlay } from "herdr";
import { deleteOnBoard } from "../store.js";
import { button, note } from "../ui.js";

export class DeleteCardDialog {
  init() {
    this.card = (props() || {}).card ?? null;
    this.message = null;
    this.busy = false; // no second delete while a write is in flight or after it succeeded
  }

  submit(cx) {
    if (this.busy || !this.card) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      const r = await deleteOnBoard(this.card).catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) {
        this.busy = false;
        this.message = { text: r.message, state: "error" };
        return cx.notify();
      }
      closeOverlay((props() || {}).overlay);
    });
  }

  render() {
    const t = theme();
    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(12.5).p(18).gap(8)
      .child(div().text_size(15).font_semibold().child("Delete this card?"))
      .child(div().max_h(60).overflow_hidden().text_color(t.muted).child(this.card?.body ?? ""))
      .child(note(t, this.card?.size > 1 ? `Its ${this.card.size - 1} indented ${this.card.size === 2 ? "line goes" : "lines go"} with it. This cannot be undone.` : "This cannot be undone.", "stale"))
      .when(Boolean(this.message), (el) => el.child(note(t, this.message.text, this.message.state)))
      .child(h_flex().gap(8).justify_end()
        .child(button(t, "dc-cancel", "Cancel", () => closeOverlay((props() || {}).overlay)))
        .child(button(t, "dc-delete", this.busy ? "Deleting…" : "Delete", (_e, cx) => this.submit(cx), true)));
  }
}
