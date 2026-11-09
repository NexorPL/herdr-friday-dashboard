# One screen for what matters: a kanban board on top

Brief: `.ai/specs/briefs/2026-11-04-one-screen-workboard.md`.

## 📝 TLDR

The owner plans the day across several tools and has no board and no way to reorder priorities. Today Friday's lists can only add a line, toggle a checkbox and open the file. This spec proposes a future `board` widget backed by a new `board.md`, with the columns TODO, Priority, In progress and Done, and a new layout with the board on top and the other widgets and a small active tab below it. Moves stay inside one plain file, and Friday never deletes a line.

## 📝 Problem Statement

The owner said on 2026-11-04 that they want one clear, professional screen showing what matters, without going to several tools. They check outside Friday whether they are working on their priorities, want to move priorities up and down, and want a built-in kanban board. They first asked for animations and then dropped them as not key.

Closing the Friday tab also loses the owner's pane arrangement, because herdr-core saves it with the tab and `panes()` exposes no geometry a mod could restore. A layout file does not have this problem.

The evidence is the owner's own word. `layouts/friday.json` shipped the same day and has barely been used, so the first days on the new screen should show what is still missing.

On the home machine `priorities.md` has 2 lines, and there is no `todos.md`. The work machine (D33) was not checked, so the import has to handle any size.

## 📝 Proposed Solution

Three phases, each its own PR:

1. **The board.** A `board` widget over `board.md`, reachable from the **+** menu. A card is a line under one of four headings, and moving a card moves its line. Works alone.
2. **The screen.** `layouts/friday-board.json`: the board across the top, the other widgets and a small active tab in a row below, the sidebar on the left. Needs Phase 1.
3. **Moving by mouse.** Press on a card and release on a column or another card, with no floating card. Needs Phase 1 and a check that passes. The owner dropped the wait of a few workdays on 2026-11-05: moving by mouse is what makes the board worth using.

The owner's choices on 2026-11-04:

| Question | Choice | Rejected, and why |
|---|---|---|
| Split | The board and its screen only | Bundling the PR, agent-launch and calendar work: each works alone. Bundling the note input and favorite reordering: unrelated to the board, so they ship as separate small PRs |
| Where cards live | One `board.md` | A view over `todos.md` and `priorities.md`: a move across files is two writes with no transaction and a delete R10 forbids. `board.json`: no longer the owner's plain file (D40) |
| Existing lists | The board replaces `todos` and `priorities` on the new screen; one import copies their lines | Keeping both as equals: the same work in two places |
| Moving | Keys, plus press and release | Keys and buttons only: no mouse on the card. A floating card: a window redraw per mouse move (`~/.config/herdr-app/AGENTS.md`: every redraw of a mod redraws the whole window) |
| Screen | A layout file with the board on top | The middle of `friday.json`: 380 to 720 px, too narrow for four columns. A pane in the tab only: closing the tab loses it |
| Active tab | A small tab block and tab bar stay on the new screen | No tab: clicks in the sidebar and `mod.open:friday` would change nothing visible, tab panes might not start, and keys might reach a hidden terminal |
| New tabs | The board is in the **+** menu only; `DEFAULT_SPLITS` is unchanged | A full-width board at the bottom of a new tab: it reshapes every other pane |
| Jira keys | The cap stays at 40; favorites first; Done cards fetch no status | Raising the cap: each key outside the assigned issues is one GET per poll, a fetch over 30 s outlives the lease, and one non-404 failure fails the whole fetch |

Market check, from memory and not re-read today: the Obsidian Kanban plugin also stores a board as Markdown with a heading per column and a list item per card, which supports this format. It adds a settings block and an archive section; this spec skips both. Trello-style details (labels, due dates, card descriptions, several boards) are skipped too: the owner asked for a place to throw items and see them move. The one gap this leaves is that Done grows forever, because R10 forbids deleting; the owner can trim it by hand with `e`.

Build nothing lost because the owner already leaves Friday daily for this and named what is missing.

## 📝 Architecture

Everything stays inside the existing mod. Nothing new runs in the background and no new dependency is added.

