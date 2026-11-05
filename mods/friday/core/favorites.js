// favorites.md (D26, R10): one Jira key per line, in the owner's order. Friday adds a key at the end
// and moves a key's line up or down (D45); it deletes and rewrites nothing.
import { jiraKeys } from "./jira.js";
import { isJiraKey } from "./ledger.js";
import { addLine, editMd, moveLines, onlyMoved, parseMd } from "./mdfile.js";

/** The keys of favorites.md in file order, each once; text that has no key is ignored. */
export function favoriteKeys(text) {
  return [...new Set((text ?? "").split(/\r\n|\n/).flatMap((line) => jiraKeys(line).slice(0, 1)))];
}

/** The key typed in the add form (any case), or null. */
export function typedKey(text) {
  const k = String(text ?? "").trim().toUpperCase();
  return isJiraKey(k) ? k : null;
}

/**
 * The rows of the widget: one per favorite key, from the issues of friday.jira. `loaded` is false
 * until a poll has fetched the key; `missing` marks a key Jira did not find or the owner cannot see,
 * and time logging is off for it.
 */
export function favoriteRows(keys, issues, missing) {
  const byKey = new Map((issues ?? []).map((i) => [i.key, i]));
  const gone = new Set(missing ?? []);
  return keys.map((key) => {
    const i = byKey.get(key);
    return { key, summary: i?.summary ?? "", status: i?.status ?? "", priority: i?.priority ?? "", url: i?.url ?? null, missing: gone.has(key), loaded: Boolean(i) || gone.has(key) };
  });
}

/** Adds a key to favorites.md unless it is already there; creates the file on the first add. */
export function addFavorite(io, path, key) {
  return editMd(io, path, (text) => (favoriteKeys(text).includes(key) ? text : addLine(text, key)));
}

/**
 * `text` with the favorite `key` one place up or down among the rows (the order of favoriteKeys:
 * each key at its first line). Up moves its line above the previous key's line; down moves the next
 * key's line above this one, so the rows always swap exactly, even when a key is repeated on a later
 * line. Text on other lines stays where it is. { text, plan } for `onlyMoved`; at the first or last
 * key nothing moves (the same text); null when the key is gone.
 */
export function moveKey(text, key, dir) {
  const seen = new Set();
  const rows = []; // { key, line }: the first line of each key
  parseMd(text ?? "").lines.forEach((l, line) => {
    const k = jiraKeys(l.text)[0];
    if (k && !seen.has(k)) { seen.add(k); rows.push({ key: k, line }); }
  });
  const i = rows.findIndex((r) => r.key === key);
  if (i < 0) return null;
  const [upper, lower] = dir === "up" ? [rows[i - 1], rows[i]] : [rows[i], rows[i + 1]];
  if (!upper || !lower) return moveLines(text, { from: rows[i].line, count: 1, to: rows[i].line }); // the edge: nothing moves
  return moveLines(text, { from: lower.line, count: 1, to: upper.line });
}

/** Moves a favorite up or down in favorites.md. { ok, changed } or { ok: false, message }. */
export function moveFavorite(io, path, key, dir) {
  let plan = null;
  return editMd(io, path, (text) => {
    const r = moveKey(text, key, dir);
    plan = r?.plan ?? null;
    return r ? r.text : null;
  }, (before, after) => plan !== null && onlyMoved(before, after, plan));
}
