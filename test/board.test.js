import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, IMPORT_MARKER, parseBoard, defaultPlace, moveCard, addCard, addToBoardFile, moveInBoardFile, isColumnHeading, nextSelection, selectCard, cardsWithoutStatus, movePlace, selectMoved, boardKeys, importCandidates, importLists, importInBoardFile, cardFace } from "../mods/friday/core/board.js";
import { onlyMoved, keepsEveryLine, CHANGED } from "../mods/friday/core/mdfile.js";

const BOM = "﻿";
const FILE = [
  "intro line", "## todo", "- Call the bank", "- Write docs", "  indented detail", "### PRIORITY", "- DEMO-12 ship the import",
  "## In progress", "- Prepare the demo", "## Done", "- Book the train", "",
].join("\n");

const cardOf = (text, body) => parseBoard(text).columns.flatMap((c) => c.cards).find((c) => c.body === body);
const move = (text, body, place) => moveCard(text, cardOf(text, body), place);

test("a board file reads as four columns of cards", () => {
  const b = parseBoard(FILE);
  assert.deepEqual(b.columns.map((c) => [c.id, c.cards.length]), [["todo", 2], ["priority", 1], ["progress", 1], ["done", 1]]);
  assert.equal(b.outside, 1);
  assert.equal(b.imported, false);
  const docs = cardOf(FILE, "Write docs");
  assert.equal(docs.size, 2, "an indented line belongs to the card above it");
  assert.deepEqual(docs.block, ["- Write docs", "  indented detail"]);
  assert.equal(cardOf(FILE, "DEMO-12 ship the import").key, "DEMO-12");
  assert.equal(cardOf(FILE, "Call the bank").key, null);
  assert.deepEqual(COLUMNS.map((c) => c.title), ["TODO", "Priority", "In progress", "Done"]);
});

test("headings count in any case and level, the first one wins, other headings hide their lines", () => {
  const b = parseBoard("#### done\n- a\n# DONE\n- b\n## Notes\n- c\n## Todo\n- d\n");
  assert.deepEqual(b.columns.map((c) => c.cards.map((x) => x.body)), [["d"], [], [], ["a"]]);
  assert.equal(b.outside, 4, "the second Done heading and b under it, the Notes heading and c under it");
  assert.equal(parseBoard("").columns.every((c) => c.heading < 0 && c.cards.length === 0), true);
});

test("lines above the first heading are outside; blank lines, comments and the marker are not counted or cards", () => {
  const b = parseBoard(`${IMPORT_MARKER}\n\n<!-- a note -->\ntext above\n## TODO\n<!-- inside -->\n- a\n  \n- b\n`);
  assert.equal(b.outside, 1);
  assert.equal(b.imported, true);
  assert.deepEqual(b.columns[0].cards.map((c) => c.body), ["a", "b"]);
  assert.equal(parseBoard(`${BOM}## TODO\r\n- a\r\n`).columns[0].cards[0].body, "a");
});

test("a card's list marker is hidden, its key is the first one", () => {
  const b = parseBoard("## TODO\n- DEMO-3 and DEMO-4 plan\n1. numbered\n* star\nplain\n");
  assert.deepEqual(b.columns[0].cards.map((c) => c.body), ["DEMO-3 and DEMO-4 plan", "numbered", "star", "plain"]);
  assert.equal(b.columns[0].cards[0].key, "DEMO-3");
});

test("a card moves to another column: the end, or the top of Done", () => {
  const todo = move(FILE, "Call the bank", { column: "progress", at: "end" });
  assert.equal(todo.text, FILE.replace("- Call the bank\n", "").replace("- Prepare the demo\n", "- Prepare the demo\n- Call the bank\n"));
  assert.ok(onlyMoved(FILE, todo.text, todo.plan));
  const done = move(FILE, "Write docs", defaultPlace("done"));
  assert.equal(done.text, FILE.replace("- Write docs\n  indented detail\n", "").replace("## Done\n", "## Done\n- Write docs\n  indented detail\n"), "the indented line moves with its card, to the top of Done");
  assert.ok(onlyMoved(FILE, done.text, done.plan));
  assert.deepEqual(defaultPlace("todo"), { column: "todo", at: "end" });
  assert.deepEqual(defaultPlace("done"), { column: "done", at: "top" });
});

