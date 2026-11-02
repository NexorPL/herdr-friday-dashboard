// The Calendar section of the Settings dialog: the secret iCal address (masked, write-only), the
// owner's e-mail, the polling interval, the alert offsets and the alert sound. The address is
// written to secrets.json and never read back into the dialog; the section only learns from the
// hub's status record whether one is stored. Test fetches the feed and shows OK or the error, which
// carries the source name and a status, never the address.
import { div } from "gpui-kit";
import { h_flex, InputState, Input } from "gpui-base";
import { setShared } from "herdr";
import { loadSettings, saveSettings, saveSecret, readSecret } from "../store.js";
import { currentStatus, SETTINGS_REV } from "../hub.js";
import { runCalendar } from "../net.js";
import { SettingsError } from "../core/settings.js";
import { button, note } from "../ui.js";

const SOUNDS = ["none", "done", "blocked"];

class CalendarState {
  constructor() {
    this.from = null; // the settings.json text the inputs were filled from
    this.message = null;
    this.sound = "done";
    this.url = InputState.new({ value: "", placeholder: "Paste the secret iCal address" });
    this.url.set_masked(true);
    this.email = InputState.new({ value: "" });
    this.interval = InputState.new({ value: "" });
    this.alerts = InputState.new({ value: "" });
  }

  fill(settings) {
    const c = settings.values.calendar;
    this.email.set_value(c.email ?? "");
    this.interval.set_value(c.interval);
    this.alerts.set_value(c.alerts.join(", "));
    this.sound = settings.values.notifications.sound;
    this.from = settings.text;
  }
}

const say = (st, cx, text, state) => {
  st.message = { text, state };
  cx.notify();
};

/** Saves the typed address (or removes it when the box is empty and `remove` is set). */
function saveUrl(st, cx, remove) {
  const value = remove ? "" : st.url.value().trim();
  if (!remove && value === "") return say(st, cx, "Paste the address first.", "error");
  cx.spawn(async (cx) => {
    try {
      await saveSecret("ical_url", value);
      st.url.set_value("");
      setShared(SETTINGS_REV, Date.now());
      say(st, cx, remove ? "Address removed." : "Address saved. Reading the calendar…", "ok");
    } catch {
      say(st, cx, "Could not save secrets.json. Try again.", "error");
    }
  });
}

function saveOptions(dialog, st, cx) {
  const alerts = st.alerts.value().split(",").map((a) => a.trim()).filter(Boolean);
  cx.spawn(async (cx) => {
    try {
      await saveSettings([
        ["calendar.email", st.email.value().trim()],
        ["calendar.interval", st.interval.value().trim()],
        ["calendar.alerts", alerts],
        ["notifications.sound", st.sound],
      ]);
      dialog.settings = await loadSettings();
      st.from = dialog.settings.text;
      setShared(SETTINGS_REV, Date.now());
      say(st, cx, "Saved.", "ok");
    } catch (e) {
      const named = e instanceof SettingsError ? `${e.key} is invalid: use a duration such as 10m, 30s or 1h 30m` : "Could not save settings.json. Try again.";
      say(st, cx, named, "error");
    }
  });
}

/** Test: fetches the feed with the typed address, else the stored one. */
function test(st, cx, email) {
  say(st, cx, "Testing…", "loading");
  cx.spawn(async (cx) => {
    const url = st.url.value().trim() || (await readSecret("ical_url"));
    if (!url) return say(st, cx, "No address yet.", "error");
    const r = await runCalendar(cx, url, email);
    if (r.ok) say(st, cx, `OK, ${r.value.meetings.length} meetings today and tomorrow.`, "ok");
    else say(st, cx, r.status === 401 || r.status === 403 ? "calendar: address rejected" : r.message, "error");
  });
}

export function calendarSection(dialog, t) {
  const st = (dialog.calendar ??= new CalendarState());
  const s = dialog.settings;
  if (s && st.from !== s.text) st.fill(s);
  const rec = currentStatus(s.values).calendar;
  const stored = rec ? !rec.not_set_up : null;
  const field = (state) => Input.new(state).h(32).px(10).rounded(8).border_1().border_color(t.input).bg(t.background).text_size(12.5).text_color(t.foreground);
  const label = (text) => div().text_size(11).text_color(t.dim).child(text);
  return dialog.section(t, "calendar", "Calendar",
    div().text_size(11).text_color(t.dim).child("The secret iCal address of your calendar (Google Calendar: Settings, Integrate calendar, Secret address in iCal format). It is stored in secrets.json in the data folder."),
    note(t, stored === null ? "Address: checking…" : stored ? "Address: saved" : "Address: not set", stored ? "ok" : "loading"),
    field(st.url),
    h_flex().gap(8).items_center()
      .child(button(t, "cal-save-url", "Save address", (_e, cx) => saveUrl(st, cx, false), true))
      .child(button(t, "cal-test", "Test", (_e, cx) => test(st, cx, st.email.value().trim() || null)))
      .child(button(t, "cal-remove", "Remove", (_e, cx) => saveUrl(st, cx, true))),
    label("Your e-mail (hides meetings you declined)"),
    field(st.email),
    label("Refresh every"),
    field(st.interval),
    label("Alert before a meeting (several allowed, e.g. 15m, 5m)"),
    field(st.alerts),
    label("Alert sound"),
    h_flex().gap(6).children(SOUNDS.map((x) => button(t, `cal-sound-${x}`, x, (_e, cx) => { st.sound = x; cx.notify(); }, st.sound === x))),
    h_flex().gap(8).items_center()
      .child(button(t, "cal-save", "Save", (_e, cx) => saveOptions(dialog, st, cx), true))
      .when(Boolean(st.message), (el) => el.child(note(t, st.message.text, st.message.state))));
}
