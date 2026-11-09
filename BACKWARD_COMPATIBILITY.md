# Backward compatibility

These are the surfaces that the owner's saved state and files depend on. Each surface below enters in force in the phase of `.ai/specs/2026-11-02-friday-on-herdr-app.md` that ships it, and that phase's PR moves it from "Planned" to "In force".

Versioning follows SemVer in `package.json`. Before 1.0, a breaking change goes in a minor bump with a migration note in the release notes.

## In force

### Mod name and widget ids (in force since Phase 1)

herdr-core saves each Friday pane as `{ "mod": "friday", "props": { "widget": "<id>" } }` in the owner's tabs.

- **Breaking:** renaming the mod folder `friday` or a `widget` id, which turns saved panes into errors.
- **Required path:** never rename an id. A replaced widget keeps answering to its old id.
- **Removed 2026-11-07 (owner):** the `jira` widget. A saved pane with it shows "Unknown widget"; a saved Friday tab arrangement that has it falls back to the default. The Jira source, `favorites.md`, `priorities.md` and card status are unchanged.

### Launcher `mod.open:friday` (in force)

The owner's `keys.json` binds a key to `mod.open:friday`. It works through the `overlay` entry in `mods/friday/mod.json` and the launcher branch in `main.js` (`props().overlay` without `dialog` or `widget`), which selects or creates the Friday tab and closes its overlay.

- **Breaking:** removing or renaming the `overlay` entry, or changing the launcher check so the open starts a widget or does nothing.
- **Required path:** keep `mod.open:friday` working, and note any change in the release notes.

### `settings.json` (in force since Phase 1, keys added per phase)

`settings.json` lives in the data folder, `${appHome()}/data/friday/`. Phase 1 defines `ledger.path` (unset by default since 0.1.0: the review ledger is optional and stays off until a path is set); Phase 3 adds `calendar.email`, `calendar.interval` (default `10m`), `calendar.alerts` (default `["5m"]`) and `notifications.sound` (`none`, `done` or `blocked`; default `done`); Phase 2 adds `jira.site`, `jira.email`, `jira.token_kind` (`scoped` or `classic`; default `scoped`) and `jira.interval` (default `5m`); Phase 4 adds `azure_devops.organization`, `azure_devops.project`, `azure_devops.repo` (the repo name; the single repo of a settings.json from before `repos`, still read when `repos` is empty and removed when Settings saves `repos`), `azure_devops.repos` (a list of repo names of the one project, D52) and `azure_devops.interval` (default `2m`); each later phase adds its own, as listed in the spec's Data Model. `mods/friday/core/settings.js` is the one definition of the keys. The file carries `"version": 1`; a Friday that finds a newer version leaves the file alone and names the version it needs.

- **Breaking:** removing or renaming a key, changing a key's meaning or default, or rejecting a value that used to be accepted.
- **Required path:** keep reading the old key for at least one minor release, and say so in Settings; note the migration in the release notes.

### Secrets file `secrets.json` (in force since Phase 3, entries per phase)

`secrets.json` is in the data folder and holds `jira_token`, `ado_pat` and `ical_url` (R12), each only once its phase ships: Phase 3 ships `ical_url`, the secret iCal address of the calendar; Phase 2 ships `jira_token`, the Atlassian API token (scopes `read:jira-work` and `write:jira-work`), which can write worklogs; Phase 4 ships `ado_pat`, the Azure DevOps personal access token (scope Code (Read) only; Friday never writes to Azure DevOps). It is plain text, written only by Settings and read only by the code that fetches. A secret never goes into `shared()`, `localStorage`, logs, errors, toasts, fixtures, screenshots or git.

- **Breaking:** renaming an entry, which loses a stored secret.
- **Required path:** read the old name, write the new one, then drop the old.

### `alerts.json` (in force since Phase 3)

`{ "version": 1, "sent": { "<uid>|<occurrence_start>|<offset_min>": <sent_at ms> } }`, written with compare-and-swap (R11). It is why a meeting alert is shown once per occurrence and offset, also across restarts.

- **Breaking:** changing the key format, which makes every alert in the next minute fire a second time.
- **Required path:** read the old keys until their entries are pruned (7 days), and raise `version`.

### `worklogs.json` (in force since Phase 2)

`{ "version": 1, "worklogs": [{ jira_id, issue_key, day, started, seconds, comment, origin ("ledger" or "favorite"), ledger_pr, created_at }] }`, one record per worklog Friday wrote, once per `jira_id`, written with compare-and-swap. It is the input to R09: losing it makes Friday see its own earlier worklogs as "logged outside Friday", and a row lost before it was recorded can be logged twice.