test("a card moves inside its column: above a card, to the top, to the end", () => {
  const before = move(FILE, "Write docs", { column: "todo", before: cardOf(FILE, "Call the bank") });
  assert.equal(before.text.split("\n").slice(1, 6).join("|"), "## todo|- Write docs|  indented detail|- Call the bank|### PRIORITY");
  const top = move(FILE, "Write docs", { column: "todo", at: "top" });
  assert.equal(top.text, before.text);
  const end = move(FILE, "Call the bank", { column: "todo", at: "end" });
  assert.equal(end.text.split("\n").slice(1, 6).join("|"), "## todo|- Write docs|  indented detail|- Call the bank|### PRIORITY");
  for (const r of [before, top, end]) assert.ok(onlyMoved(FILE, r.text, r.plan));
  // a move that changes nothing
  assert.equal(move(FILE, "Write docs", { column: "todo", at: "end" }).text, FILE);
  assert.equal(move(FILE, "Call the bank", { column: "todo", at: "top" }).text, FILE);
  assert.equal(move(FILE, "Call the bank", { column: "todo", before: cardOf(FILE, "Call the bank") }).text, FILE);
});

test("a move to an empty column lands under its heading, and a missing heading is added at the end", () => {
  const empty = "## TODO\n- a\n## Priority\n## Done\n";
  assert.equal(move(empty, "a", { column: "priority", at: "end" }).text, "## TODO\n## Priority\n- a\n## Done\n");
  const r = move("## TODO\n- a\n- b\n", "a", { column: "done", at: "top" });
  assert.equal(r.text, "## TODO\n- b\n## Done\n- a\n");
  assert.deepEqual(r.plan.added, ["## Done"]);
  assert.ok(onlyMoved("## TODO\n- a\n- b\n", r.text, r.plan));
  // no final newline: the card ends the file and has none
  const open = move("## TODO\n- a", "a", { column: "done", at: "top" });
  assert.equal(open.text, "## TODO\n## Done\n- a");
  assert.equal(isColumnHeading("## Done") && isColumnHeading("## In progress") && !isColumnHeading("## Other") && !isColumnHeading("## undefined"), true);
});

test("moves keep CRLF, LF and the BOM, and the last-line rule", () => {
  const crlf = `${BOM}## TODO\r\n- a\r\n- b\n## Done\r\n- c`;
  const r = move(crlf, "c", { column: "todo", at: "top" });
  assert.equal(r.text, `${BOM}## TODO\r\n- c\r\n- a\r\n- b\n## Done\r\n`.slice(0, -2));
  assert.ok(onlyMoved(crlf, r.text, r.plan));
  const down = move(crlf, "a", { column: "done", at: "end" });
  assert.equal(down.text, `${BOM}## TODO\r\n- b\n## Done\r\n- c\r\n- a`);
  assert.ok(onlyMoved(crlf, down.text, down.plan));
});

test("a card that changed or became ambiguous is not moved", () => {
  const card = cardOf(FILE, "Call the bank");
  const changed = FILE.replace("- Call the bank", "- Call the other bank");
  assert.equal(moveCard(changed, card, { column: "done", at: "top" }), null, "its line changed");
  assert.equal(moveCard(`${FILE}- Call the bank\n`, card, { column: "done", at: "top" }), null, "it now exists twice");
  assert.equal(moveCard(FILE.replace("  indented detail\n", ""), cardOf(FILE, "Write docs"), { column: "done", at: "top" }), null, "its body changed");
  assert.equal(moveCard(null, card, { column: "done", at: "top" }), null, "no file");
  assert.equal(moveCard(FILE, card, { column: "nowhere", at: "top" }), null);
  assert.equal(move(FILE, "Call the bank", { column: "todo", before: { ...cardOf(FILE, "Prepare the demo") } }), null, "the card it goes before is in another column");
  const gone = FILE.replace("- Prepare the demo\n", "");
  assert.equal(moveCard(gone, card, { column: "progress", before: cardOf(FILE, "Prepare the demo") }), null);
});

