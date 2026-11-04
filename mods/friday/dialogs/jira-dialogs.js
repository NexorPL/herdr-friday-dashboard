// Two small Jira dialogs: log time on a favorite (R07) and add a favorite key. Inputs are made in
// init(), because InputState.new cannot run during render.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, setShared } from "herdr";
import { SETTINGS_REV } from "../hub.js";
import { saveWorklogRecord, addToFavorites } from "../store.js";
import { jiraSession } from "../jira-session.js";
import { postWorklog } from "../core/jira.js";
import { validateLogTime, submitLogTime } from "../core/worklogs.js";
import { typedKey } from "../core/favorites.js";
import { offsetNow } from "../net.js";
import { ymd } from "../core/format.js";
import { button, note } from "../ui.js";

const field = (t, state) => Input.new(state).h(32).px(10).rounded(8).border_1().border_color(t.input).bg(t.background).text_size(12.5).text_color(t.foreground);
const label = (t, text) => div().text_size(11).text_color(t.dim).child(text);

/** Enter on a favorite: duration (required), date (default today) and comment (optional). */
export class LogTimeDialog {
  init(cx) {
    const p = props() || {};
    this.key = p.key ?? "";
    this.summary = p.summary ?? "";
    this.message = null;
    this.busy = false;
    this.duration = InputState.new({ value: "", placeholder: "30m, 1h 30m" });
    this.date = InputState.new({ value: ymd(new Date()) });
    this.comment = InputState.new({ value: "", placeholder: "Optional" });
    this.duration.on("submit", (_e, cx) => this.submit(cx));
  }

  form() {
    return { duration: this.duration.value(), date: this.date.value(), comment: this.comment.value() };
  }

  say(cx, text, state) {
    this.message = { text, state };
    cx.notify();
  }

  submit(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      let done = false;
      try {
        const s = await jiraSession(cx);
        done = await submitLogTime({
          form: this.form(),
          key: this.key,
          now: Date.now(),
          offsetMin: offsetNow(),
          post: (key, body) => (s ? postWorklog(s.deps, s.cfg, key, body) : Promise.resolve({ ok: false, message: "jira: not set up" })),
          saveRecord: saveWorklogRecord,
          say: (text, state) => this.say(cx, text, state),
        });
      } finally {
        this.busy = false;
      }
      // A maybe-saved or failed write keeps the dialog open with its message; only a success closes it.
      if (done) {
        setShared(SETTINGS_REV, Date.now());
        cx.timer.after(1200, () => closeOverlay((props() || {}).overlay));
      }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const check = validateLogTime(this.form(), { key: this.key, now: Date.now(), offsetMin: offsetNow() });
    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(12.5).p(18).gap(8)
      .child(div().text_size(15).font_semibold().child(`Log time on ${this.key}`))
      .child(div().text_size(11).text_color(t.dim).truncate().child(this.summary))
      .child(label(t, "Duration (required)")).child(field(t, this.duration))
      .child(label(t, "Date (YYYY-MM-DD)")).child(field(t, this.date))
      .child(label(t, "Comment (optional)")).child(field(t, this.comment))
      .child(note(t, check.ok ? check.label : check.error, check.ok ? "ok" : "loading"))
      .when(Boolean(this.message), (el) => el.child(note(t, this.message.text, this.message.state)))
      .child(h_flex().gap(8).justify_end()
        .child(button(t, "lt-cancel", "Cancel", () => closeOverlay((props() || {}).overlay)))
        .child(button(t, "lt-log", this.busy ? "Logging…" : "Log", (_e, cx) => this.submit(cx), true)));
  }
}

/** `a` in the favorites widget: one Jira key, added to favorites.md. */
export class AddFavoriteDialog {
  init() {
    this.message = null;
    this.input = InputState.new({ value: "", placeholder: "ABC-123" });
    this.input.on("submit", (_e, cx) => this.submit(cx));
  }

  submit(cx) {
    const key = typedKey(this.input.value());
    if (!key) {
      this.message = { text: "Enter a Jira key such as ABC-123.", state: "error" };
      return cx.notify();
    }
    cx.spawn(async (cx) => {
      const r = await addToFavorites(key).catch(() => ({ ok: false, message: "could not write favorites.md" }));
      if (!r.ok) {
        this.message = { text: r.message, state: "error" };
        return cx.notify();
      }
      setShared(SETTINGS_REV, Date.now());
      closeOverlay((props() || {}).overlay);
    });
  }

  render() {
    const t = theme();
    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(12.5).p(18).gap(8)
      .child(div().text_size(15).font_semibold().child("Add a favorite"))
      .child(label(t, "Jira key"))
      .child(field(t, this.input))
      .when(Boolean(this.message), (el) => el.child(note(t, this.message.text, this.message.state)))
      .child(h_flex().gap(8).justify_end()
        .child(button(t, "af-cancel", "Cancel", () => closeOverlay((props() || {}).overlay)))
        .child(button(t, "af-add", "Add", (_e, cx) => this.submit(cx), true)));
  }
}
