// The Friday button's menu in layouts/friday-panel.json: check the widgets the side panel shows and
// set their order. It stays open for several checks; a click beside it or Esc closes it.
import { div } from "gpui-kit";
import { h_flex, v_flex, Checkbox } from "gpui-base";
import { theme, run, layout } from "herdr";
import { widgetById } from "../core/widgets.js";
import { checkedWidgets, panelHidden, panelOrder, planHideAll, planPanel, planShowAll, shownWidgets, swapTarget, swapped } from "../core/panel.js";
import { iconButton } from "../ui.js";

export class PanelMenu {
  init() {}

  toggle(widget, cx) {
    for (const [cmd, args] of planPanel(layout(), widget.id)) run(cmd, args);
    cx.notify();
  }

  /** "Hide the panel" or "Show the panel": one click closes every widget and keeps which were checked, or opens them again. */
  hideShow(t, root) {
    const plan = shownWidgets(root).length > 0 ? planHideAll(root) : planShowAll(root);
    if (plan.length === 0) return null;
    const hide = !panelHidden(root);
    return h_flex().id("panel-hide-all").flex_none().h(28).px(8).gap(8).items_center().rounded(6).cursor_pointer()
      .border_b(1).border_color(t.border)
      .hover((s) => s.bg(t.selected))
      .on_click((_e, cx) => { for (const [cmd, args] of plan) run(cmd, args); cx.notify(); })
      .child(div().w(14).flex_none().text_color(t.muted).child(hide ? "▾" : "▸"))
      .child(div().truncate().child(hide ? "Hide the panel" : `Show the panel (${checkedWidgets(root).length})`));
  }

  arrow(t, widget, delta, glyph) {
    const target = swapTarget(layout(), widget.id, delta);
    if (!target) return div().w(24).h(24).flex_none();
    return iconButton(t, `panel-${widget.id}-${glyph}`, glyph, (_e, cx) => {
      run("layout.set", { layout: swapped(layout(), widget.id, target) });
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const root = layout();
    const shown = checkedWidgets(root);
    const open = !panelHidden(root);
    return v_flex().size_full().p(6).gap(4).bg(t.popover).text_size(12.5).text_color(t.foreground)
      .when(Boolean(this.hideShow(t, root)), (el) => el.child(this.hideShow(t, root)))
      .child(div().px(6).pt(4).text_size(11).text_color(t.dim).child("Show in the panel"))
      .children(panelOrder(root).map(widgetById).filter(Boolean).map((w) => {
        const on = shown.includes(w.id);
        return h_flex().flex_none().h(28).pr(2).items_center().rounded(6).hover((s) => s.bg(t.selected))
          .child(Checkbox.new(`panel-${w.id}`).checked(on).flex().flex_1().min_w(0).h_full().px(8).gap(8).items_center().cursor_pointer()
            .on_change((_checked, cx) => this.toggle(w, cx))
            .child(div().size(14).flex_none().flex().items_center().justify_center().rounded(3).text_size(11)
              .border_1().border_color(on ? t.accent : t.input).text_color(t.solid_foreground)
              .when(on, (el) => el.bg(t.accent).child("✓")))
            .child(div().truncate().child(w.title)))
          .when(on && open, (el) => el.child(this.arrow(t, w, -1, "↑")).child(this.arrow(t, w, 1, "↓")));
      }));
  }
}
