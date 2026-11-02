// What Settings tells the owner right after Save: is the ledger there, and if not, which file
// with the same name sits in the usual places. Pure: `loaded` is a loadLedger result and `exists`
// is an async (path) => boolean, so tests need no disk.
import { parseLedger } from "./ledger.js";
import { expandHome } from "./settings.js";

const FOLDERS = ["", "Downloads", "Documents"];

/** The last segment of a path typed with `/` or `\`. */
export const fileName = (p) => p.split(/[\\/]/).pop();

const slash = (p) => p.replaceAll("\\", "/");

/** Existing files with the ledger's name in home, Downloads and Documents (no recursion), minus the path itself. Returned as `~/...`. */
export async function candidates(expanded, home, exists) {
  const name = fileName(expanded);
  if (!name || name === "." || name === "..") return [];
  const base = slash(home).replace(/\/$/, "");
  const typed = slash(expanded);
  const found = [];
  for (const dir of FOLDERS) {
    const rel = dir ? `${dir}/${name}` : name;
    if (`${base}/${rel}` !== typed && (await exists(`${base}/${rel}`))) found.push(`~/${rel}`);
  }
  return found;
}

/** `{ text, state, suggestions }`; suggestions are `~/` paths, only when the file is missing. */
export async function checkLedger(path, home, loaded, exists) {
  const expanded = slash(expandHome(path, home));
  if (loaded.state === "ok") {
    const n = parseLedger(loaded.text).days.length;
    return { text: `✓ found, ${n} ${n === 1 ? "day" : "days"}`, state: "ok", suggestions: [] };
  }
  if (loaded.state === "missing") {
    return { text: `✗ not found at ${expanded}`, state: "error", suggestions: await candidates(expanded, home, exists) };
  }
  return { text: loaded.error, state: "error", suggestions: [] };
}
