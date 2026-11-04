// The owner's `.md` lists (todos, notes, priorities, favorites) under R10: Friday never deletes a
// line, never rewrites a line it did not change, and keeps the file's line endings (CRLF or LF, per
// line), a BOM and a missing final newline. A file is a BOM plus lines, each with the terminator it
// had; the last line may have none. Pure: the file reads and writes are passed in as `io`.
//   io.read(path)              -> string | null  (null when the file does not exist)
//   io.write(path, text, prev) -> void, throws if the file no longer matches `prev` (null: must not exist)

const BOM = "﻿";

/** { bom, lines: [{ text, eol }] }; `eol` is "\r\n", "\n" or "" (the last line, no final newline). */
export function parseMd(text) {
  const bom = text.startsWith(BOM);
  const body = bom ? text.slice(1) : text;
  const lines = [];
  const re = /((?:[^\r\n]|\r(?!\n))*)(\r\n|\n|$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[0] === "") break; // end of text
    lines.push({ text: m[1], eol: m[2] });
    if (m[2] === "") break;
  }
  return { bom, lines };
}

export function renderMd(doc) {
  return (doc.bom ? BOM : "") + doc.lines.map((l) => l.text + l.eol).join("");
}

/** The terminator new lines get: the file's first one, else LF. */
function eolOf(doc) {
  return doc.lines.find((l) => l.eol !== "")?.eol ?? "\n";
}

/** A line is one line: no line break, not blank. Returns the trimmed text or null. */
export function cleanLine(text) {
  const t = String(text ?? "").trim();
  return t === "" || /[\r\n]/.test(t) ? null : t;
}

/**
 * `text` (null for a missing file) with `line` added at the end. Every existing line stays byte for
 * byte; if the file had no final newline the new line has none either, and the old last line gets
 * the file's terminator. Throws on a blank line or one with a line break.
 */
export function addLine(text, line) {
  const clean = cleanLine(line);
  if (clean === null) throw new Error("not a single line");
  const doc = parseMd(text ?? "");
  const eol = eolOf(doc);
  const last = doc.lines.at(-1);
  const hadFinal = !last || last.eol !== "";
  if (last && !hadFinal) last.eol = eol;
  doc.lines.push({ text: clean, eol: hadFinal ? eol : "" });
  return renderMd(doc);
}

/**
 * True when `after` keeps every line of `before` in order, byte for byte (R10: nothing is deleted or
 * rewritten): same text, same terminator, the same BOM. Only the old last line may gain a terminator,
 * because an added line goes below it.
 */
export function keepsEveryLine(before, after) {
  const x = parseMd(before ?? "");
  const y = parseMd(after ?? "");
  if (x.lines.length > 0 && x.bom !== y.bom) return false;
  let j = 0;
  for (let i = 0; i < x.lines.length; i++) {
    const line = x.lines[i];
    const lastOpen = i === x.lines.length - 1 && line.eol === "";
    while (j < y.lines.length && !(y.lines[j].text === line.text && (y.lines[j].eol === line.eol || lastOpen))) j++;
    if (j === y.lines.length) return false;
    j++;
  }
  return true;
}

/** True when a read error says the file does not exist (as opposed to locked, too large, denied). */
export function isMissingError(e) {
  return /ENOENT|no such file|cannot find the (file|path)|os error [23]\b/i.test(String(e?.message ?? e ?? ""));
}

const BOX = /^(\s*[-*+]\s+\[)([ xX])(\])(?:\s+(.*))?$/;

/** { done, body } for a Markdown checkbox line (`- [ ] text`, `- [x] text`), else null. */
export function checkboxOf(text) {
  const m = BOX.exec(text);
  return m ? { done: m[2] !== " ", body: m[4] ?? "" } : null;
}

/**
 * `text` with the checkbox line `{ body, done }` (its text and state as the owner last saw them)
 * flipped; only the one character between the brackets changes, the line keeps its terminator.
 * The line is found by content, not number, so a file edited meanwhile still works: of equal lines
 * the one nearest `hint` (its old index) wins. Null when no such line is left (R10: "file changed").
 */
export function toggleCheckbox(text, target, hint = 0) {
  const doc = parseMd(text ?? "");
  let at = -1;
  doc.lines.forEach((l, i) => {
    const b = checkboxOf(l.text);
    if (b && b.body === target.body && b.done === target.done && (at < 0 || Math.abs(i - hint) < Math.abs(at - hint))) at = i;
  });
  if (at < 0) return null;
  const t = doc.lines[at].text;
  const k = BOX.exec(t)[1].length;
  doc.lines[at].text = t.slice(0, k) + (t[k] === " " ? "x" : " ") + t.slice(k + 1);
  return renderMd(doc);
}

/** True when `after` is `before` with at most one checkbox flipped and nothing else different. */
export function onlyToggled(before, after) {
  const x = parseMd(before ?? "");
  const y = parseMd(after ?? "");
  if (x.bom !== y.bom || x.lines.length !== y.lines.length) return false;
  let flips = 0;
  for (let i = 0; i < x.lines.length; i++) {
    const a = x.lines[i];
    const b = y.lines[i];
    if (a.eol !== b.eol) return false;
    if (a.text === b.text) continue;
    const p = checkboxOf(a.text);
    const q = checkboxOf(b.text);
    if (!p || !q || p.body !== q.body || p.done === q.done) return false;
    flips++;
  }
  return flips <= 1;
}

/** A quick note: `line` appended as one line (see addLine). */
export const quickNote = addLine;

export const CHANGED = "file changed, try again";

/**
 * Reads the file, applies `change(text|null)` and writes the result with the snapshot as the
 * expected content. A rejected write is retried once from a fresh read (the change is applied again
 * to the file as it is now); `change` returns null when its target is gone, which gives CHANGED and
 * leaves the file alone. A result that fails `keeps` (default: no line deleted or rewritten) is refused. Resolves with
 * { ok: true, changed } or { ok: false, message }; the message never quotes file content.
 */
export async function editMd(io, path, change, keeps = keepsEveryLine) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let before;
    try {
      before = await io.read(path);
    } catch {
      return { ok: false, message: "could not read the file" };
    }
    const after = change(before);
    if (after === null) return { ok: false, message: CHANGED };
    if (!keeps(before, after)) return { ok: false, message: "refused: a line would be deleted" };
    if (after === before) return { ok: true, changed: false };
    try {
      await io.write(path, after, before);
      return { ok: true, changed: true };
    } catch {
      // another writer got in between: read again and re-apply the one change
    }
  }
  return { ok: false, message: CHANGED };
}