test("duplicate cards: one of several moves only at its old place, with the lines above unchanged", () => {
  const dup = "## TODO\n- x\n- y\n- x\n## Done\n";
  const second = parseBoard(dup).columns[0].cards[2];
  assert.equal(second.count, 2);
  const r = moveCard(dup, second, { column: "done", at: "top" });
  assert.equal(r.text, "## TODO\n- x\n- y\n## Done\n- x\n");
  assert.equal(moveCard(`- new\n${dup}`, second, { column: "done", at: "top" }), null, "a line was added above");
  assert.equal(moveCard(dup.replace("- y", "- z"), second, { column: "done", at: "top" }), null, "a line above changed");
  assert.ok(moveCard(`${dup}- tail\n`, second, { column: "done", at: "top" }), "an edit below does not matter");
});

test("adding a card goes after the column's last card and creates what is missing", () => {
  assert.equal(addCard(null, "todo", "first"), "## TODO\n- first\n## Priority\n## In progress\n## Done\n");
  assert.equal(addCard("", "done", "x"), "## TODO\n## Priority\n## In progress\n## Done\n- x\n");
  assert.equal(addCard(FILE, "todo", "new").split("\n").slice(1, 7).join("|"), "## todo|- Call the bank|- Write docs|  indented detail|- new|### PRIORITY", "after the last card and its body");
  assert.equal(addCard("## TODO\n- a\n", "progress", "b"), "## TODO\n- a\n## In progress\n- b\n", "a missing heading is added at the end");
  assert.equal(addCard("## TODO\n## Done\n", "todo", "a"), "## TODO\n- a\n## Done\n");
  assert.equal(addCard("notes only\n", "done", "a"), "notes only\n## Done\n- a\n");
  // line endings, BOM, no final newline
  assert.equal(addCard(`${BOM}## TODO\r\n- a`, "todo", "b"), `${BOM}## TODO\r\n- a\r\n- b`);
  assert.equal(addCard("## TODO\r\n- a\r\n", "done", "b"), "## TODO\r\n- a\r\n## Done\r\n- b\r\n");
  assert.equal(addCard("## TODO\n- a\n## Done", "todo", "b"), "## TODO\n- a\n- b\n## Done");
  assert.throws(() => addCard(FILE, "todo", "  "), /single line/);
  assert.throws(() => addCard(FILE, "todo", "a\nb"), /single line/);
  assert.throws(() => addCard(FILE, "nowhere", "a"), /column/);
});

/** A one-file fake of herdr-app's file functions. */
function fakeIo(initial, hooks = {}) {
  const f = { text: initial, writes: [] };
  f.io = {
    read: async () => { hooks.beforeRead?.(f); return f.text; },
    write: async (_p, text, prev) => {
      if (prev !== f.text) throw new Error("changed");
      f.writes.push(text);
      f.text = text;
    },
  };
  return f;
}

test("addToBoardFile and moveInBoardFile write through the R10 guards", async () => {
  const f = fakeIo(null);
  assert.deepEqual(await addToBoardFile(f.io, "board.md", "todo", "first"), { ok: true, changed: true });
  assert.equal(f.text, "## TODO\n- first\n## Priority\n## In progress\n## Done\n");
  assert.deepEqual(await addToBoardFile(f.io, "board.md", "todo", "  "), { ok: false, message: "Enter one line of text." });
  const card = cardOf(f.text, "first");
  assert.deepEqual(await moveInBoardFile(f.io, "board.md", card, defaultPlace("done")), { ok: true, changed: true });
  assert.equal(f.text, "## TODO\n## Priority\n## In progress\n## Done\n- first\n");
  assert.deepEqual(await moveInBoardFile(f.io, "board.md", card, defaultPlace("done")), { ok: false, message: CHANGED }, "the card is no longer in the column it was drawn in");
  f.text = f.text.replace("- first", "- second");
  assert.deepEqual(await moveInBoardFile(f.io, "board.md", card, defaultPlace("todo")), { ok: false, message: CHANGED });
  assert.equal(f.writes.length, 2);
});

