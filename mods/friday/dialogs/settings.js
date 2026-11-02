// The Settings dialog: the setup checklist, the ledger path, Friday's version and data folder, and
// the command that reopens the Friday tab. Phase 2 and later add their sections here.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, setShared } from "herdr";
import { loadSettings, saveSetting, dataDir } from "../store.js";
import { currentStatus, SETTINGS_REV } from "../hub.js";
import { checklist } from "../core/setup.js";
import { SettingsError } from "../core/settings.js";
import { openPath } from "../open.js";
import { button, note, stateColor } from "../ui.js";
import { VERSION, CHECKED_AGAINST, REOPEN_COMMAND } from "../version.js";

export class SettingsDialog {
  init(cx) {
    this.settings = null;
    this.message = null;
    this.focus = (props() || {}).section ?? null;
    this.input = InputState.new({ value: "" });
    this.input.on("submit", (_e, cx) => this.save(cx));
    cx.spawn(async (cx) => {
      this.settings = await loadSettings();
      this.input.set_value(this.settings.values.ledger.path);
      cx.notify();
    });
    // The checklist follows the status records, which another pane's hub keeps writing.
    cx.timer.every(2000, (cx) => cx.notify());
  }

  save(cx) {
    const value = this.input.value().trim();
    cx.spawn(async (cx) => {
      try {
        await saveSetting("ledger.path", value);
        this.settings = await loadSettings();
        setShared(SETTINGS_REV, Date.now());
        this.message = { text: "Saved. Checking the ledger…", state: "ok" };
      } catch (e) {
        const named = e instanceof SettingsError ? `${e.key} is invalid: use a file path, for example ~/pr-reviews.md` : "Could not save settings.json. Try again.";
        this.message = { text: named, state: "error" };
      }
      cx.notify();
    });
  }

  section(t, id, title, ...children) {
    const active = this.focus === id;
    return v_flex().gap(8).p(12).rounded(8).border_1().border_color(active ? t.accent : t.border)
      .child(div().text_size(12).font_semibold().child(title))
      .children(children);
  }

  render() {
    const t = theme();
    const overlay = (props() || {}).overlay;
    const s = this.settings;
    if (!s) return v_flex().size_full().p(18).bg(t.popover).child(note(t, "Loading…"));
    const rows = checklist({ status: currentStatus(s.values), now: Date.now() });
    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(12.5)
      .child(h_flex().px(18).pt(16).pb(8).items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("Friday settings"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(18).pb(12).gap(10)
        .when(s.state === "newer", (el) => el.child(note(t, `settings.json is version ${s.version}; this Friday reads version 1. Update Friday before saving.`, "error")))
        .when(s.state === "corrupt", (el) => el.child(note(t, "settings.json is not valid. Saving copies it aside as settings.json.corrupt-<time> and starts from defaults.", "error")))
        .when(s.invalid.length > 0, (el) => el.child(note(t, `Invalid: ${s.invalid.join(", ")}. Defaults are used for these.`, "stale")))
        .child(this.section(t, "setup", "Setup",
          ...rows.map((r) => h_flex().gap(8).items_center()
            .child(div().w(8).h(8).flex_none().rounded(4).bg(stateColor(t, r.state === "todo" ? "loading" : r.state)))
            .child(div().w(110).flex_none().child(r.label))
            .child(div().flex_1().truncate().text_size(11).text_color(t.dim).child(r.detail)))))
        .child(this.section(t, "ledger", "Review ledger",
          div().text_size(11).text_color(t.dim).child("The markdown file your review hook writes. Friday only reads it."),
          Input.new(this.input).h(32).px(10).rounded(8).border_1().border_color(t.input).bg(t.background).text_size(12.5).text_color(t.foreground),
          h_flex().gap(8).items_center()
            .child(button(t, "set-save", "Save", (_e, cx) => this.save(cx), true))
            .when(Boolean(this.message), (el) => el.child(note(t, this.message.text, this.message.state)))))
        .child(this.section(t, "about", "About",
          div().text_color(t.muted).child(`Friday ${VERSION}, checked against herdr-app ${CHECKED_AGAINST}`),
          div().text_size(11).text_color(t.dim).child("Data folder"),
          h_flex().gap(8).items_center()
            .child(div().flex_1().truncate().text_size(11.5).child(dataDir()))
            .child(button(t, "set-folder", "Open folder", () => openPath(dataDir().replaceAll("\\", "/")))),
          div().text_size(11).text_color(t.dim).child("Reopen the Friday tab (after you close it)"),
          div().text_size(11).text_color(t.muted).child(REOPEN_COMMAND))))
      .child(h_flex().px(18).py(12).justify_end().border_t(1).border_color(t.border)
        .child(button(t, "set-close", "Close", () => closeOverlay(overlay))));
  }
}