- **New** `core/board.js`: parse `board.md`, add a card, move a card, selection, import. Pure, with `node --test` tests, and no `herdr` import.
- **New** `widgets/board.js`: thin rendering and input.
- **Extended** `core/mdfile.js`: `moveLines` and an `onlyMoved` guard. `keepsEveryLine` stays as it is for adds and the import, because it checks line order and would refuse a move.
- **Extended** `core/lists.js`: `MARKER` is exported so cards can hide their list marker. Nothing else changes, so saved `todos` and `priorities` panes and `friday.json` keep working. The `priorities` widget stays unmovable; the Priority column is where priorities move.
- **Extended** `core/jira.js`: `keySet(favorites, priorities, boardKeys)`, tiered as under Data Model.
- **Extended** `hub.js`: `fetchJira` also reads `board.md` for those keys. The shape of `shared("friday.jira")` is unchanged, because a card reads `data.issues` by key.
- **Extended** `core/widgets.js`, `store.js` (`LIST_FILES.board`, `moveOnBoard`, `addToBoard`, `importToBoard`, `dismissImport`), `main.js` (`LISTS`, `BODIES`, `boardKey`), `dialogs/addline.js` (a `board` list with a `column` prop, writing through `addToBoard`).
- **New** `layouts/friday-board.json`, mirroring `layouts/friday.json` for everything that is not Friday.

## 📝 Data Model

No database and no new JSON file. One new plain file in the data folder (D40), `board.md`:

```markdown
<!-- friday: lists imported -->
## TODO
- Call the bank
## Priority
- DEMO-12 ship the import
## In progress
- Prepare the demo
## Done
- Book the train
```

The rules, which become a protected surface once shipped:

- A column is a heading whose text is exactly `TODO`, `Priority`, `In progress` or `Done`, ignoring case and heading level. The first such heading counts.
- A card is a non-blank, unindented, non-heading line under a column heading. Its list marker is hidden when drawn. An indented line below a card belongs to that card and moves with it.
- A card's first Jira key links it to the issue. Its column is not related to Jira's status (D10, D25).
- Lines above the first column heading, and lines under any other heading, are never moved or changed and are not drawn. The widget says how many there are, not counting comment lines.
- The line `<!-- friday: lists imported -->` records that the import was done or dismissed. Removing it by hand offers the import again.
- A new file is created on the first add or import, with all four headings. A missing heading is added at the end of the file when a card first needs it.
- Lines keep their text, including any checkbox a hand-written line has. The column says what state a card is in, so a move to Done changes no character.

Friday writes `board.md` only through these operations, under R10: no line is deleted or rewritten, and CRLF or LF per line and a BOM are kept. When the file has no final newline, the line that becomes last has none, and the line that moved away from the end takes the file's terminator.

Jira keys per poll stay capped at `MAX_EXTRA_KEYS` = 40 (owner decision, confirmed again on 2026-11-04). `keySet` fills tiers in order and sorts only the result: favorites, `priorities.md`, then the first key of cards in Priority, In progress and TODO. Done cards take no slot.

A data-model graph is skipped: this is one file format with no entities or relations.

## 📝 API Contracts

Pure functions, in the `editMd` style (`{ ok, changed }` or `{ ok: false, message }`, with no file content in a message):

- `parseBoard(text)` returns `{ columns: [{ id, title, cards }], outside, imported }`. A card is `{ line, size, text, count, above, body, key }`, with the same duplicate rule as `todoRows`, but counted with one map so a parse is linear in the file's lines.
- `moveCard(text, card, place)` returns `{ text, plan }` or null. `place` is `{ column, before: card }` or `{ column, at: "top" | "end" }`. Null means the card is gone or ambiguous, and the owner sees `file changed, try again`. A move that changes nothing returns the same text.
- `defaultPlace(column)`: `top` in Done, so the newest is first, and `end` elsewhere. Used when a card changes column.
- `onlyMoved(before, after, plan)`: remove the plan's moved lines from `before`, and those lines plus the plan's added headings from `after`. The rest must match byte for byte, text and terminator alike, with the last-line rule as the only exception. Added headings can only be exact column headings, and the BOM must be the same. It is passed to `editMd` as a closure over the latest plan, because `editMd` calls `keeps(before, after)` and a retry recomputes the plan.
- `addCard(text, column, body)`: a `- body` line at the end of the column, guarded by `keepsEveryLine`.
- `importCandidates(boardText, todosText, prioritiesText)`: the lines not yet on the board, from `todoRows` and `priorityRows`. Open todos go to TODO, done todos to Done, priorities to Priority in their order. N in the offer is its length.
- `importLists(boardText, todosText, prioritiesText)`: adds those as `- body` plus the marker, guarded by `keepsEveryLine`. With the marker already there it changes nothing.
- `nextSelection(board, selection, key)`: a selection is `{ column, card }`, where `card` is null on an empty column so `a` has a target. Up and down stop at the edges. Left and right go to the neighbouring column at the same position or its last card. `selectCard(board, text)` follows a moved card.
- `cardsWithoutStatus(board, issues, missing)`: the count of keyed cards outside Done that Jira did not return.