test("a write that loses a race is planned again from the new file, once", async () => {
  const start = "## TODO\n- a\n- b\n## Done\n";
  let edited = false;
  const f = fakeIo(start, {
    beforeRead: (file) => { if (!edited) { edited = true; file.text = "## TODO\n- a\n- b\n- c\n## Done\n"; } },
  });
  // the first read sees the edited file, so the plan is made from it: no stale write happens
  assert.deepEqual(await moveInBoardFile(f.io, "board.md", cardOf(start, "a"), { column: "done", at: "top" }), { ok: true, changed: true });
  assert.equal(f.text, "## TODO\n- b\n- c\n## Done\n- a\n");
  // another writer in between the read and the write: the second attempt re-plans
  const g = fakeIo(start);
  const write = g.io.write;
  let raced = false;
  g.io.write = async (p, text, prev) => {
    if (!raced) { raced = true; g.text = "## TODO\n- a\n- b\n- d\n## Done\n"; }
    return write(p, text, prev);
  };
  assert.deepEqual(await moveInBoardFile(g.io, "board.md", cardOf(start, "b"), { column: "done", at: "end" }), { ok: true, changed: true });
  assert.equal(g.text, "## TODO\n- a\n- d\n## Done\n- b\n");
});

test("the guard refuses a result that is not exactly the move", () => {
  const start = "## TODO\n- a\n- b\n## Done\n";
  const moved = moveCard(start, cardOf(start, "a"), { column: "done", at: "top" });
  assert.equal(onlyMoved(start, moved.text, moved.plan), true);
  assert.equal(onlyMoved(start, moved.text.replace("- b", "- B"), moved.plan), false);
  assert.equal(isColumnHeading("## Other"), false, "moveInBoardFile refuses a plan that adds any other heading");
});

test("arrows move the selection and stop at the edges", () => {
  const b = parseBoard(FILE);
  const col = (id) => b.columns.find((c) => c.id === id);
  const at = (column, body) => ({ column, card: cardOf(FILE, body) ?? null });
  const sel = (s, ...keys) => keys.reduce((x, k) => nextSelection(b, x, k), s);
  const name = (s) => `${s.column}:${s.card?.body ?? "-"}`;
  assert.equal(name(sel(at("todo", "Call the bank"), "down")), "todo:Write docs");
  assert.equal(name(sel(at("todo", "Call the bank"), "down", "down", "down")), "todo:Write docs", "stops at the last card");
  assert.equal(name(sel(at("todo", "Call the bank"), "up")), "todo:Call the bank", "stops at the first card");
  // right keeps the position, or goes to the last card of a shorter column
  assert.equal(name(sel(at("todo", "Write docs"), "right")), "priority:DEMO-12 ship the import");
  assert.equal(name(sel(at("todo", "Call the bank"), "right", "right", "right")), "done:Book the train");
  assert.equal(name(sel(at("done", "Book the train"), "right")), "done:Book the train", "stops at the last column");
  assert.equal(name(sel(at("todo", "Call the bank"), "left")), "todo:Call the bank", "stops at the first column");
  // an empty column keeps the selection on the column, with no card
  const e = parseBoard("## TODO\n- a\n## Priority\n## Done\n- b\n");
  assert.deepEqual(nextSelection(e, { column: "todo", card: e.columns[0].cards[0] }, "right"), { column: "priority", card: null });
  assert.deepEqual(nextSelection(e, { column: "priority", card: null }, "down"), { column: "priority", card: null });
  assert.deepEqual(nextSelection(e, { column: "priority", card: null }, "right"), { column: "progress", card: null });
  assert.equal(nextSelection(e, { column: "progress", card: null }, "right").card.body, "b");
  assert.equal(col("done").cards.length, 1);
});

test("with no usable selection the first card of the first column with cards is selected", () => {
  const e = parseBoard("## TODO\n## Priority\n- p\n");
  assert.deepEqual(nextSelection(e, null, "down").column, "priority");
  assert.equal(nextSelection(e, null, "down").card.body, "p");
  assert.deepEqual(nextSelection(e, { column: "gone", card: null }, "up"), nextSelection(e, null, "up"));
  const none = parseBoard("");
  assert.deepEqual(nextSelection(none, null, "down"), { column: "todo", card: null });
  // a selection whose card moved (a stale line) falls back to the column's first card
  assert.equal(nextSelection(e, { column: "priority", card: { line: 99 } }, "down").card.body, "p");
});

