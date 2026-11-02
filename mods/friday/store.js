// Friday's data folder, `${appHome()}/data/friday/`: settings now, more files in later phases.
// The rules (version check, compare-and-swap, copying a broken file aside) are in core/datafile.js;
// this file only wires them to herdr-app's file functions.
import { appHome, home, readTextFile, writeTextFile } from "herdr";
import * as fs from "fs/promises";
import { parseJson, updateJson } from "./core/datafile.js";
import { resolveSettings, setKey, expandHome } from "./core/settings.js";

export const SETTINGS_FILE = "settings.json";

export const dataDir = () => `${appHome()}/data/friday`;
export const dataPath = (name) => `${dataDir()}/${name}`;

const io = {
  read: (path) => readTextFile(path),
  write: (path, text, expected) => writeTextFile(path, text, expected).then(() => undefined),
};

/** Makes the data folder; `data/` already exists in the app home, `friday/` may not. */
export async function ensureDataDir() {
  await fs.mkdir(dataDir(), { recursive: true });
}

/**
 * settings.json with defaults applied. `state` is "missing", "ok", "corrupt" or "newer"; a corrupt
 * or newer file leaves the defaults in memory and the file untouched. `saved` is true once
 * Settings has written the file (the setup checklist goes away then). `text` lets a caller
 * notice a change without parsing again.
 */
export async function loadSettings() {
  let text = null;
  try {
    text = await readTextFile(dataPath(SETTINGS_FILE));
  } catch {
    // an unreadable file reads as broken below
    return { ...resolveSettings({}), state: "corrupt", saved: false, text: null };
  }
  const parsed = parseJson(text);
  const resolved = resolveSettings(parsed.state === "ok" ? parsed.value : {});
  return {
    ...resolved,
    state: parsed.state,
    version: parsed.version ?? null,
    saved: parsed.state === "ok",
    text,
  };
}

/** Sets one key. Throws a SettingsError naming the key when the value is invalid. */
export async function saveSetting(key, value) {
  await ensureDataDir();
  return updateJson(io, dataPath(SETTINGS_FILE), (raw) => setKey(raw, key, value));
}

/** A path from settings with `~` expanded. */
export function resolvePath(p) {
  return expandHome(p, home());
}

export { readTextFile };
