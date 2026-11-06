// The pane header of Friday's layouts, one copy per pane. A Friday pane gets its widget's header, so no row
// says "friday"; every other pane looks as under herdr-app's shipped `pane` mod. panes() has no props, so
// the widget comes from the core's document, read only until found: a pane's widget never changes.
import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, setShared, shared, theme, home, readTextFile } from "herdr";
import { Hub, sleep } from "../hub.js";
import { documentPath } from "../arrangement.js";
import { lookupDelay, lookupGaveUp, widgetOfPane } from "../core/arrangement.js";
import { widgetById } from "../core/widgets.js";
import { openAddMenu, openSettingsDialog, widgetHeader } from "../ui.js";

/**
 * A pane's widget could not be found in the document. A copy does not know its own pane, so this holds for all
 * of them: every widget keeps its own header, and a pane that was found shows its title twice rather than one losing its buttons.
 */
export const DOC_UNREADABLE = "friday.doc_unreadable";

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export class PaneHead {
  init(cx) {
    this.hovered = false;
    this.widget = null;
    this.hub = null;
    cx.spawn(async (cx) => {
      const path = documentPath();
      let tries = 0;
      while (path) {
        const me = this.me();
        if (me && me.mod !== "friday") return;
        if (me) {
          if (!this.hub) {
            this.hub = new Hub([]); // settings for the state text; the widget's own copy fetches
            this.hub.start(cx);
          }
          try {
            this.widget = widgetById(widgetOfPane(await readTextFile(path), me.pane));
          } catch {
            // the next read tries again
          }
          if (this.widget) {
            if (shared(DOC_UNREADABLE)) setShared(DOC_UNREADABLE, false);
            cx.notify();
            return;
          }
          tries++;
          if (lookupGaveUp(tries) && !shared(DOC_UNREADABLE)) setShared(DOC_UNREADABLE, true);
        }
        await sleep(cx, lookupDelay(tries));
      }
    });
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, name, command, args) {
    return div().id(id).p(3).rounded(4).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${name}.svg`).size(14));
  }

  /** Split, zoom and close, while the pointer is on the header. */
  paneButtons(t, p) {
    const pane = p.pane;
    return [
      this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }),
      this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }),
      this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }),
      this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane }),
    ];
  }

  /** What both looks share: the whole header, hover, and a click that focuses the pane. */
  frame(el, t, pane) {
    return el.id(`pane-head-${pane}`).size_full().bg(t.background).text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }));
  }

  render() {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    if (this.widget) {
      return this.frame(widgetHeader(t, this.widget, this.hub, {
        refresh: (cx) => { this.hub.refresh(cx, this.widget.sources); run("friday.reload"); },
        settings: () => openSettingsDialog(null),
        add: () => openAddMenu(p.pane),
        before: this.hovered ? this.paneButtons(t, p) : [],
      }), t, p.pane);
    }
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    return this.frame(h_flex().px(10).gap(8).items_center().border_b(1).border_color(t.border), t, p.pane)
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(st === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", (el) => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", (el) => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, (el) => el.children(this.paneButtons(t, p)));
  }
}