Keys, on the focused `board` widget: arrows select, and Shift+arrows move the selected card. `boardKey` checks Shift first, because `e.key` is `"down"` with Shift held too. Shift+Up and Shift+Down move within the column, and Shift+Left and Shift+Right change column with `defaultPlace`. `a` adds to the selected column, Enter or `o` opens the card's Jira issue, `e` opens the file, `n` adds a quick note, `r` reads again. As in `toggleTodoRow`, a key that would write is dropped while a write is in flight.

## 📝 UI/UX

```text
┌ spaces ┐ ┌ Board ──────────────────────────────────────────────────────┐
│        │ │ TODO 3      Priority 2     In progress 1      Done 12       │
│        │ │ ┌────────┐  ┌───────────┐  ┌────────────┐     ┌────────┐    │
│ agents │ │ │ card   │  │DEMO-12    │  │ card       │     │ card   │    │
│        │ │ └────────┘  │summary    │  └────────────┘     └────────┘    │
│        │ │             │In review  │                                   │
│        │ │             └───────────┘                                   │
│        │ ├ Summary ──┬ Pull requests ┬ Jira ─────┬ Notes ──┬ tab bar ──┤
│        │ │ clock     │               │           │         │           │
│        │ ├ Meetings ─┼ Review ledger ┼ Favorites ┤         │ active    │
│        │ │           │               │           │         │ tab       │
└────────┘ └───────────┴───────────────┴───────────┴─────────┴───────────┘
```

- **Board.** Columns are equal width and each scrolls alone. The column's card count sits in its header. Each column is a filled lane and a card a filled, rounded rectangle on it. A card shows its body, wrapped to at most three lines, and with a Jira key also the summary in dim text and the key and Jira's status as pills. A leading key is left to its pill, and a card that is only a key takes the summary as its body. The selected card has the `selected` color from `theme()` and an accent border.
- **Done.** Draws the first 50 cards and a `+N more` row. Cards there show no Jira status.
- **Status.** When keyed cards are past the cap, the board says `N cards without status`.
- **Import.** While the marker is missing and `importCandidates` finds lines, the board shows `Import N lines from todos.md and priorities.md`, with **Import** and **Dismiss**. Adding a card first does not remove the offer. The source files stay untouched. The board reads them on its slower timer until the marker exists, so an edit there shows within about 15 seconds.
- **Empty.** With no import to offer: `No cards yet. Add one with a.`
- **Mouse (Phase 3).** Press marks the card, dims it and selects it. While it is held, the column under the pointer gets an accent border and a line shows where the card will land. Release over another card places it above that card, and release on a column's header or free space uses `defaultPlace`. Release on the same card only selects. A redraw happens only when the target changes. The kit has no release-outside event, so the pointer leaving the board ends the drag and writes nothing; a press through `on_mouse_down_out` clears the mark if the pointer left too fast for a hover event.
- **Layout.** Mirrors `friday.json` for the sidebar, the status bar and the hidden `panel`. The tab bar and the active tab sit in the last column of the lower row, which the owner can resize. Sizes the owner drags are saved by herdr-app in `layouts/.state/`. All Friday blocks carry `"block": true`.

Accessibility: every action works by keyboard. Status is text, not color alone.

## 📝 Edge Cases & Failure Scenarios

