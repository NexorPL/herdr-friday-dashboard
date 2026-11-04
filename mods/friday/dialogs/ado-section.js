// The Azure DevOps section of the Settings dialog: organization, polling interval, the secret PAT
// (masked, write-only) and the project-then-repo picker. The PAT goes to secrets.json and is never
// read back into the dialog; the section only learns from the hub's status whether Azure DevOps is
// set up. Test lists the organization's repositories (which also fills the picker) and shows OK or
// an error made of "ado" and a status, never the PAT.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { setShared } from "herdr";
import { loadSettings, saveSettings, saveSecret, readSecret } from "../store.js";
import { currentStatus, SETTINGS_REV } from "../hub.js";
import { runAdoTest } from "../net.js";
import { FETCH_TIMEOUT_MS, orgName } from "../core/ado.js";
import { testAdoSettings, savePat } from "../core/adoform.js";
import { SettingsError } from "../core/settings.js";
import { button, note } from "../ui.js";

/** Made in the dialog's init(): InputState.new cannot run during render. */
export class AdoState {
  constructor() {
    this.from = null; // the settings.json text the inputs were filled from
    this.message = null;
    this.testing = null; // the running Test, so a second click waits for it
    this.groups = null; // [{ project, repos: [{ id, name }] }] after a Test
    this.open = null; // the project whose repos the picker shows
    this.project = null; // the chosen project and repo (saved with Save)
    this.repo = null;
    this.pat = InputState.new({ value: "", placeholder: "Paste the personal access token" });
    this.pat.set_masked(true);
    this.organization = InputState.new({ value: "", placeholder: "your-org (from dev.azure.com/your-org)" });
    this.interval = InputState.new({ value: "" });
  }

  fill(settings) {
    const a = settings.values.azure_devops;
    this.organization.set_value(a.organization ?? "");
    this.interval.set_value(a.interval);
    this.project = a.project;
    this.repo = a.repo;
    this.open ??= a.project;
    this.from = settings.text;
  }
}

// `where` is the row the message shows under: "pat" (Save PAT, Test, Remove) or "options".
const say = (st, cx, text, state, where = "pat") => {
  st.message = { text, state, where };
  cx.notify();
};

function savePatSecret(st, cx, remove) {
  cx.spawn((cx) => savePat({
    typed: remove ? "" : st.pat.value().trim(),
    remove,
    saveSecret: (value) => saveSecret("ado_pat", value),
    saved: () => {
      st.pat.set_value("");
      setShared(SETTINGS_REV, Date.now());
    },
    say: (text, state) => say(st, cx, text, state),
  }));
}

function saveOptions(dialog, st, cx) {
  const typed = st.organization.value().trim();
  if (typed && !orgName(typed)) return say(st, cx, "ado: the organization is a name such as your-org", "error", "options");
  cx.spawn(async (cx) => {
    try {
      await saveSettings([
        ["azure_devops.organization", typed && orgName(typed)],
        ["azure_devops.project", st.project ?? ""],
        ["azure_devops.repo", st.repo ?? ""],
        ["azure_devops.interval", st.interval.value().trim()],
      ]);
      dialog.settings = await loadSettings();
      st.from = dialog.settings.text;
      setShared(SETTINGS_REV, Date.now());
      say(st, cx, "Saved.", "ok", "options");
    } catch (e) {
      const named = e instanceof SettingsError ? `${e.key} is invalid: use a duration such as 2m, 30s or 1h 30m` : "Could not save settings.json. Try again.";
      say(st, cx, named, "error", "options");
    }
  });
}

/** How long "Testing…" may stay. */
const TEST_GIVE_UP_MS = FETCH_TIMEOUT_MS + 5_000;

/** Test: lists the repositories with the typed organization and PAT, else the stored PAT. */
function test(st, cx) {
  if (st.testing) return;
  const run = (st.testing = {});
  say(st, cx, "Testing…", "loading");
  // herdr-app can end the job without running catch or finally: give up visibly.
  cx.timer.after(TEST_GIVE_UP_MS, (cx) => {
    if (st.testing !== run) return;
    st.testing = null;
    say(st, cx, "ado: the test did not finish", "error");
  });
  const cfg = { organization: st.organization.value().trim() };
  const typed = st.pat.value().trim();
  cx.spawn(async (cx) => {
    try {
      await testAdoSettings({
        cfg,
        typed,
        readSecret: () => readSecret("ado_pat"),
        test: (c) => runAdoTest(cx, c),
        loaded: (groups) => {
          if (st.testing !== run) return;
          st.groups = groups;
          if (!groups.some((g) => g.project === st.open)) st.open = groups[0]?.project ?? null;
        },
        say: (text, state) => st.testing === run && say(st, cx, text, state),
      });
    } finally {
      if (st.testing === run) st.testing = null;
    }
  });
}

export function adoSection(dialog, t) {
  const st = dialog.ado;
  const s = dialog.settings;
  if (s && st.from !== s.text) st.fill(s);
  const rec = currentStatus(s.values).ado;
  const stored = rec ? !rec.not_set_up : null;
  const field = (state) => Input.new(state).h(32).px(10).rounded(8).border_1().border_color(t.input).bg(t.background).text_size(12.5).text_color(t.foreground);
  const msg = (where) => (st.message?.where === where ? note(t, st.message.text, st.message.state) : div());
  const label = (text) => div().text_size(11).text_color(t.dim).child(text);
  const status = stored === null ? ["Azure DevOps: checking…", "loading"] : !stored ? ["Azure DevOps: not set up", "loading"] : rec.rejected ? ["Azure DevOps: PAT rejected", "error"] : rec.error ? [rec.error, "error"] : ["Azure DevOps: connected", "ok"];
  const chosen = st.project && st.repo ? `${st.project} / ${st.repo}` : "none yet";
  const open = st.groups?.find((g) => g.project === st.open);
  return dialog.section(t, "ado", "Azure DevOps",
    div().text_size(11).text_color(t.dim).child("A personal access token (dev.azure.com, User settings, Personal access tokens) with the Code (Read) scope only. Friday never writes to Azure DevOps. It is stored in secrets.json in the data folder."),
    note(t, status[0], status[1]),
    label("Organization"),
    field(st.organization),
    label("Refresh every"),
    field(st.interval),
    label("API token (PAT)"),
    field(st.pat),
    h_flex().gap(8).items_center()
      .child(button(t, "ado-save-pat", "Save PAT", (_e, cx) => savePatSecret(st, cx, false), true))
      .child(button(t, "ado-test", "Test", (_e, cx) => test(st, cx)))
      .child(button(t, "ado-remove", "Remove", (_e, cx) => savePatSecret(st, cx, true))),
    msg("pat"),
    label(`Repository: ${chosen}`),
    !st.groups ? note(t, "Test loads the projects and repositories to pick from.")
      : v_flex().gap(6)
        .child(h_flex().gap(6).flex_wrap().children(st.groups.map((g, i) => button(t, `ado-project-${i}`, g.project, (_e, cx) => { st.open = g.project; cx.notify(); }, g.project === st.open))))
        .child(h_flex().gap(6).flex_wrap().children((open?.repos ?? []).map((r, i) => button(t, `ado-repo-${i}`, r.name, (_e, cx) => { st.project = open.project; st.repo = r.name; cx.notify(); }, st.project === open.project && st.repo === r.name)))),
    h_flex().gap(8).items_center()
      .child(button(t, "ado-save", "Save", (_e, cx) => saveOptions(dialog, st, cx), true)),
    msg("options"));
}
