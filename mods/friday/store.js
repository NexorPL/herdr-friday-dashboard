// Friday's data folder, `${appHome()}/data/friday/`: settings now, more files in later phases.
// The rules (version check, compare-and-swap, copying a broken file aside) are in core/datafile.js;
// this file only wires them to herdr-app's file functions.
import { appHome, home, readTextFile, writeTextFile } from "herdr";
import * as fs from "fs/promises";
import { parseJson, updateJson } from "./core/datafile.js";
import { claimAlerts as claimInto } from "./core/alerts.js";
import { secretFrom, withSecret } from "./core/secrets.js";
import { addRecord, recordsOf } from "./core/worklogs.js";
import { addFavorite, deleteFavorite, moveFavorite } from "./core/favorites.js";
import { deleteListRow, moveListRow } from "./core/lists.js";
import { applyFetch, markSeen, rowsFor } from "./core/prs.js";
import { isMissingError, isTooLargeError } from "./core/mdfile.js";
import { toggleTodo, addEntry } from "./core/lists.js";
import { addToBoardFile, moveInBoardFile, importInBoardFile, flagInBoardFile, editInBoardFile, deleteInBoardFile } from "./core/board.js";
import { resolveSettings, setKey, expandHome } from "./core/settings.js";

export const SETTINGS_FILE = "settings.json";
export const SECRETS_FILE = "secrets.json";
export const ALERTS_FILE = "alerts.json";
export const WORKLOGS_FILE = "worklogs.json";
export const FAVORITES_FILE = "favorites.md";
export const PRS_FILE = "prs.json";
export const ARRANGEMENT_FILE = "arrangement.json";
/** The owner's lists by widget id (D26, D40). */
export const LIST_FILES = { todos: "todos.md", notes: "notes.md", priorities: "priorities.md", board: "board.md" };

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

/** Sets several keys in one write, so a refused value leaves the file as it was. */
export async function saveSettings(pairs) {
  await ensureDataDir();
  return updateJson(io, dataPath(SETTINGS_FILE), (raw) => pairs.reduce((r, [key, value]) => setKey(r, key, value), raw));
}

/**
 * One secret from secrets.json, or null. Only the code that fetches calls this; the value stays in
 * that call's memory and is never put in shared(), localStorage, a log, an error or a toast.
 */
export async function readSecret(name) {
  try {
    return secretFrom(parseJson(await readTextFile(dataPath(SECRETS_FILE))), name);
  } catch {
    return null;
  }
}

/** Stores (or, for an empty value, removes) one secret. Resolves with nothing; throws without the value. */
export async function saveSecret(name, value) {
  await ensureDataDir();
  await updateJson(io, dataPath(SECRETS_FILE), (raw) => withSecret(raw, name, value));
}

/** A text file of the data folder (favorites.md, priorities.md), or null when it does not exist. */
export async function readDataText(name) {
  try {
    return await readTextFile(dataPath(name));
  } catch {
    return null;
  }
}

/** The records in worklogs.json (what Friday wrote to Jira); none when the file is missing or unreadable. */
export async function readWorklogRecords() {
  try {
    return recordsOf(parseJson(await readTextFile(dataPath(WORKLOGS_FILE))));
  } catch {
    return [];
  }
}

/** Appends one record to worklogs.json (compare-and-swap, once per Jira id). Throws if it cannot. */
export async function saveWorklogRecord(record) {
  await ensureDataDir();
  await updateJson(io, dataPath(WORKLOGS_FILE), (raw) => addRecord(raw, record));
}

/** favorites.md as a file of the R10 writer: a missing file reads as null and is created by the first add. */
const mdIo = {
  // null (a missing file) lets the first add create it; any other error is a failed read, never an empty file.
  read: (path) => readTextFile(path).catch((e) => (isMissingError(e) ? null : Promise.reject(e))),
  write: (path, text, expected) => writeTextFile(path, text, expected).then(() => undefined),
};

/** Adds a key to favorites.md. { ok, changed } or { ok: false, message }. */
export async function addToFavorites(key) {
  await ensureDataDir();
  return addFavorite(mdIo, dataPath(FAVORITES_FILE), key);
}

/** Moves a favorite up or down in favorites.md. { ok, changed } or { ok: false, message }. */
export async function moveInFavorites(key, dir) {
  await ensureDataDir();
  return moveFavorite(mdIo, dataPath(FAVORITES_FILE), key, dir);
}

/** One list file: { ok: true, text } (text is null when the file does not exist) or { ok: false, error } for a real read error ("file too large" or "could not read the file"). */
export async function readList(kind) {
  try {
    return { ok: true, text: await mdIo.read(dataPath(LIST_FILES[kind])) };
  } catch (e) {
    return { ok: false, error: isTooLargeError(e) ? "file too large" : "could not read the file" };
  }
}

/** Flips one todo of todos.md. { ok, changed } or { ok: false, message }. */
export async function toggleInTodos(row) {
  await ensureDataDir();
  return toggleTodo(mdIo, dataPath(LIST_FILES.todos), row);
}

/** Appends a line to todos.md, notes.md or priorities.md. { ok, changed } or { ok: false, message }. */
export async function addToList(kind, text) {
  await ensureDataDir();
  return addEntry(mdIo, dataPath(LIST_FILES[kind]), kind, text);
}

