// The + menu: pick a widget and where it goes. It splits the pane the + was clicked in, to the
// right or below, with a new Friday pane showing the chosen widget.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, props, run, closeOverlay } from "herdr";
import { WIDGETS } from "../core/widgets.js";

export class AddMenu {
  init() {
    this.direction = "right";
  }

  choose(widget) {
    const p = props() || {};
    closeOverlay(p.overlay);
    if (!p.pane) return;
    run("pane.split", { pane: p.pane, direction: this.direction, mod: "friday", props: { widget: widget.id } });
  }

  render() {
    const t = theme();
    const tab = (id, label, direction) => div().id(id).flex_1().h(24).flex().items_center().justify_center().rounded(5).text_size(12).cursor_pointer()
      .when(this.direction === direction, (el) => el.bg(t.selected).text_color(t.foreground))
      .when(this.direction !== direction, (el) => el.text_color(t.muted).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { this.direction = direction; cx.notify(); })
      .child(label);
    return v_flex().size_full().p(6).gap(4).bg(t.popover).text_size(12.5).text_color(t.foreground)
      .child(div().px(6).pt(4).text_size(11).text_color(t.dim).child("Add a pane"))
      .child(h_flex().gap(4).p(2).rounded(7).bg(t.raised).child(tab("add-right", "Right", "right")).child(tab("add-down", "Below", "down")))
      .children(WIDGETS.map((w) => h_flex().id(`add-${w.id}`).h(28).px(8).items_center().rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.selected))
        .on_click(() => this.choose(w))
        .child(w.title)));
  }
}