- **Breaking:** renaming a field, changing what `origin` or `ledger_pr` mean, or dropping the file.
- **Required path:** read the older shape, raise `version` and migrate forward on read.

### `favorites.md` (in force since Phase 2)

One Jira key per line in the data folder, in the owner's order; other text on a line is kept and ignored. Friday adds a key as a line of its own, or swaps a key with its neighbour among the rows (Shift+Up and Shift+Down in the favorites widget, D45; a key counts at its first line) by moving one line, under R16: no line is rewritten, a line is deleted only for one favorite the owner confirmed in a dialog (its first line, D51), a result that is not exactly that move or removal is refused, and CRLF or LF per line, a BOM and a missing final newline are kept (`core/mdfile.js`). `priorities.md` is also read by the priorities widget (see below).

- **Breaking:** a format change that makes existing files unreadable, or that rewrites content Friday did not change.
- **Required path:** always read the older format, and never reformat a file wholesale.

### `prs.json` (in force since Phase 4)

`{ "version": 1, "repos": { "<organization>/<project>/<repo>": { "baseline_set": bool, "prs": { "<id>": { title, author, created_at, is_draft, url, first_seen_at, last_seen_at, active, unseen, notified } } } } }`, written with compare-and-swap. It is why a new PR gets one toast (R11) and why the first fetch of a repo is a silent baseline, also across restarts. `notified` means no toast is owed (true for the baseline); a draft waits unnotified until it is ready. Inactive rows keep only `active`, `is_draft`, `notified` and `last_seen_at`, for 30 days, so a PR that comes back is not new again.

- **Breaking:** renaming a field, changing what `notified` or `unseen` mean (which makes open PRs toast again or hides new ones), or changing the repo key shape (a new key starts a silent baseline, so the owner misses the PRs that arrived in between).
- **Required path:** read the older shape, raise `version` and migrate forward on read.

### `todos.md`, `notes.md` and `priorities.md` (in force since Phase 5)

Plain Markdown in the data folder, owned by the owner (D26, D40); Friday and the owner both edit them. Formats Friday reads and writes, kept as the first version had them (G29):

- `todos.md`: checkbox lines (`- [ ]` / `- [x]`); other lines are kept and ignored. A new todo is `- [ ] text` at the end. Toggling changes the one character between the brackets of the exact line the owner saw; if that line is gone or ambiguous the toggle is refused ("file changed, try again"). A done todo stays as `- [x]`.
- `notes.md`: every non-blank line that is not a heading is a note, newest first. A quick note is `- YYYY-MM-DD HH:MM text` (local time) inserted on top, right after the first heading.
- `priorities.md`: numbered, bulleted or plain lines are all read as items (headings and blank lines are skipped); an item with a Jira key shows that issue's status. A new priority is added at the end in the file's own style: the next number after a numbered item (same `.` or `)`), the same bullet after a bullet, `- ` when there is no list yet; never bare text, so text starting with `#` cannot become a heading.

All writes are under R16: no line is deleted or rewritten except that one checkbox character and, in `priorities.md`, one row the owner confirmed in a dialog (D51), and a row may move one place up or down (Shift+Up and Shift+Down, D50): it swaps with its neighbouring row, the indented lines right under it travel with it, and numbers are not renumbered. A move is refused if the line under the cursor is no longer the one drawn. CRLF or LF per line, a BOM and a missing final newline are kept (`core/mdfile.js`, `core/lists.js`). The widget ids `todos`, `notes` and `priorities` are in force too (see the widget ids above).

- **Breaking:** a format change that makes existing files unreadable, or that rewrites content Friday did not change (R16).
- **Required path:** always read the older format, and never reformat a file wholesale.

### The `board` widget and `board.md` (in force since the workboard, Phase 1)

The widget id `board` is in force (see the widget ids above). `board.md` is plain Markdown in the data folder, owned by the owner (D43); Friday and the owner both edit it.

- A column is a heading whose text is exactly `TODO`, `Priority`, `In progress` or `Done`, ignoring case and heading level; the first such heading counts.
- A card is a non-blank, unindented line under a column heading that is not a heading or a lone `<!-- -->` comment. An indented line right below a card belongs to it and moves with it. A card's first Jira key links it to the issue; its column is unrelated to Jira's status.
- Lines above the first column heading and under any other heading are never moved or changed and are not drawn; the widget says how many there are.
- `<!-- friday: lists imported -->` records that the import was done or dismissed (the import itself is a later story).
- A new file is created on the first add with all four headings; a missing heading is added at the end of the file when a card first needs it.

