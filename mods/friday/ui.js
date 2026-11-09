// Small pieces every widget and dialog uses. Colors always come from theme().
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { openOverlay } from "herdr";
import { WIDGETS } from "./core/widgets.js";
import { stateText } from "./core/format.js";

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

/**
 * One action icon at the start of a row, with its name as a hover label. A row with no such action
 * gets a blank cell of the same width, so the rows line up. A click on the icon does not select the row.
 */
export function rowAction(t, id, glyph, label, onClick) {
  if (!onClick) return div().w(24).h(24).flex_none();
  return tip(iconButton(t, id, glyph, onClick), label);
}

export const openSettingsDialog = (section) => openOverlay({ mod: "friday", kind: "dialog", width: 540, height: 620, props: { dialog: "settings", section } });

/** The + menu; it splits `pane`. */
export const openAddMenu = (pane) => openOverlay({ mod: "friday", kind: "popup", width: 190, height: 90 + WIDGETS.length * 28, props: { dialog: "add", pane } });

/** A widget's one-line header: its title and state, then `before`, ↻, ⚙ and, when given, +. The caller sets the height. */
export function widgetHeader(t, w, hub, { refresh, settings, add, before = [] }) {
  const source = w && w.sources[0];
  const state = source ? hub.state(source) : "ok";
  const rec = source ? hub.status()[source] : undefined;
  return h_flex().px(10).gap(4).flex_none().items_center().border_b(1).border_color(t.border)
    .child(div().flex_none().text_size(12).font_semibold().child(w ? w.title : "Friday"))
    .child(tip(div().flex_1().truncate().pl(6).text_size(11).text_color(state === "error" ? t.ansi1 : t.dim).child(source ? stateText(state, rec) : ""), source ? stateText(state, rec) : ""))
    .children(before)
    .child(iconButton(t, "fr-refresh", "↻", (_e, cx) => refresh(cx)))
    .child(iconButton(t, "fr-settings", "⚙", () => settings()))
    .when(Boolean(add), (el) => el.child(iconButton(t, "fr-add", "+", () => add())));
}

/** The color of a state: ok green, stale yellow, error red, the rest dim. Theme names only. */
export function stateColor(t, state) {
  if (state === "ok") return t.ansi2;
  if (state === "stale") return t.ansi3;
  if (state === "error") return t.ansi1;
  return t.dim;
}

/** A line of text in a state's color. */
/** `el` with a hover label holding `text`, the full text of a line the row cuts short; no label for an empty text. */
export const tip = (el, text) => (text ? el.tooltip(text) : el);

export function note(t, text, state = "loading") {
  return div().text_size(12).text_color(stateColor(t, state)).child(text);
}
