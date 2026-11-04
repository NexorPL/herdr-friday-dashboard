// settings.json: the keys, defaults and validation. Keys and meanings are the first version's
// config.toml, in JSON (BACKWARD_COMPATIBILITY.md). An invalid value falls back to its default and
// Settings names the key; a missing required key disables only the widgets that need it.
import { parseInterval, parseDurations } from "./durations.js";

export const SETTINGS_VERSION = 1;

const path = (key, dflt) => ({ key, kind: "path", default: dflt });

/**
 * In the order Settings shows them. A `text` key with a null default is required by its widgets.
 * Each phase adds its own keys here (Phase 3: calendar.* and notifications.sound; Phase 2: jira.*; Phase 4: azure_devops.*).
 */
export const SCHEMA = [
  path("ledger.path", "~/pr-reviews.md"),
  { key: "calendar.email", kind: "text", default: null },
  { key: "calendar.interval", kind: "interval", default: "10m" },
  { key: "calendar.alerts", kind: "durations", default: ["5m"] },
  { key: "jira.site", kind: "text", default: null },
  { key: "jira.email", kind: "text", default: null },
  { key: "jira.token_kind", kind: "choice", options: ["scoped", "classic"], default: "scoped" },
  { key: "jira.interval", kind: "interval", default: "5m" },
  { key: "azure_devops.organization", kind: "text", default: null },
  { key: "azure_devops.project", kind: "text", default: null },
  { key: "azure_devops.repo", kind: "text", default: null },
  { key: "azure_devops.interval", kind: "interval", default: "2m" },
  { key: "notifications.sound", kind: "choice", options: ["none", "done", "blocked"], default: "done" },
];

const byKey = (schema) => new Map(schema.map((s) => [s.key, s]));

/** The value if it is valid for the entry, else `undefined`. */
function check(entry, value) {
  switch (entry.kind) {
    case "text":
      return typeof value === "string" && value.trim() !== "" ? value : undefined;
    case "path":
      return typeof value === "string" && value !== "" ? value : undefined;
    case "choice":
      return entry.options.includes(value) ? value : undefined;
    case "interval":
      return parseInterval(value) !== null ? value : undefined;
    case "durations":
      return parseDurations(value) !== null ? value : undefined;
    case "days":
      return Number.isInteger(value) && value > 0 ? value : undefined;
    default:
      return undefined;
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Applies a parsed settings.json over the defaults. Returns the resolved nested values, the
 * dotted keys whose value was invalid (and fell back), and the keys Friday does not know.
 * `null` for a required text key means "not set". `schema` is for tests; it defaults to SCHEMA.
 */
export function resolveSettings(raw, schema = SCHEMA) {
  const source = isObject(raw) ? raw : {};
  const values = {};
  const invalid = [];
  for (const entry of schema) {
    const [section, name] = entry.key.split(".");
    const given = isObject(source[section]) ? source[section][name] : undefined;
    let value = entry.default;
    if (given !== undefined && !(given === null && entry.kind === "text")) {
      const ok = check(entry, given);
      if (ok === undefined) invalid.push(entry.key);
      else value = ok;
    }
    (values[section] ??= {})[name] = Array.isArray(value) ? [...value] : value;
  }
  const known = byKey(schema);
  const unknown = [];
  for (const [section, body] of Object.entries(source)) {
    if (section === "version") continue;
    if (!isObject(body)) unknown.push(section);
    else for (const name of Object.keys(body)) if (!known.has(`${section}.${name}`)) unknown.push(`${section}.${name}`);
  }
  return { values, invalid, unknown };
}

/** The line Settings shows when values fell back, or null. */
export function settingsStatus(invalid) {
  return invalid.length ? `settings.json: invalid ${invalid.join(", ")}, defaults used` : null;
}

export class SettingsError extends Error {
  constructor(key, message) {
    super(`${key}: ${message}`);
    this.key = key;
  }
}

/**
 * Returns a copy of the parsed settings.json with one key set, keeping every key Friday does not
 * know. Throws a SettingsError naming the key when the value is invalid. An empty string for a
 * text key removes it.
 */
export function setKey(raw, key, value, schema = SCHEMA) {
  const entry = byKey(schema).get(key);
  if (!entry) throw new SettingsError(key, "unknown key");
  const [section, name] = key.split(".");
  const next = isObject(raw) ? JSON.parse(JSON.stringify(raw)) : {};
  if (!isObject(next[section])) next[section] = {};
  if (entry.kind === "text" && (value === "" || value === null)) {
    delete next[section][name];
  } else {
    if (check(entry, value) === undefined) throw new SettingsError(key, "invalid value");
    next[section][name] = value;
  }
  next.version = SETTINGS_VERSION;
  return next;
}

/** `~`, `~/x` and `~\x` against the home folder; any other path is returned as given. */
export function expandHome(p, home) {
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return `${home.replace(/[\\/]$/, "")}/${p.slice(2)}`;
  return p;
}
