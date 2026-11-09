// todos.md, notes.md and priorities.md (D26, R10): the owner's plain lists. Friday reads them into
// rows, flips one todo checkbox and adds one line; nothing else in a file is ever touched.
import { jiraKeys } from "./jira.js";
import { ymd, hhmm } from "./format.js";
import { HEADING, addLine, checkboxOf, cleanLine, editMd, moveLines, onlyMoved, onlyRemoved, onlyToggled, parseMd, quickNote, renderMd, toggleCheckbox } from "./mdfile.js";

/**
 * The checkbox lines of todos.md in file order: { line (index), text (the raw line, which identifies
 * it when toggling), count (how many lines in the file read exactly so), above (for a duplicate:
 * the text of every line above it, else null), done, body }.
 */
export function todoRows(text) {
  const lines = parseMd(text ?? "").lines;
  return lines.flatMap((l, line) => {
    const b = checkboxOf(l.text);
    if (!b) return [];
    const count = lines.filter((o) => o.text === l.text).length;
    // a duplicate remembers the lines above it: it is only toggled while they are unchanged
    return [{ line, text: l.text, count, above: count > 1 ? lines.slice(0, line).map((o) => o.text) : null, ...b }];
  });
}

/** The non-blank, non-heading lines of notes.md, newest first as the file has them: { line, text }. */
export function noteRows(text) {
  return parseMd(text ?? "").lines.flatMap((l, line) => (l.text.trim() === "" || HEADING.test(l.text) ? [] : [{ line, text: l.text.trim() }]));
}

export const MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;

/**
 * The items of priorities.md in order (headings and blank lines are skipped). { n, text (the line
 * without its list marker), key (first Jira key or null), note (the text without the key), summary
 * and status (Jira's, or empty when friday.jira has no such issue), url, label (what to show beside
 * the key: Jira's summary plus the line's own annotation, or just the line's text) }.
 */
export function priorityRows(text, issues) {
  const byKey = new Map((issues ?? []).map((i) => [i.key, i]));
  return parseMd(text ?? "").lines
    .filter((l) => !HEADING.test(l.text)) // judged on the raw line: "3. # Ship it" and "- #1 thing" are items
    .map((l) => l.text.replace(MARKER, "").trim())
    .filter((t) => t !== "")
    .map((t, i) => {
      const key = jiraKeys(t)[0] ?? null;
      const issue = key ? byKey.get(key) : null;
      const note = key ? t.replace(key, "").replace(/^[\s\-–—:,.]+|[\s\-–—:]+$/g, "") : t;
      const label = issue ? [issue.summary, note].filter(Boolean).join(" — ") : key ? note : t;
      return { n: i + 1, text: t, key, note, summary: issue?.summary ?? "", status: issue?.status ?? "", url: issue?.url ?? null, label };
    });
}

// The lines that are rows of each list, as todoRows, noteRows and priorityRows judge them, and what a row
// shows of its line (to check that the line under the cursor is still the one that was drawn).
const ROW_LINE = {
  todos: { is: (t) => checkboxOf(t) !== null, shows: (t) => t },
  notes: { is: (t) => t.trim() !== "" && !HEADING.test(t), shows: (t) => t.trim() },
  priorities: { is: (t) => !HEADING.test(t) && t.replace(MARKER, "").trim() !== "", shows: (t) => t.replace(MARKER, "").trim() },
};

/** The rows of the list `kind` as { line, size } (size counts the indented lines right under it), and `mine`, row `index` if its line still shows `shown`. */
function rowAt(text, kind, index, shown) {
  const spec = ROW_LINE[kind];
  const lines = parseMd(text ?? "").lines;
  const rows = [];
  lines.forEach((l, line) => { if (spec.is(l.text)) rows.push({ line }); });
  for (const r of rows) {
    let size = 1;
    while (lines[r.line + size] && /^s+S/.test(lines[r.line + size].text) && !spec.is(lines[r.line + size].text)) size++;
    r.size = size;
  }
  const mine = rows[index];
  return { lines, rows, mine: mine && spec.shows(lines[mine.line].text) === shown ? mine : null };
}

/**
 * `text` with row `index` of the list `kind` ("todos", "notes" or "priorities") one place up or down:
 * it swaps with the neighbouring row, and indented lines right under a row (that are not rows) travel
 * with it. `shown` is the row's text as drawn (its `text`); null when the line there is not that
 * any more or the index is not a row. At the first or last row nothing moves (the same text).
 * { text, plan } for `onlyMoved`. Numbers a numbered priority line carries are not renumbered.
 */
export function moveRow(text, kind, index, shown, dir) {
  const spec = ROW_LINE[kind];
  const lines = parseMd(text ?? "").lines;
  const rows = [];
  lines.forEach((l, line) => { if (spec.is(l.text)) rows.push({ line }); });
  for (const r of rows) {
    let size = 1;
    while (lines[r.line + size] && /^\s+\S/.test(lines[r.line + size].text) && !spec.is(lines[r.line + size].text)) size++;
    r.size = size;
  }
  const mine = rows[index];
  if (!mine || spec.shows(lines[mine.line].text) !== shown) return null;
  const [upper, lower] = dir === "up" ? [rows[index - 1], mine] : [mine, rows[index + 1]];
  if (!upper || !lower) return moveLines(text, { from: mine.line, count: mine.size, to: mine.line });
  return moveLines(text, { from: lower.line, count: lower.size, to: upper.line });
}

/** Moves a row of todos.md, notes.md or priorities.md one place; { ok, changed } or { ok: false, message }. */
export function moveListRow(io, path, kind, index, shown, dir) {
  let plan = null;
  return editMd(io, path, (text) => {
    const r = moveRow(text, kind, index, shown, dir);
    plan = r?.plan ?? null;
    return r ? r.text : null;
  }, (before, after) => plan !== null && onlyMoved(before, after, plan));
}

/** Deletes a row of priorities.md (the owner confirmed first), the way moveRow finds it; { ok, changed } or { ok: false, message }. Only that row's lines may go. */
export function deleteListRow(io, path, kind, index, shown) {
  let plan = null;
  return editMd(io, path, (text) => {
    const { lines, mine } = rowAt(text, kind, index, shown);
    if (!mine) return null;
    lines.splice(mine.line, mine.size);
    plan = { at: mine.line, count: mine.size };
    return renderMd({ ...parseMd(text), lines });
  }, (before, after) => plan !== null && onlyRemoved(before, after, plan.at, plan.count));
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

/**
 * Enter in an input: passes its text to `add`, which returns { ok, message }, and clears the input
 * once the line is written. A failed write keeps the text, and so does anything typed meanwhile.
 */
export async function submitLine(input, add) {
  const text = input.value();
  const r = await add(text).catch(() => ({ ok: false, message: "could not write the file" }));
  if (r.ok && input.value() === text) input.set_value("");
  return r;
}