- **The file changed under a move** (a hand edit, or the board in another copy): `writeTextFile` rejects the stale snapshot, and `editMd` re-reads and re-applies once. If the card is gone or now ambiguous: `file changed, try again`, and the file stays as it was.
- **Duplicate lines:** as in `toggleCheckbox`, one of several is moved only at its old index with every line above it unchanged.
- **The guard refuses a result:** `refused: it would change other lines`, and nothing is written.
- **`board.md` over 1 MiB, or unreadable:** the error state with the last read kept, as the other lists do. No write is attempted.
- **A long Done column:** the parse is linear and runs once per read, and only 50 cards are drawn, so it does not reach herdr-app's silent 0.5 s job limit. Above 1 MiB the case above applies.
- **A heading renamed by hand:** its cards count as outside and are not drawn. The widget says how many lines are not shown, and a move re-adds the missing heading at the end.
- **A card with a Jira key Jira cannot find, or Jira not set up:** the card shows its own text and no status. The board needs no Jira to work. Text such as `UTF-8` reads as a key, takes a slot and shows no status.
- **Jira fails:** the pane header shows the source's error, as other widgets do, and cards keep the last known status.
- **Import in two copies at once:** the compare-and-swap write and the marker make the second one change nothing, so no card is doubled.
- **A new key:** an add or import with a key bumps `SETTINGS_REV`, so its status arrives on the next poll, not after a full interval.
- **Layout blocks restart on a switch:** the selection and a pending mark are lost, and the file is read again. Saved cards are not affected.

## 📝 Risks & Impact Review

- **Press and release held up.** `on_mouse_up` fires on a different element than the press, and `on_hover` fires with the button held; see `research/2026-11-05-press-and-release.md`.
- **The lower row is tight.** Five columns on about 1150 px leave about 230 px each. Whether that reads well is judged on the sandbox screenshot in Step 2.1, and the owner can resize them.
- **New protected surfaces.** The `board` id, the `board.md` format and the `layouts/friday-board.json` name are hard to change once shipped. Rollback: `board.md` is plain text and can be left unused, and the old widgets are still there.
- **Two places during the move.** Until the owner stops using `todos` and `priorities`, an item can be in both, because the import is one-way. Accepted by the owner. `friday.json` still shows the old widgets.
- **The owner may not live on this screen.** The riskiest assumption is that they will stay here instead of glancing at a tab; nothing has tested it. The screen comes second so this gets tested before the mouse work starts.

## 📝 Decisions in play

Relies on: R10 (no line deleted, kept by moves), D35 (herdr-app rearranges panes; a layout file adds no layout code to the mod), D38, D40 (the data folder), D10 and D25 (a move never writes to Jira), N03, and D32 (fixtures). Keeps the 40-key cap recorded in the phase 2 run log (maintainer-local).

New rows for the product brief, approved by the owner on 2026-11-04 through this spec's answers, each added by the PR that ships it:

- **D43 (Phase 1):** Planning lives on a kanban board in `board.md` with the columns TODO, Priority, In progress and Done; a move is one line moving in one file. Refines D40, which it does not supersede.
- **R13 (Phase 1):** On `board.md` Friday only adds a line, moves a card's lines or adds a missing heading or the import marker. It changes no line's text and deletes none, and a card's column never writes to Jira. R10's "applies to" gains `board.md`.
- **D44 (Phase 2):** `layouts/friday-board.json` is a further way to show the widgets, next to the Friday tab and `friday.json`, with the board on top and the active tab kept.

Nothing in this spec supersedes a Non-goal.

## 📋 Phasing

Each phase is its own PR, and the app works after each one.

1. **The board.** `board.md`, the widget, keys, add, import, Jira status, in the **+** menu.
2. **The screen.** `layouts/friday-board.json` and the README.
3. **Moving by mouse.** The check passed; see `research/2026-11-05-press-and-release.md`.

Separate small PRs, not in this spec, and neither needs the board:

- **A one-line note input on the `notes` widget.** It adds a timestamped line through `addEntry`. A failed write keeps the typed text and shows the message. It must check whether typed keys reach the pane's `on_key_down`, say what `a` does once the Add button goes, and accept that a draft is lost when a layout block restarts.
- **Reorderable favorites**, Shift+Up and Shift+Down, on `moveLines`. It needs its own decision row widening the "only adds" contract in `BACKWARD_COMPATIBILITY.md`. It must use one key list (`jiraKeys` in `hub.js` takes every key on a line, `favoriteKeys` the first), keep the cursor on the moved key, and re-read the file before `fetchJira` writes `data`, or a move made during a fetch reverts on screen until the next poll. If it ships before Phase 1, it brings `moveLines` with it. The frozen plugin's `move_item` (`herdr-friday/src/mdfile.rs`) is the rule to port, without its renumbering, which `favorites.md` does not need.

