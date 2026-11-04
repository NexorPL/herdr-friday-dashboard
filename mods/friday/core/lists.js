// todos.md, notes.md and priorities.md (D26, R10): the owner's plain lists. Friday reads them into
// rows, flips one todo checkbox and appends one line; nothing else in a file is ever touched.
import { jiraKeys } from "./jira.js";
import { addLine, checkboxOf, cleanLine, editMd, onlyToggled, parseMd, toggleCheckbox } from "./mdfile.js";

/**
 * The checkbox lines of todos.md in file order: { line (index), text (the raw line, which identifies
 * it when toggling), unique (no other row has the same raw line), done, body }.
 */
export function todoRows(text) {
  const rows = parseMd(text ?? "").lines.flatMap((l, line) => {
    const b = checkboxOf(l.text);
    return b ? [{ line, text: l.text, ...b }] : [];
  });
  return rows.map((r) => ({ ...r, unique: rows.filter((o) => o.text === r.text).length === 1 }));
}

/** The non-blank lines of notes.md in file order: { line, text }. */
export function noteRows(text) {
  return parseMd(text ?? "").lines.flatMap((l, line) => (l.text.trim() === "" ? [] : [{ line, text: l.text.trim() }]));
}

const MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;

/**
 * The items of priorities.md in order (headings and blank lines are skipped). An item with a Jira
 * key shows that issue's summary and status when `issues` (from friday.jira) has it; with no Jira
 * data, or an unknown key, it is the line's own text. { n, text, key, summary, status, url }.
 */
export function priorityRows(text, issues) {
  const byKey = new Map((issues ?? []).map((i) => [i.key, i]));
  return parseMd(text ?? "").lines
    .map((l) => l.text.replace(MARKER, "").trim())
    .filter((t) => t !== "" && !t.startsWith("#"))
    .map((t, i) => {
      const key = jiraKeys(t)[0] ?? null;
      const issue = key ? byKey.get(key) : null;
      return { n: i + 1, text: t, key, summary: issue ? issue.summary : t, status: issue?.status ?? "", url: issue?.url ?? null };
    });
}

/** Flips one todo (a row of todoRows); { ok, changed } or { ok: false, message }. */
export function toggleTodo(io, path, row) {
  return editMd(io, path, (text) => toggleCheckbox(text, row, row.line), onlyToggled);
}

export const ADD_ERROR = "Enter one line of text.";

/** Appends a line: a new `- [ ]` todo, a note, or a priority item. */
export async function addEntry(io, path, kind, text) {
  const clean = cleanLine(text);
  if (clean === null) return { ok: false, message: ADD_ERROR };
  const line = kind === "todos" ? `- [ ] ${clean}` : kind === "notes" ? `- ${clean}` : clean;
  return editMd(io, path, (t) => addLine(t, line));
}
