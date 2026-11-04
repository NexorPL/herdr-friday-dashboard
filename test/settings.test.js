import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSettings, settingsStatus, setKey, SettingsError, expandHome, SCHEMA } from "../mods/friday/core/settings.js";

// Phase 1 has only ledger.path; these entries stand in for the kinds later phases add.
const TEST = [
  { key: "ledger.path", kind: "path", default: "~/pr-reviews.md" },
  { key: "x.site", kind: "text", default: null },
  { key: "x.email", kind: "text", default: null },
  { key: "x.mode", kind: "choice", options: ["scoped", "classic"], default: "scoped" },
  { key: "x.interval", kind: "interval", default: "5m" },
  { key: "x.alerts", kind: "durations", default: ["5m"] },
  { key: "x.days", kind: "days", default: 30 },
];
const resolve = (raw) => resolveSettings(raw, TEST);

test("the schema holds the ledger path, the calendar keys, the Jira keys and the Azure DevOps keys", () => {
  assert.deepEqual(SCHEMA.map((s) => s.key), ["ledger.path", "calendar.email", "calendar.interval", "calendar.alerts", "jira.site", "jira.email", "jira.token_kind", "jira.interval", "azure_devops.organization", "azure_devops.project", "azure_devops.repo", "azure_devops.interval", "notifications.sound"]);
  const { values } = resolveSettings({});
  assert.deepEqual(values.calendar, { email: null, interval: "10m", alerts: ["5m"] });
  assert.equal(values.notifications.sound, "done");
  assert.deepEqual(resolveSettings({ calendar: { interval: "0s", alerts: ["soon"] }, notifications: { sound: "loud" } }).invalid, ["calendar.interval", "calendar.alerts", "notifications.sound"]);
});

test("an empty file gives the defaults", () => {
  const { values, invalid, unknown } = resolveSettings({});
  assert.equal(values.ledger.path, "~/pr-reviews.md");
  assert.deepEqual([invalid, unknown], [[], []]);
  assert.equal(settingsStatus(invalid), null);
  const t = resolve({}).values;
  assert.equal(t.x.interval, "5m");
  assert.deepEqual(t.x.alerts, ["5m"]);
  assert.equal(t.x.days, 30);
  assert.equal(t.x.mode, "scoped");
  assert.equal(t.x.site, null, "required keys are unset");
});

test("every schema key resolves to its default and is known", () => {
  const { values } = resolveSettings({});
  for (const { key, default: dflt } of SCHEMA) {
    const [section, name] = key.split(".");
    assert.deepEqual(values[section][name], dflt, key);
  }
});

test("values are read", () => {
  const { values, invalid } = resolve({
    version: 1,
    ledger: { path: "D:/work/pr-reviews.md" },
    x: { site: "https://example.atlassian.net", email: "me@example.test", mode: "classic", interval: "1h 30m", alerts: ["15m", "5m"], days: 7 },
  });
  assert.equal(values.ledger.path, "D:/work/pr-reviews.md");
  assert.equal(values.x.mode, "classic");
  assert.equal(values.x.interval, "1h 30m");
  assert.deepEqual(values.x.alerts, ["15m", "5m"]);
  assert.equal(values.x.days, 7);
  assert.deepEqual(invalid, []);
});

test("an invalid value falls back and names its key", () => {
  const { values, invalid } = resolve({ x: { interval: "five", days: -1, mode: "loud" } });
  assert.equal(values.x.interval, "5m");
  assert.equal(values.x.days, 30);
  assert.equal(values.x.mode, "scoped");
  assert.deepEqual(invalid, ["x.mode", "x.interval", "x.days"]);
  const status = settingsStatus(invalid);
  assert.match(status, /x\.interval/);
  assert.match(status, /x\.days/);
});

test("intervals are above zero and at most a day; alerts are at most a day", () => {
  for (const bad of ["0s", "25h", "999999999h"]) {
    const { values, invalid } = resolve({ x: { interval: bad } });
    assert.equal(values.x.interval, "5m", bad);
    assert.deepEqual(invalid, ["x.interval"], bad);
  }
  assert.equal(resolve({ x: { interval: "24h" } }).values.x.interval, "24h");
  const alerts = resolve({ x: { alerts: ["25h"] } });
  assert.deepEqual(alerts.values.x.alerts, ["5m"]);
  assert.deepEqual(alerts.invalid, ["x.alerts"]);
});

test("wrong types are invalid, a blank required text counts as unset", () => {
  const r = resolve({ ledger: { path: 5 }, x: { site: "   ", email: 3, days: 1.5 } });
  assert.deepEqual(r.invalid, ["ledger.path", "x.site", "x.email", "x.days"]);
  assert.equal(r.values.x.site, null);
  assert.equal(resolve({ x: { site: null } }).invalid.length, 0);
});

test("unknown keys are reported, files.dir included", () => {
  const { unknown } = resolveSettings({ version: 1, files: { dir: "~/friday" }, ledger: { nope: 1 }, extra: 5 });
  assert.deepEqual(unknown, ["files.dir", "ledger.nope", "extra"]);
  assert.deepEqual(resolveSettings({ tokens: { interval: "1m" } }).unknown, ["tokens.interval"], "later phases' keys are kept, not known yet");
});

test("a settings value that is not an object gives the defaults", () => {
  for (const raw of [null, [], "x", 5]) assert.deepEqual(resolveSettings(raw).invalid, []);
});

test("setKey sets one key, keeps the unknown ones, and does not touch its input", () => {
  const raw = { version: 1, jira: { site: "https://example.atlassian.net" }, mine: { note: true } };
  const next = setKey(raw, "ledger.path", "D:/x.md");
  assert.deepEqual(next, { version: 1, jira: { site: "https://example.atlassian.net" }, mine: { note: true }, ledger: { path: "D:/x.md" } });
  assert.equal(raw.ledger, undefined);
  assert.deepEqual(setKey({}, "x.alerts", ["10m"], TEST).x.alerts, ["10m"]);
});

test("setKey names the key it refuses", () => {
  assert.throws(() => setKey({}, "x.interval", "0s", TEST), (e) => e instanceof SettingsError && e.key === "x.interval");
  assert.throws(() => setKey({}, "ledger.path", ""), (e) => e.key === "ledger.path");
  assert.throws(() => setKey({}, "nope.key", 1), (e) => e.key === "nope.key");
  assert.throws(() => setKey({}, "tokens.interval", "1m"), (e) => e.key === "tokens.interval", "a later phase's key is unknown now");
});

test("an empty text value removes a required key", () => {
  const next = setKey({ version: 1, x: { site: "https://a.test" } }, "x.site", "", TEST);
  assert.deepEqual(next.x, {});
});

test("expandHome handles ~, ~/x and Windows separators", () => {
  assert.equal(expandHome("~", "C:/Users/me"), "C:/Users/me");
  assert.equal(expandHome("~/pr-reviews.md", "C:/Users/me"), "C:/Users/me/pr-reviews.md");
  assert.equal(expandHome("~\\pr-reviews.md", "C:/Users/me/"), "C:/Users/me/pr-reviews.md");
  assert.equal(expandHome("D:/x.md", "C:/Users/me"), "D:/x.md");
  assert.equal(expandHome("~other/x", "C:/Users/me"), "~other/x");
});
