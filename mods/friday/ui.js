// Small pieces every widget and dialog uses. Colors always come from theme().
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";

/** A text button. `primary` is the filled one. */
export function button(t, id, label, onClick, primary = false) {
  return h_flex().id(id).h(26).px(10).flex_none().items_center().rounded(6).text_size(12).cursor_pointer()
    .border_1().border_color(primary ? t.solid : t.input)
    .text_color(primary ? t.solid_foreground : t.foreground)
    .when(primary, (el) => el.bg(t.solid))
    .hover((s) => s.opacity(0.85))
    .on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); })
    .child(label);
}

/** A small header button: a glyph, no frame. */
export function iconButton(t, id, glyph, onClick) {
  return div().id(id).w(24).h(24).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
    .text_size(14).text_color(t.muted)
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); })
    .child(glyph);
}

/** The color of a state: ok green, stale yellow, error red, the rest dim. Theme names only. */
export function stateColor(t, state) {
  if (state === "ok") return t.ansi2;
  if (state === "stale") return t.ansi3;
  if (state === "error") return t.ansi1;
  return t.dim;
}

/** A line of text in a state's color. */
export function note(t, text, state = "loading") {
  return div().text_size(12).text_color(stateColor(t, state)).child(text);
}