/** Moves a row of todos.md, notes.md or priorities.md (`row` as drawn, at `index`) up or down. { ok, changed } or { ok: false, message }. */
export async function moveInList(kind, index, row, dir) {
  await ensureDataDir();
  return moveListRow(mdIo, dataPath(LIST_FILES[kind]), kind, index, row.text, dir);
}

/** Deletes a row of priorities.md (`row` as drawn, at `index`). { ok, changed } or { ok: false, message }. */
export async function deleteInList(kind, index, row) {
  await ensureDataDir();
  return deleteListRow(mdIo, dataPath(LIST_FILES[kind]), kind, index, row.text);
}

/** Deletes a favorite from favorites.md. { ok, changed } or { ok: false, message }. */
export async function deleteInFavorites(key) {
  await ensureDataDir();
  return deleteFavorite(mdIo, dataPath(FAVORITES_FILE), key);
}

/** Adds a card at the end of a column of board.md (the file is created on the first add). { ok, changed } or { ok: false, message }. */
export async function addToBoard(column, text, once = false) {
  await ensureDataDir();
  return addToBoardFile(mdIo, dataPath(LIST_FILES.board), column, text, once);
}

/** Sets or clears the priority flag of a card of board.md (a card as drawn). { ok, changed } or { ok: false, message }. */
export async function flagOnBoard(card, flag) {
  await ensureDataDir();
  return flagInBoardFile(mdIo, dataPath(LIST_FILES.board), card, flag);
}

/** Rewrites the text of a card of board.md (a card as drawn); its list marker and flag stay. { ok, changed } or { ok: false, message }. */
export async function editOnBoard(card, text) {
  await ensureDataDir();
  return editInBoardFile(mdIo, dataPath(LIST_FILES.board), card, text);
}

/** Deletes a card of board.md (a card as drawn) with its indented lines. { ok, changed } or { ok: false, message }. */
export async function deleteOnBoard(card) {
  await ensureDataDir();
  return deleteInBoardFile(mdIo, dataPath(LIST_FILES.board), card);
}

/** Moves a card of board.md (a card as drawn) to `place`. { ok, changed } or { ok: false, message }. */
export async function moveOnBoard(card, place) {
  await ensureDataDir();
  return moveInBoardFile(mdIo, dataPath(LIST_FILES.board), card, place);
}

/** Imports todos.md and priorities.md onto board.md, with the marker line. They are only read. { ok, changed } or { ok: false, message }. */
export async function importToBoard() {
  await ensureDataDir();
  const [todos, priorities] = [await readList("todos"), await readList("priorities")];
  const bad = [todos, priorities].find((r) => !r.ok); // a locked or too large source must not be imported as empty, with the marker
  if (bad) return { ok: false, message: bad.error };
  return importInBoardFile(mdIo, dataPath(LIST_FILES.board), todos.text, priorities.text);
}

/** Dismisses the import offer: only the marker line is written. { ok, changed } or { ok: false, message }. */
export async function dismissImport() {
  await ensureDataDir();
  return importInBoardFile(mdIo, dataPath(LIST_FILES.board), null, null);
}

/** The `sent` map of alerts.json (empty when the file is missing or unreadable). */
export async function readAlertsSent() {
  try {
    const p = parseJson(await readTextFile(dataPath(ALERTS_FILE)));
    return p.state === "ok" && p.value.sent && typeof p.value.sent === "object" ? p.value.sent : {};
  } catch {
    return {};
  }
}

/**
 * Records alerts as sent with a compare-and-swap write and returns the ones this call won (R11):
 * a copy that lost a race finds the key already there and gets none. Throws if the file cannot
 * be written, or is a newer version, and then nothing is sent.
 */
export async function claimAlerts(due, now) {
  await ensureDataDir();
  let claimed = [];
  await updateJson(io, dataPath(ALERTS_FILE), (raw) => {
    const r = claimInto(raw, due, now);
    claimed = r.claimed;
    return r.next;
  }, Date.now(), false);
  return claimed;
}

/**
 * Records a successful PR fetch in prs.json (compare-and-swap) and returns { owed, rows }: the new
 * PRs that need a toast, already marked notified in the file (R11), and the repo's active rows.
 * Throws if the file cannot be written or is a newer version, and then nothing is shown.
 */
export async function recordPrs(key, fetched, now) {
  await ensureDataDir();
  let result = { owed: [], rows: [] };
  await updateJson(io, dataPath(PRS_FILE), (raw) => {
    const r = applyFetch(raw, key, fetched, now);
    result = { owed: r.owed, rows: rowsFor(r.next, key) };
    return r.next;
  }, now, false);
  return result;
}

/** Clears the "new" mark of one PR (`id`) or of every PR of the repo (null); returns the repo's rows. */
export async function markPrsSeen(key, id) {
  await ensureDataDir();
  let rows = [];
  await updateJson(io, dataPath(PRS_FILE), (raw) => {
    const next = markSeen(raw, key, id);
    rows = rowsFor(next, key);
    return next;
  }, Date.now(), false);
  return rows;
}

/** Saves the arrangement, only when it changed (compare-and-swap). A newer file is left alone; a rejected write waits for the next check. */
export async function writeArrangement(text) {
  const path = dataPath(ARRANGEMENT_FILE);
  const current = await readTextFile(path);
  if (current === text || parseJson(current).state === "newer") return;
  await ensureDataDir();
  await writeTextFile(path, text, current);
}

/** A path from settings with `~` expanded. */
export function resolvePath(p) {
  return expandHome(p, home());
}

export { readTextFile };