test("selectCard follows a card that moved; cardsWithoutStatus counts keyed cards Jira did not return", () => {
  const moved = move(FILE, "Call the bank", defaultPlace("done")).text;
  const s = selectCard(parseBoard(moved), "- Call the bank");
  assert.equal(s.column, "done");
  assert.equal(s.card.body, "Call the bank");
  assert.equal(selectCard(parseBoard(moved), "- gone"), null);
  const b = parseBoard("## TODO\n- DEMO-1 a\n- no key\n## Priority\n- DEMO-2 b\n- DEMO-3 c\n## Done\n- DEMO-4 d\n");
  assert.equal(cardsWithoutStatus(b, [{ key: "DEMO-2" }]), 2, "DEMO-1 and DEMO-3; Done takes no status");
  assert.equal(cardsWithoutStatus(b, undefined), 3);
  assert.equal(cardsWithoutStatus(b, [{ key: "DEMO-2" }], ["DEMO-1"]), 1, "a key Jira says does not exist is not waiting for a status");
  assert.equal(cardsWithoutStatus(parseBoard(""), []), 0);
});

test("Shift+arrows swap a card with its neighbour or send it to the next column", () => {
  const text = "## TODO\n- a\n- b\n- c\n## Priority\n## In progress\n## Done\n- d\n";
  const b = parseBoard(text);
  const at = (body) => ({ column: b.columns.find((c) => c.cards.some((x) => x.body === body)).id, card: cardOf(text, body) });
  const run = (body, dir) => { const p = movePlace(b, at(body), dir); return p && moveCard(text, cardOf(text, body), p).text.split("\n").filter((l) => l.startsWith("- ")).join(""); };
  assert.equal(run("b", "up"), "- b- a- c- d");
  assert.equal(run("a", "down"), "- b- a- c- d");
  assert.equal(run("b", "down"), "- a- c- b- d", "down to the end of the column");
  assert.equal(movePlace(b, at("a"), "up"), null);
  assert.equal(movePlace(b, at("c"), "down"), null);
  assert.deepEqual(movePlace(b, at("a"), "right"), { column: "priority", at: "end" });
  assert.deepEqual(movePlace(b, at("d"), "left"), { column: "progress", at: "end" });
  assert.equal(movePlace(b, at("a"), "left"), null, "no column before TODO");
  assert.equal(movePlace(b, at("d"), "right"), null, "no column after Done");
  assert.equal(movePlace(b, { column: "priority", card: null }, "up"), null);
  // into Done: to the top
  assert.deepEqual(movePlace(parseBoard("## TODO\n## Priority\n## In progress\n- x\n## Done\n"), { column: "progress", card: parseBoard("## TODO\n## Priority\n## In progress\n- x\n## Done\n").columns[2].cards[0] }, "right"), { column: "done", at: "top" });
});

test("a parse stays linear with many duplicate cards", () => {
  const text = `## Done\n${"- Standup\n".repeat(20000)}`;
  const t0 = Date.now();
  const b = parseBoard(text);
  assert.equal(b.columns[3].cards.length, 20000);
  assert.ok(Date.now() - t0 < 1000, "20000 duplicates parse in well under a second");
  assert.equal(b.columns[3].cards[1].above, b.columns[3].cards[2].above, "duplicates share one array of line texts");
});

test("indented headings, orphan lines, multi-line comments and code fences are never cards", () => {
  // an indented heading is a heading: it ends the card above it
  const h = parseBoard("## TODO\n- a\n ## Done\n- b\n");
  assert.equal(h.columns[0].cards[0].size, 1);
  assert.deepEqual(h.columns[3].cards.map((c) => c.body), ["b"]);
  // hidden lines are counted: other headings, a repeated column heading, an orphan indented line
  assert.equal(parseBoard("# My board\n## TODO\n- a\n").outside, 1);
  assert.equal(parseBoard("## TODO\n  orphan\n- a\n").outside, 1);
  assert.equal(parseBoard("## TODO\n- a\n## TODO\n- b\n").outside, 2);
  // a multi-line comment hides its lines without counting them; a fence hides and counts
  const c = parseBoard("## TODO\n<!--\nhidden\n-->\n- a\n");
  assert.deepEqual(c.columns[0].cards.map((x) => x.body), ["a"]);
  assert.equal(c.outside, 0);
  const fence = parseBoard("## TODO\n- a\n```\n# x\n- not a card\n```\n- b\n");
  assert.deepEqual(fence.columns[0].cards.map((x) => x.body), ["a", "b"]);
  assert.equal(fence.outside, 4);
});