Friday writes `board.md` only to add `- text` after the last card of a column, to move a card's lines, to add a missing heading, to rewrite the one first line of a card the owner edits or flags (R14, D48), or to delete the lines of one card the owner confirmed in a dialog (R15, D49), under R16: no other line is deleted or rewritten, CRLF or LF per line and a BOM are kept, and a result that is not exactly that change is refused ("refused: it would change other lines"). When the file has no final newline, the line that ends it has none and the line that moved away from the end takes the file's terminator (`core/mdfile.js`, `core/board.js`).

- **Breaking:** renaming the `board` id or `board.md`, changing the column names or the card rules so existing files read differently, or any write that deletes a line other than the lines of the card the owner confirmed, or changes the text of a line other than the first line of the card being edited or flagged. A card starting with `! ` is a priority; a `## Priority` heading (D43) is still read and is never written.
- **Required path:** always read the older format, and never reformat a file wholesale.

### `arrangement.json` and the `restore` prop (in force since D46)

`{ "version": 1, "root": <node> }` in the data folder, where a node is `{ "widget": "<id>", "weight": n }` or `{ "split": "row" | "column", "weight": n, "children": [<node>, ...] }` (at least two children; the root has no weight). It holds only widgets, splits and sizes, and is replaced with compare-and-swap when the arrangement changes (`core/arrangement.js`). A missing, broken or newer file gives the default arrangement, and a newer file is left alone. `mod.open:friday` opens the new tab's pane with `{ "widget": "<first widget>", "restore": true }`; herdr-core keeps those props with the pane, so a build must keep treating `restore` as "rebuild only when alone in the tab". Panes added beside others, by a rebuild or the + menu, carry `"arranged": true`, which herdr-core keeps too, and such a pane never runs the default arrangement.

- **Breaking:** renaming a field or changing what `weight` means, which brings back the default arrangement once for the owner; making a pane with `restore` rearrange a tab that is already arranged; letting a pane with `arranged` run the default arrangement.
- **Required path:** read the older shape, raise `version` and migrate forward on read.
- **Not a contract:** the core's `docs.json` is an internal file of herdr-core, only ever read. If its format changes, the result is the default arrangement and the last saved file stays.

### `layouts/friday-board.json` (in force since the workboard, Phase 2)

A layout file the owner copies to `~/.config/herdr-app/layouts/` and switches to by name (D44). Its name `friday-board` is what the owner's `layout.switch` calls and key bindings use, and herdr-app saves the sizes the owner drags under that name. Every Friday block carries `"block": true`, uses only widget ids of `core/widgets.js`, and the file has no theme or font of its own; everything that is not Friday mirrors `layouts/friday.json`.

- **Breaking:** renaming the file, dropping `"block": true` (the block would arrange and split like a pane of a tab), or using a widget id that does not exist.
- **Required path:** keep the name; add or move blocks freely, and note it in the release notes.

### `layouts/friday-panel.json` (in force since the Friday button)

A layout file the owner copies to `~/.config/herdr-app/layouts/` and switches to by name (D47). herdr-app saves the panel's size and which of its blocks are shown under that name, and the column `friday-panel` holds one block per widget of `core/widgets.js`, named `friday-panel-<widget id>`, which is what the button's menu shows, hides and reorders. A reorder goes through `layout.set`, which rewrites the owner's copy of the file with the owner's order, so that copy can differ from the repository's and an update must not assume the order. Every Friday block carries `"block": true`, and the file has no theme or font of its own; everything that is not Friday mirrors `layouts/friday.json`.

- **Breaking:** renaming the file or the `friday-panel` nodes, dropping `"block": true`, or using a widget id that does not exist.
- **Required path:** keep the names; a new widget gets its block here in the order of `core/widgets.js`, which `test/layout.test.js` checks.

## Planned

### Data-folder files and their `version` (Phase 1 onward)

`settings.json` already follows this (see In force). `worklogs.json` is in force too (see above). The other files are `prices.json` and `tokens.json`, each with `"version"`.

- **Breaking:** a change that loses data or needs the owner to delete a file.
- **Required path:** raise `version` and migrate the file forward on read. A Friday that finds a newer version leaves the file alone and names the version it needs.

### Token metric (Phase 6)

Headline tokens = input + cache creation + output; cache read is a separate column (R02).

- **Breaking:** changing the formula, which changes every reported number including history.
- **Required path:** a spec that names the change, plus a release note.
