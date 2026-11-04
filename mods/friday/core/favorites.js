// favorites.md (D26, R10): one Jira key per line, in the owner's order. Friday only adds keys.
import { jiraKeys } from "./jira.js";
import { isJiraKey } from "./ledger.js";
import { addLine, editMd } from "./mdfile.js";

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