Later, each with its own spec, and no tasks until the board has been used for a while:

- **PR actions on Azure DevOps:** start an agent review of a PR, open it, and show the number of review rounds. Needs a check of where rounds come from (the ledger may hold them). N03 stays: Friday's PAT never writes.
- **Starting an agent:** in a predefined folder, with a worktree or without, or as a sub-agent. Needs a check of what a mod can start through `exec` and `terminal.open`.
- **Full calendar:** titles and join links. Blocked until the Workspace admin enables a secret iCal address.
- **Animations and a visual showpiece:** parked by the owner. If revisited, animate natively (`.loop`, `.transition`, `svg().spin`), never with a timer.

## 📋 Implementation Plan

### Phase 1 — The board

1. `core/mdfile.js`: `moveLines` and `onlyMoved`. Test: CRLF and LF mixed, a BOM, no final newline in each direction, refused results for a changed text, a reordered outside line and a normalized terminator.
2. `core/board.js`: `parseBoard`, `addCard`, `moveCard`, `defaultPlace`. Export `MARKER` from `core/lists.js`. Test: fixtures for headings in any case and level, outside lines, indented lines moving with their card, duplicates, a missing heading added, Done on top, a move to the end of Done, a stale target returning null.
3. `core/board.js`: `nextSelection`, `selectCard`, `cardsWithoutStatus`. Test: empty columns, edges, crossing columns, following a moved card.
4. `core/board.js`: `importCandidates`, `importLists`. Test: open and done todos, numbered priorities, lines already on the board skipped, a board that already has cards, the marker making a second run change nothing.
5. `store.js`: `LIST_FILES.board`, `moveOnBoard`, `addToBoard`, `importToBoard`, `dismissImport`. Test: fake `io` for a rejected write that retries once, a retried plan reaching the guard, and two imports.
6. `core/jira.js` and `hub.js`: the tiered `keySet`. Test: existing `keySet` cases still pass, favorites survive a full board, Done takes no slot, the cap stays 40.
7. The `board` entry in `core/widgets.js` with `sources: ["jira"]`, `widgets/board.js` and the wiring in `main.js`, parsing once per read. Update the `WIDGETS` assertion in `test/core.test.js`. Test: `herdr-app check mods/friday`; a sandbox run covering every key, Shift first; a screenshot.
8. `dialogs/addline.js`: the `board` list with its `column` prop, through `addToBoard`, bumping `SETTINGS_REV` when the line has a key. Test: `addCard` fixtures; a sandbox run.
9. The import offer in the widget, and the slower read of the two source files until the marker exists. Test: `importCandidates` drives the count; a sandbox run with Import, Dismiss, and an add before either.
10. `scripts/demo-home.mjs` seeds `board.md` with made-up cards (D32). Add D43 and R13 to the brief, and `board` and `board.md` to In force in `BACKWARD_COMPATIBILITY.md`. Test: `test/demo-home.test.js`; `node --test`.

### Phase 2 — The screen

1. `layouts/friday-board.json` as drawn in UI/UX. Test: extend `test/layout.test.js` to the new file: known widget ids, `block: true`, unique ids, the active tab and tab bar present, no theme or font, the board first. A sandbox screenshot, with `layout.switch` tried both ways, including a click on an agent in the sidebar.
2. README: the new layout and how to install it. Add D44, and the layout name to In force in `BACKWARD_COMPATIBILITY.md`. Test: `node --test`; `herdr-app check mods/friday`.

### Phase 3 — Moving by mouse

1. Check on the installed herdr-app, at most half a day, with a scratch mod that is then removed: `on_mouse_up` on an element other than the press; `.hover` with the button held; a release outside the pane; `on_mouse_down_out` clearing the mark. Record the results in `.ai/specs/research/`. Test: the note answers each of the four, and Phase 3 stops here if the first fails.
2. Press marks a card, and release on a card or a column calls `moveCard`. Handlers stop propagation so one release makes one move. Test: `herdr-app check`; the target choice is a pure function with tests; a sandbox run.
3. Cancel through `on_mouse_down_out`, with no write. Test: a pure state function; a sandbox run, including a release outside the pane.