test("a card is not moved after it left the column it was drawn in", () => {
  const text = "## TODO\n- X\n## Priority\n## Done\n";
  const card = cardOf(text, "X");
  assert.equal(card.column, "todo");
  const byHand = "## TODO\n## Priority\n## Done\n- X\n";
  assert.equal(moveCard(byHand, card, { column: "priority", at: "end" }), null);
});

test("selectMoved picks the moved copy among identical cards", () => {
  const text = "## TODO\n- a\n- a\n- a\n## Done\n";
  const cards = parseBoard(text).columns[0].cards;
  // the first copy goes one place down: the board reads "a a a" again, and the selection is the second
  const down = moveCard(text, cards[0], { column: "todo", before: cards[2] });
  assert.equal(down.text, text, "identical lines: nothing visible changes");
  const after = parseBoard(down.text);
  assert.equal(selectMoved(after, cards[0], { column: "todo", before: cards[2] }).card.line, 2, "where the card it went before was");
  assert.equal(selectMoved(after, cards[0], { column: "todo", at: "end" }).card.line, 3);
  assert.equal(selectMoved(after, cards[0], { column: "todo", at: "top" }).card.line, 1);
  assert.equal(selectMoved(after, cards[0], { column: "done", at: "top" }).column, "todo", "not in that column: falls back to the text");
});

test("boardKeys lists the first key of each card by tier and skips Done", () => {
  const b = parseBoard("## TODO\n- TD-3 c TD-9\n## Priority\n- PR-2\n- no key\n## In progress\n- IN-1\n## Done\n- DN-1\n");
  assert.deepEqual(boardKeys(b), ["PR-2", "IN-1", "TD-3"]);
  assert.deepEqual(boardKeys(parseBoard("")), []);
});

test("importCandidates lists todos and priorities that are not on the board yet", () => {
  const todos = "# Todos\n- [ ] Call the bank\n- [x] Book the train\n- [ ] Call the bank\nnot a todo\n";
  const pri = "1. DEMO-12\n2. Prepare the demo\n";
  assert.deepEqual(importCandidates(null, todos, pri), [
    { column: "todo", body: "Call the bank" },
    { column: "done", body: "Book the train" },
    { column: "priority", body: "DEMO-12" },
    { column: "priority", body: "Prepare the demo" },
  ]);
  // a body already on the board, in any column, is not offered again
  assert.deepEqual(importCandidates("## Done\n- Call the bank\n## TODO\n- DEMO-12\n", todos, pri).map((c) => c.body), ["Book the train", "Prepare the demo"]);
  assert.deepEqual(importCandidates(null, null, null), []);
  assert.deepEqual(importCandidates(null, "", "# only a heading\n"), []);
});

test("importLists adds the candidates in their columns and the marker on top", () => {
  const todos = "- [ ] a\n- [x] b\n";
  const pri = "1. p\n2. q\n";
  assert.equal(importLists(null, todos, pri), `${IMPORT_MARKER}\n## TODO\n- a\n## Priority\n- p\n- q\n## In progress\n## Done\n- b\n`);
  // cards go after the last card of their column; a heading that is missing comes at the end
  assert.equal(importLists("## TODO\n- x\n  note\n## Done\n- y\n", todos, ""), `${IMPORT_MARKER}\n## TODO\n- x\n  note\n- a\n## Done\n- y\n- b\n`);
  assert.equal(importLists("## TODO\n- x\n", todos, pri), `${IMPORT_MARKER}\n## TODO\n- x\n- a\n## Priority\n- p\n- q\n## Done\n- b\n`);
  // Dismiss: the marker alone (a new file also gets its four headings)
  assert.equal(importLists("## TODO\n- x\n", null, null), `${IMPORT_MARKER}\n## TODO\n- x\n`);
  assert.equal(importLists(null, null, null), `${IMPORT_MARKER}\n## TODO\n## Priority\n## In progress\n## Done\n`);
  // with the marker there, nothing changes: a second import adds nothing
  const once = importLists("## TODO\n", todos, pri);
  assert.equal(importLists(once, todos, pri), once);
  assert.equal(importLists(once, null, null), once);
});

