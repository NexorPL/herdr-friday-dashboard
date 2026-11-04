// todos.md, notes.md and priorities.md (D26, R10): the owner's plain lists. Friday reads them into
// rows, flips one todo checkbox and adds one line; nothing else in a file is ever touched.
import { jiraKeys } from "./jira.js";
import { ymd, hhmm } from "./format.js";
import { addLine, checkboxOf, cleanLine, editMd, onlyToggled, parseMd, quickNote, toggleCheckbox } from "./mdfile.js";

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

/** The non-blank, non-heading lines of notes.md, newest first as the file has them: { line, text }. */
export function noteRows(text) {
  return parseMd(text ?? "").lines.flatMap((l, line) => (l.text.trim() === "" || l.text.trimStart().startsWith("#") ? [] : [{ line, text: l.text.trim() }]));
}

const MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;

/**
 * The items of priorities.md in order (headings and blank lines are skipped). { n, text (the line
 * without its list marker), key (first Jira key or null), note (the text without the key), summary
 * and status (Jira's, or empty when friday.jira has no such issue), url, label (what to show beside
 * the key: Jira's summary plus the line's own annotation, or just the line's text) }.
 */
export function priorityRows(text, issues) {
  const byKey = new Map((issues ?? []).map((i) => [i.key, i]));
  return parseMd(text ?? "").lines
    .map((l) => l.text.replace(MARKER, "").trim())
    .filter((t) => t !== "" && !t.startsWith("#"))
    .map((t, i) => {
      const key = jiraKeys(t)[0] ?? null;
      const issue = key ? byKey.get(key) : null;
      const note = key ? t.replace(key, "").replace(/^[\s\-–—:,.]+|[\s\-–—:]+$/g, "") : t;
      const label = issue ? [issue.summary, note].filter(Boolean).join(" — ") : key ? note : t;
      return { n: i + 1, text: t, key, note, summary: issue?.summary ?? "", status: issue?.status ?? "", url: issue?.url ?? null, label };
    });
}

/** Flips one todo (a row of todoRows); { ok, changed } or { ok: false, message }. */
export function toggleTodo(io, path, row) {
  return editMd(io, path, (text) => toggleCheckbox(text, row, row.line), onlyToggled);
}

/**
 * The new priorities.md line for `text` in the file's own list style (G29, as in the first
 * version): after a numbered item the next number with the same separator, after a bullet the same
 * bullet; with no list yet a "- " bullet. Only unindented lines count, so a line that continues the
 * last item (or a sub-item) does not break the numbering. It never adds bare text, so text that
 * starts with # stays a list item and cannot become a heading.
 */
export function priorityLine(fileText, text) {
  const top = parseMd(fileText ?? "").lines.filter((l) => !/^\s/.test(l.text)).reverse();
  for (const { text: t } of top) {
    const num = /^(\d+)([.)]) /.exec(t);
    if (num) return `${Number(num[1]) + 1}${num[2]} ${text}`;
    const bullet = /^([-*+]) /.exec(t);
    if (bullet) return `${bullet[1]} ${text}`;
  }
  return `- ${text}`;
}

/** The `- YYYY-MM-DD HH:MM text` line of a quick note (G29), local time. */
export const noteLine = (text, now) => `- ${ymd(now)} ${hhmm(now.getTime())} ${text}`;

export const ADD_ERROR = "Enter one line of text.";

/**
 * Adds a line: a `- [ ]` todo at the end, a timestamped note on top after the first heading
 * (newest first), a priority at the end in the file's list style.
 */
export async function addEntry(io, path, kind, text, now = new Date()) {
  const clean = cleanLine(text);
  if (clean === null) return { ok: false, message: ADD_ERROR };
  const change = kind === "todos" ? (t) => addLine(t, `- [ ] ${clean}`)
    : kind === "notes" ? (t) => quickNote(t, noteLine(clean, now))
      : (t) => addLine(t, priorityLine(t, clean));
  return editMd(io, path, change);
}
