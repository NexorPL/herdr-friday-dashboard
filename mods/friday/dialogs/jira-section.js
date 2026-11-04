// The Jira section of the Settings dialog: site, e-mail, token kind, interval, and the secret API
// token (masked, write-only). The token goes to secrets.json and is never read back into the
// dialog; the section only learns from the hub's status whether Jira is set up. Test calls
// /myself and shows OK or an error made of "jira" and a status, never the token.
import { div } from "gpui-kit";
import { h_flex, InputState, Input } from "gpui-base";
import { setShared } from "herdr";
import { loadSettings, saveSettings, saveSecret, readSecret } from "../store.js";
import { currentStatus, SETTINGS_REV } from "../hub.js";
import { runJiraTest } from "../net.js";
import { FETCH_TIMEOUT_MS, siteOrigin } from "../core/jira.js";
import { testJiraSettings, saveToken } from "../core/jiraform.js";
import { SettingsError } from "../core/settings.js";
import { button, note } from "../ui.js";

const KINDS = ["scoped", "classic"];

/** Made in the dialog's init(): InputState.new cannot run during render. */
export class JiraState {
  constructor() {
    this.from = null; // the settings.json text the inputs were filled from
    this.message = null;
    this.testing = null; // the running Test, so a second click waits for it
    this.kind = "scoped";
    this.token = InputState.new({ value: "", placeholder: "Paste the API token" });
    this.token.set_masked(true);
    this.site = InputState.new({ value: "", placeholder: "https://your-team.atlassian.net" });
    this.email = InputState.new({ value: "" });
    this.interval = InputState.new({ value: "" });
  }

  fill(settings) {
    const j = settings.values.jira;
    this.site.set_value(j.site ?? "");
    this.email.set_value(j.email ?? "");
    this.interval.set_value(j.interval);
    this.kind = j.token_kind;
    this.from = settings.text;
  }
}

// `where` is the row the message shows under: "token" (Save token, Test, Remove) or "options".
const say = (st, cx, text, state, where = "token") => {
  st.message = { text, state, where };
  cx.notify();
};

const typedCfg = (st) => ({ site: st.site.value().trim(), email: st.email.value().trim(), kind: st.kind });

function saveSecretToken(st, cx, remove) {
  cx.spawn((cx) => saveToken({
    typed: remove ? "" : st.token.value().trim(),
    remove,
    saveSecret: (value) => saveSecret("jira_token", value),
    saved: () => {
      st.token.set_value("");
      setShared(SETTINGS_REV, Date.now());
    },
    say: (text, state) => say(st, cx, text, state),
  }));
}

function saveOptions(dialog, st, cx) {
  const cfg = typedCfg(st);
  if (cfg.site && !siteOrigin(cfg.site)) return say(st, cx, "jira: the site must be an address such as https://your-team.atlassian.net", "error", "options");
  cx.spawn(async (cx) => {
    try {
      await saveSettings([
        ["jira.site", cfg.site && siteOrigin(cfg.site)],
        ["jira.email", cfg.email],
        ["jira.token_kind", cfg.kind],
        ["jira.interval", st.interval.value().trim()],
      ]);
      dialog.settings = await loadSettings();
      st.from = dialog.settings.text;
      setShared(SETTINGS_REV, Date.now());
      say(st, cx, "Saved.", "ok", "options");
    } catch (e) {
      const named = e instanceof SettingsError ? `${e.key} is invalid: use a duration such as 5m, 30s or 1h 30m` : "Could not save settings.json. Try again.";
      say(st, cx, named, "error", "options");
    }
  });
}

/** How long "Testing…" may stay: tenant_info and myself, each with a timeout. */
const TEST_GIVE_UP_MS = 2 * FETCH_TIMEOUT_MS + 5_000;

/** Test: /myself with the typed settings and token, else the stored token. */
function test(st, cx) {
  if (st.testing) return;
  const run = (st.testing = {});
  say(st, cx, "Testing…", "loading");
  // herdr-app can end the job without running catch or finally: give up visibly.
  cx.timer.after(TEST_GIVE_UP_MS, (cx) => {
    if (st.testing !== run) return;
    st.testing = null;
    say(st, cx, "jira: the test did not finish", "error");
  });
  const cfg = typedCfg(st);
  const typed = st.token.value().trim();
  cx.spawn(async (cx) => {
    try {
      await testJiraSettings({
        cfg,
        typed,
        readSecret: () => readSecret("jira_token"),
        test: (c) => runJiraTest(cx, c),
        say: (text, state) => st.testing === run && say(st, cx, text, state),
      });
    } finally {
      if (st.testing === run) st.testing = null;
    }
  });
}

export function jiraSection(dialog, t) {
  const st = dialog.jira;
  const s = dialog.settings;
  if (s && st.from !== s.text) st.fill(s);
  const rec = currentStatus(s.values).jira;
  const stored = rec ? !rec.not_set_up : null;
  const field = (state) => Input.new(state).h(32).px(10).rounded(8).border_1().border_color(t.input).bg(t.background).text_size(12.5).text_color(t.foreground);
  const msg = (where) => (st.message?.where === where ? note(t, st.message.text, st.message.state) : div());
  const label = (text) => div().text_size(11).text_color(t.dim).child(text);
  const status = stored === null ? ["Jira: checking…", "loading"] : !stored ? ["Jira: not set up", "loading"] : rec.rejected ? ["Jira: token rejected", "error"] : rec.error ? [rec.error, "error"] : ["Jira: connected", "ok"];
  return dialog.section(t, "jira", "Jira",
    div().text_size(11).text_color(t.dim).child("An Atlassian API token (id.atlassian.com, Security, API tokens) with read:jira-work and write:jira-work. It is stored in secrets.json in the data folder."),
    note(t, status[0], status[1]),
    label("Site"),
    field(st.site),
    label("Your Atlassian e-mail"),
    field(st.email),
    label("Token kind (scoped tokens work through api.atlassian.com, classic ones on the site)"),
    h_flex().gap(6).children(KINDS.map((k) => button(t, `jira-kind-${k}`, k, (_e, cx) => { st.kind = k; cx.notify(); }, st.kind === k))),
    label("Refresh every"),
    field(st.interval),
    h_flex().gap(8).items_center()
      .child(button(t, "jira-save", "Save", (_e, cx) => saveOptions(dialog, st, cx), true)),
    msg("options"),
    label("API token"),
    field(st.token),
    h_flex().gap(8).items_center()
      .child(button(t, "jira-save-token", "Save token", (_e, cx) => saveSecretToken(st, cx, false), true))
      .child(button(t, "jira-test", "Test", (_e, cx) => test(st, cx)))
      .child(button(t, "jira-remove", "Remove", (_e, cx) => saveSecretToken(st, cx, true))),
    msg("token"));
}
