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
 * `text` with the checkbox line `target.text` (the raw line as the owner last saw it, state
 * included) flipped; only the one character between the brackets changes, the line keeps its
 * terminator. `target` is { text, rank, count }: how many identical lines there were when the row
 * was drawn and which of them this is. A lone line is found wherever it moved; one of several only
 * at `hint` (its old index) and only if the number of copies is unchanged. Null when nothing is
 * certain (R10: "file changed, try again").
 */
export function toggleCheckbox(text, target, hint = 0) {
  const doc = parseMd(text ?? "");
  const hits = doc.lines.flatMap((l, i) => (l.text === target.text ? [i] : []));
  const count = target.count ?? 1;
  let at = -1;
  if (hits.length === count) at = count === 1 ? hits[0] : hits[target.rank ?? 0] === hint ? hint : -1;
  if (at < 0 || !checkboxOf(doc.lines[at].text)) return null;
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
    if (!p || !q || p.done === q.done) return false;
    // everything but the one character between the brackets must be identical
    const k = BOX.exec(a.text)[1].length;
    if (a.text.slice(0, k) + a.text.slice(k + 1) !== b.text.slice(0, k) + b.text.slice(k + 1)) return false;
    flips++;
  }
  return flips <= 1;
}

/**
 * A quick note (G29): `line` as one line on top of the file, right after its first heading, in the
 * file's own line ending. A heading that is the last line makes it an append (see addLine).
 */
export function quickNote(text, line) {
  const clean = cleanLine(line);
  if (clean === null) throw new Error("not a single line");
  const doc = parseMd(text ?? "");
  const h = doc.lines.findIndex((l) => l.text.trimStart().startsWith("#"));
  const at = h < 0 ? 0 : h + 1;
  if (at >= doc.lines.length) return addLine(text, clean);
  doc.lines.splice(at, 0, { text: clean, eol: eolOf(doc) });
  return renderMd(doc);
}

/** True when a read error says the file is over the 1 MiB limit of readTextFile. */
export function isTooLargeError(e) {
  return /exceeds|too large|1 MiB/i.test(String(e?.message ?? e ?? ""));
}

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
    } catch (e) {
      return { ok: false, message: isTooLargeError(e) ? "file too large" : "could not read the file" };
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
