// board.md (D43, R13): a kanban board in one plain file. A column is a heading (TODO, Priority,
// In progress, Done) and a card is a line under it. Friday adds a card, moves a card's lines or
// adds a missing heading; it changes no line's text and deletes none. Pure: no `herdr` import; the
// file reads and writes are passed in as `io` (see core/mdfile.js).
import { jiraKeys } from "./jira.js";
import { MARKER, todoRows, priorityRows } from "./lists.js";
import { HEADING, checkboxOf, cleanLine, editMd, moveLines, onlyMoved, parseMd, renderMd } from "./mdfile.js";

export const COLUMNS = [
  { id: "todo", title: "TODO" },
  { id: "priority", title: "Priority" },
  { id: "progress", title: "In progress" },
  { id: "done", title: "Done" },
];

/** The line that says the lists were imported or the offer dismissed (E01-S03 writes it; it is never a card). */
export const IMPORT_MARKER = "<!-- friday: lists imported -->";

const comment = (t) => /^\s*<!--.*-->\s*$/.test(t);

/** The column a heading line names, ignoring case and level ("### in progress" is In progress), else null. */
function headingColumn(text) {
  if (!HEADING.test(text)) return null;
  const name = text.replace(/^\s*#{1,6}/, "").replace(/\s+#*\s*$/, "").trim().toLowerCase();
  return COLUMNS.find((c) => c.title.toLowerCase() === name) ?? null;
}

/** True for a line that is exactly one of the four column headings (the only heading a move may add). */
export const isColumnHeading = (text) => COLUMNS.some((c) => text === `## ${c.title}`);

/**
 * { columns: [{ id, title, heading (index or -1), cards }], outside, imported }. A card is a
 * non-blank, unindented line under a column heading that is not a heading or a lone comment, with
 * the indented lines right below it: { line (index), size (lines in the card), text (the raw first
 * line, which identifies it), block (the texts of all its lines), count (how many lines in the file
 * read exactly so), column (its column id), above (for a duplicate: the text of every line of the file
 * as drawn, of which the first `line` are the ones above it; else null), body (the first line without
 * its list marker), key (its first Jira key or null) }. `outside` counts the lines that are not drawn:
 * above the first column heading, under or as any other heading, a repeated column heading, an
 * indented line with no card above it, and code fences; not blank or comment lines.
 */
export function parseBoard(text) {
  const texts = parseMd(text ?? "").lines.map((l) => l.text); // shared by every duplicate card, so a parse stays linear
  const counts = new Map();
  for (const t of texts) counts.set(t, (counts.get(t) ?? 0) + 1);
  const columns = COLUMNS.map((c) => ({ ...c, heading: -1, cards: [] }));
  let current = null; // a column, or null above the first column heading and under other headings
  let outside = 0;
  let imported = false;
  let open = null; // inside a multi-line comment ("-->") or a code fence (its marker): such lines are never cards or headings
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (open) {
      if (open !== "-->") outside++;
      if (open === "-->" ? t.includes("-->") : t.trim().startsWith(open)) open = null;
      continue;
    }
    if (t === IMPORT_MARKER) imported = true;
    if (t.includes("<!--") && !t.includes("-->")) { open = "-->"; continue; }
    const fence = /^\s*(```|~~~)/.exec(t);
    if (fence) { open = fence[1]; outside++; continue; }
    const named = headingColumn(t);
    if (named) {
      const c = columns.find((x) => x.id === named.id);
      if (c.heading < 0) { c.heading = i; current = c; } else { current = null; outside++; } // only the first heading of a column counts
      continue;
    }
    if (HEADING.test(t)) { current = null; outside++; continue; }
    if (t.trim() === "" || comment(t)) continue;
    if (!current || /^\s/.test(t)) { // an indented line with no card above it is not drawn either
      outside++;
      continue;
    }
    let size = 1;
    while (i + size < texts.length && /^\s+\S/.test(texts[i + size]) && !HEADING.test(texts[i + size])) size++;
    const count = counts.get(t);
    current.cards.push({
      line: i, size, text: t, block: texts.slice(i, i + size), count, column: current.id,
      above: count > 1 ? texts : null, // the whole file as drawn; `locate` compares its first `line` entries
      body: t.replace(MARKER, "").trim(), key: jiraKeys(t)[0] ?? null,
    });
    i += size - 1;
  }
  return { columns, outside, imported, unclosed: open !== null };
}

/** `{ column, at: "top" }` for Done (the newest first), `{ column, at: "end" }` elsewhere: where a card lands when it changes column. */
export const defaultPlace = (column) => ({ column, at: column === "done" ? "top" : "end" });

/** The index in `lines` of `card` (a card as drawn), or -1 when it is gone or ambiguous (as toggleCheckbox decides). */
function locate(lines, card) {
  const t = lines.map((l) => l.text);
  if ((card.count ?? 1) === 1) {
    const hits = t.flatMap((x, i) => (x === card.text ? [i] : []));
    return hits.length === 1 ? hits[0] : -1;
  }
  const same = t[card.line] === card.text && Array.isArray(card.above) && card.above.length >= card.line && t.length >= card.line && t.slice(0, card.line).every((x, i) => card.above[i] === x);
  return same ? card.line : -1;
}

/** The card of `board` that `card` (as drawn) still is, with its column id, or null. */
function findCard(board, lines, card) {
  const at = locate(lines, card);
  if (at < 0) return null;
  for (const c of board.columns) {
    const hit = c.cards.find((x) => x.line === at);
    if (hit) return hit.block.length === card.block.length && hit.block.every((x, i) => x === card.block[i]) ? { ...hit, column: c.id } : null;
  }
  return null;
}

/**
 * `text` with `card` (a card as drawn) moved to `place`: { column, before: card } puts it above that
 * card, { column, at: "top" | "end" } at the top of the column or after its last card. Returns
 * { text, plan } (plan is for `onlyMoved`), or null when the card, or the card it goes before, is
 * gone or ambiguous. A column whose heading is missing gets it at the end of the file. A move that
 * changes nothing returns the same text.
 */
export function moveCard(text, card, place) {
  if (text == null) return null;
  const doc = parseMd(text);
  const board = parseBoard(text);
  const mine = findCard(board, doc.lines, card);
  const dest = board.columns.find((c) => c.id === place?.column);
  if (!mine || !dest || (card.column && mine.column !== card.column)) return null; // gone, or moved to another column by hand since it was drawn
  const n = doc.lines.length;
  const gone = (i) => (i < mine.line ? i : i - mine.size); // where a line of the file sits once the card is lifted out
  const added = dest.heading < 0 ? [`## ${dest.title}`] : [];
  let to;
  if (place.before) {
    const target = findCard(board, doc.lines, place.before);
    if (!target || target.column !== dest.id) return null;
    to = target.line === mine.line ? mine.line : gone(target.line);
  } else if (dest.heading < 0) {
    to = n - mine.size + 1; // behind the heading added at the end
  } else if (place.at === "top") {
    to = gone(dest.heading) + 1;
  } else {
    const last = dest.cards.filter((c) => c.line !== mine.line).at(-1);
    to = gone(last ? last.line + last.size - 1 : dest.heading) + 1;
  }
  return moveLines(text, { from: mine.line, count: mine.size, to, added });
}

/**
 * `text` (null for a missing file) with `- body` added after the last card of `column`. A missing
 * or empty file is created with all four headings, a missing heading is added at the end of the
 * file. Every existing line stays byte for byte. Throws on a blank line or one with a line break.
 */
export function addCard(text, column, body) {
  const clean = cleanLine(body);
  if (clean === null) throw new Error("not a single line");
  const dest = COLUMNS.find((c) => c.id === column);
  if (!dest) throw new Error("unknown column");
  const doc = parseMd(text ?? "");
  const eol = doc.lines.find((l) => l.eol !== "")?.eol ?? "\n";
  const put = (at, line) => { // the last-line rule: with no final newline the line that ends the file has none
    const last = doc.lines.at(-1);
    const atEnd = at === doc.lines.length;
    const open = atEnd && last !== undefined && last.eol === "";
    if (open) last.eol = eol;
    doc.lines.splice(at, 0, { text: line, eol: open ? "" : eol });
  };
  const columnNow = () => parseBoard(renderMd(doc)).columns.find((c) => c.id === dest.id);
  if (doc.lines.length === 0) for (const c of COLUMNS) put(doc.lines.length, `## ${c.title}`);
  let col = columnNow();
  if (col.heading < 0) {
    put(doc.lines.length, `## ${dest.title}`);
    col = columnNow();
  }
  const last = col.cards.at(-1);
  put(last ? last.line + last.size : col.heading + 1, `- ${clean}`);
  return renderMd(doc);
}

/** Adds a card to board.md; { ok, changed } or { ok: false, message } (the message never quotes the file). */
export function addToBoardFile(io, path, column, body) {
  if (cleanLine(body) === null) return Promise.resolve({ ok: false, message: "Enter one line of text." });
  return editMd(io, path, (t) => addCard(t, column, body));
}

/** Moves a card of board.md; { ok, changed } or { ok: false, message }. A result that is not exactly the move is refused. */
export function moveInBoardFile(io, path, card, place) {
  let plan = null;
  return editMd(io, path, (t) => {
    const r = moveCard(t, card, place);
    plan = r?.plan ?? null;
    return r ? r.text : null;
  }, (before, after) => plan !== null && plan.added.every(isColumnHeading) && onlyMoved(before, after, plan));
}

/**
 * The selection after an arrow key, `key` being "up", "down", "left" or "right". A selection is
 * { column (id), card (a card of the board, null on an empty column so `a` has a target) }. Up and
 * down stop at the edges; left and right go to the neighbouring column at the same position, or at
 * its last card, and stop at the first and last column. Without a usable selection it starts on the
 * first card of the first column that has one (else on the first column).
 */
export function nextSelection(board, selection, key) {
  const at = board.columns.findIndex((c) => c.id === selection?.column);
  if (at < 0) {
    const first = board.columns.find((c) => c.cards.length > 0) ?? board.columns[0];
    return { column: first.id, card: first.cards[0] ?? null };
  }
  const here = board.columns[at];
  const found = here.cards.findIndex((c) => c.line === selection.card?.line);
  const pos = found >= 0 ? found : 0;
  const pick = (col, i) => ({ column: col.id, card: col.cards[Math.min(i, col.cards.length - 1)] ?? null });
  if (key === "up") return pick(here, Math.max(0, pos - 1));
  if (key === "down") return pick(here, pos + 1);
  if (key === "left" || key === "right") return pick(board.columns[Math.min(board.columns.length - 1, Math.max(0, at + (key === "left" ? -1 : 1)))], pos);
  return pick(here, pos);
}

/** The selection on the card whose first line reads `text` (follows a card that moved), or null. */
export function selectCard(board, text) {
  for (const column of board.columns) {
    const card = column.cards.find((c) => c.text === text);
    if (card) return { column: column.id, card };
  }
  return null;
}

/** The Jira keys of the cards that take a slot in the poll, in tier order: Priority, then In progress, then TODO (Done takes none). */
export function boardKeys(board) {
  return ["priority", "progress", "todo"].flatMap((id) => board.columns.find((c) => c.id === id).cards.flatMap((c) => (c.key ? [c.key] : [])));
}

/** How many keyed cards outside Done have no issue in `issues` and are not in `missing` (keys Jira said do not exist, such as UTF-8): the "N cards without status" line. */
export function cardsWithoutStatus(board, issues, missing = []) {
  const known = new Set([...(issues ?? []).map((i) => i.key), ...missing]);
  return board.columns.filter((c) => c.id !== "done").reduce((n, c) => n + c.cards.filter((x) => x.key && !known.has(x.key)).length, 0);
}

/**
 * Where Shift+`dir` puts the selected card: up and down swap it with its neighbour in the column,
 * left and right send it to the next column with `defaultPlace`. Null at an edge or with no card.
 */
export function movePlace(board, selection, dir) {
  const at = board.columns.findIndex((c) => c.id === selection?.column);
  if (at < 0 || !selection.card) return null;
  const col = board.columns[at];
  const i = col.cards.findIndex((c) => c.line === selection.card.line);
  if (i < 0) return null;
  if (dir === "up") return i > 0 ? { column: col.id, before: col.cards[i - 1] } : null;
  if (dir === "down") {
    if (i >= col.cards.length - 1) return null;
    return i + 2 < col.cards.length ? { column: col.id, before: col.cards[i + 2] } : { column: col.id, at: "end" };
  }
  const next = board.columns[at + (dir === "left" ? -1 : 1)];
  return next ? defaultPlace(next.id) : null;
}

/**
 * The selection on the card that was just moved by `moveCard(.., card, place)`, found again in the
 * re-read `board` (same lines, in the column it went to); with identical cards it takes the one at
 * the place the card was sent to (top, end, or where the card it went before was). Null if gone.
 */
export function selectMoved(board, card, place) {
  const col = board.columns.find((c) => c.id === place?.column);
  const same = (c) => c.block.length === card.block.length && c.block.every((x, i) => x === card.block[i]);
  const hits = col ? col.cards.filter(same) : [];
  if (hits.length === 0) return selectCard(board, card.text);
  let pick = hits[0];
  if (place.before) {
    // it landed where the card it went before used to be, shifted up by the card's own lines when it came from above
    const want = place.before.line - (card.line < place.before.line ? card.size : 0);
    pick = hits.reduce((best, c) => (Math.abs(c.line - want) < Math.abs(best.line - want) ? c : best), hits[0]);
  } else if (place.at === "end") pick = hits.at(-1);
  return { column: col.id, card: pick };
}

/**
 * The lines of todos.md and priorities.md that are not on the board yet, as { column, body } in
 * file order: open todos for TODO, done todos for Done, priorities for Priority. A body already on
 * the board (a card in any column, with or without a checkbox), or already listed, is skipped, and so
 * is a line holding a comment mark, which would open a comment on the board. Its length is the N of the offer.
 */
export function importCandidates(boardText, todosText, prioritiesText) {
  const seen = new Set(parseBoard(boardText).columns.flatMap((c) => c.cards.flatMap((x) => [x.body, (checkboxOf(x.text)?.body ?? x.body).trim()])));
  const lines = [
    ...todoRows(todosText).map((r) => ({ column: r.done ? "done" : "todo", body: r.body.trim() })),
    ...priorityRows(prioritiesText, []).map((r) => ({ column: "priority", body: r.text.trim() })),
  ];
  return lines.filter(({ body }) => body !== "" && !/<!--|-->/.test(body) && !seen.has(body) && seen.add(body));
}

/**
 * `text` (null for a missing file) with the import candidates added as `- body` lines after the last
 * card of their columns, and the marker line on top. With no candidates it writes the marker alone
 * (Dismiss). With the marker already there nothing changes, so a second copy importing at the same
 * time adds nothing. One pass over the file, whatever the number of lines. A missing or empty
 * file starts with all four headings; a missing heading is added at the end of the file.
 */
export function importLists(text, todosText, prioritiesText) {
  if (parseBoard(text).imported) return text;
  const adds = importCandidates(text, todosText, prioritiesText);
  const empty = parseMd(text ?? "").lines.length === 0; // missing, empty, or only a BOM
  const start = empty ? `${COLUMNS.map((c) => `## ${c.title}`).join("\n")}\n` : text;
  const doc = parseMd(start);
  if (empty) doc.bom = parseMd(text ?? "").bom;
  const eol = doc.lines.find((l) => l.eol !== "")?.eol ?? "\n";
  const insert = (at, texts) => { // the last-line rule: with no final newline the line that ends the file has none
    const last = doc.lines.at(-1);
    const open = at === doc.lines.length && last?.eol === "";
    if (open) last.eol = eol;
    doc.lines.splice(at, 0, ...texts.map((t, i) => ({ text: t, eol: open && i === texts.length - 1 ? "" : eol })));
  };
  const columns = parseBoard(start).columns;
  const lines = (id) => adds.filter((a) => a.column === id).map((a) => `- ${a.body}`);
  // bottom columns first, so the indexes of the ones above stay valid
  for (const c of columns.filter((x) => x.heading >= 0).sort((a, b) => b.heading - a.heading)) {
    const last = c.cards.at(-1);
    if (lines(c.id).length > 0) insert(last ? last.line + last.size : c.heading + 1, lines(c.id));
  }
  for (const c of columns.filter((x) => x.heading < 0 && lines(x.id).length > 0)) insert(doc.lines.length, [`## ${c.title}`, ...lines(c.id)]);
  insert(0, [IMPORT_MARKER]);
  return renderMd(doc);
}

/**
 * Imports the lists onto board.md, or only writes the marker (Dismiss) when they are null. A file
 * that ends inside a comment or a code fence is left alone: cards added there would not show.
 * { ok, changed } or { ok: false, message }.
 */
export async function importInBoardFile(io, path, todosText, prioritiesText) {
  let blocked = false;
  const r = await editMd(io, path, (t) => {
    blocked = parseBoard(t).unclosed;
    return blocked ? t : importLists(t, todosText, prioritiesText);
  });
  return blocked ? { ok: false, message: "the file ends inside a comment or a code block" } : r;
}