test("importLists keeps every line, CRLF, the BOM and a missing final newline", () => {
  for (const before of ["## TODO\r\n- x\r\n## Done", `${BOM}## TODO\n- x\n## Done\n- y`, "intro\r\n## Priority\r\n- z"]) {
    const after = importLists(before, "- [ ] a\n- [x] b\n", "1. p\n");
    assert.ok(keepsEveryLine(before, after), JSON.stringify(after));
    assert.equal(after.endsWith("\n"), before.endsWith("\n"));
    assert.equal(after.startsWith(BOM), before.startsWith(BOM));
    assert.deepEqual(importCandidates(after, "- [ ] a\n- [x] b\n", "1. p\n"), [], "everything is on the board");
  }
});

test("importLists on a big file is one pass", () => {
  const todos = Array.from({ length: 3000 }, (_, i) => `- [ ] todo ${i}`).join("\n");
  const t0 = Date.now();
  const out = importLists(null, todos, "");
  assert.equal(parseBoard(out).columns[0].cards.length, 3000);
  assert.ok(Date.now() - t0 < 1500);
});

test("importInBoardFile: two copies importing at once do not double a card", async () => {
  const f = fakeIo("## TODO\n- x\n");
  const todos = "- [ ] a\n";
  const [r1, r2] = await Promise.all([importInBoardFile(f.io, "board.md", todos, ""), importInBoardFile(f.io, "board.md", todos, "")]);
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(f.text, `${IMPORT_MARKER}\n## TODO\n- x\n- a\n`);
  assert.deepEqual(await importInBoardFile(f.io, "board.md", null, null), { ok: true, changed: false });
  const g = fakeIo(null);
  assert.deepEqual(await importInBoardFile(g.io, "board.md", null, null), { ok: true, changed: true });
  assert.equal(parseBoard(g.text).imported, true);
});

test("import edge cases: a BOM-only file, checkbox cards, comments in the lists, an open block", async () => {
  // a file with only a BOM is an empty file: it gets the headings and keeps the BOM
  const bom = importLists(BOM, "- [ ] a\n", "");
  assert.equal(bom, `${BOM}${IMPORT_MARKER}\n## TODO\n- a\n## Priority\n## In progress\n## Done\n`);
  assert.equal(importLists(BOM, null, null).startsWith(`${BOM}${IMPORT_MARKER}`), true);
  // a card that carries its own checkbox, or trailing spaces, is the same line as the todo
  assert.deepEqual(importCandidates("## TODO\n- [ ] a\n- b\n", "- [ ] a\n- [ ] b  \n- [ ] c\n", ""), [{ column: "todo", body: "c" }]);
  // the lines with a comment mark would open a comment on the board: not offered
  assert.deepEqual(importCandidates(null, null, "1. DEMO-1\n<!-- old\n2. DEMO-2\n-->\n3. DEMO-3\n").map((c) => c.body), ["DEMO-1", "DEMO-2", "DEMO-3"]);
  // a file that ends inside a code block is left alone
  const f = fakeIo("## TODO\n- x\n```\n## Done\n");
  assert.deepEqual(await importInBoardFile(f.io, "board.md", "- [ ] a\n", ""), { ok: false, message: "the file ends inside a comment or a code block" });
  assert.equal(f.text, "## TODO\n- x\n```\n## Done\n");
  assert.equal(parseBoard("## TODO\n<!--\n").unclosed, true);
  assert.equal(parseBoard("## TODO\n<!-- a -->\n```\nx\n```\n").unclosed, false);
});

test("cardFace leaves the key to its pill and falls back to Jira's summary", () => {
  const face = (line, summary) => cardFace(parseBoard(`## TODO\n- ${line}\n`).columns[0].cards[0], summary ? { summary } : undefined);
  assert.deepEqual(face("Call the bank"), { title: "Call the bank", detail: null });
  assert.deepEqual(face("DEMO-12 ship the import"), { title: "ship the import", detail: null });
  assert.deepEqual(face("DEMO-12: ship the import", "Ship it"), { title: "ship the import", detail: "Ship it" });
  assert.deepEqual(face("DEMO-12", "Ship it"), { title: "Ship it", detail: null });
  assert.deepEqual(face("DEMO-12"), { title: "DEMO-12", detail: null });
  assert.deepEqual(face("see DEMO-12 today"), { title: "see DEMO-12 today", detail: null });
});
