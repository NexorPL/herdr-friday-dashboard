# Changelog

Friday follows [SemVer](https://semver.org). Before 1.0 a breaking change goes in a minor bump, with a migration note here. The surfaces that count as breaking are listed in `BACKWARD_COMPATIBILITY.md`.

## 0.1.2

Checked against herdr-app 0.1.14. Existing data files and `settings.json` work as they are.

- **Pull requests**: read the pull requests of several repos of one project. Settings picks the repos with a checklist after **Test**; the widget lists them together, newest first, with the repo named on each row. Each repo has its own silent first read and its own new-PR toasts, and a repo that fails keeps its last rows while the others are still read (D52).
- **Setting**: `azure_devops.repos` is the list of repo names. The older `azure_devops.repo` is still read when `repos` is empty, so nothing needs migrating; saving repos from Settings drops the old key. `prs.json` is unchanged.
- **Fix**: the **To board (b)** button of the priorities and todos widgets stays in view in a narrow pane, with long labels cut by an ellipsis, instead of being pushed out of it.

## 0.1.1

Checked against herdr-app 0.1.14. No format or setting changes: existing data files and `settings.json` work as they are.

- **Priorities**: **To board (b)** puts a priority on the board's TODO column; **Log time** (✎, `l`) opens the time-log dialog for the row's Jira key, as in Favorites; **Delete** asks first, then removes the row's line.
- **Favorites**: **To board (b)** adds a favorite's key to the board; **Delete** asks first, then removes the key's line.
- **Deleting a row** is new for these two files (R16, D51): one line, after a confirmation, refused if the file changed. Todos and notes still have no delete.
- README: status badges, a Platforms table (the remembered Friday tab is Windows only) and a section on connecting the iCal address, Jira token and Azure DevOps PAT.
- CI: the `test` check now also runs on pull requests that change only docs, since `main` requires it.

## 0.1.0

The first version: Friday as a mod for herdr-app, checked against herdr-app 0.1.12.

### Widgets

- **Summary**: the clock and date, today's review time, and a set-up checklist until Friday is configured.
- **Meetings**: today's meetings from a secret iCal address, with Teams and Meet join, recurrence, exceptions and DST handled, and toasts before a meeting starts.
- **Favorites**: Jira issues you follow, with status, a confirmed time-log dialog and reordering.
- **Priorities**, **Todos** and **Notes**: plain `.md` files you own. Todos toggle, notes take a timestamped line from an input that is always there, priorities show the Jira status of a key.
- **Pull requests**: active Azure DevOps pull requests, with a toast for a new one.
- **Review ledger**: the PR review ledger by day, with per-PR time logging to Jira. Off until `ledger.path` is set.
- **Board**: a kanban board in `board.md` (TODO, In progress, Done). Move cards with Shift+arrows or by mouse, add, edit and delete a card, flag a priority (shown in red and in a row above the columns), import todos and priorities, and see Jira status on cards.

### Layouts and panel

- The Friday tab remembers its arrangement of panes.
- `layouts/friday.json` (mission control), `layouts/friday-board.json` (the board on top) and `layouts/friday-panel.json` (a **Friday ▾** button before the tabs with a side panel of widgets you check, order, fold, hide and show).

### Across widgets

- Rows with an action start with icons (↗ open, ✎ time log, ▶ join). A click selects; Enter or a double-click does the main action.
- A row cut short shows its full text in a hover label.
- Shift+Up and Shift+Down reorder favorites, todos, notes and priorities by moving one line.

### Safety

- Secrets live only in `secrets.json` in the data folder, never in logs, errors, toasts or `shared()`.
- Friday writes to Jira only confirmed worklogs and their comments, and nothing to Azure DevOps.
- Your `.md` files are edited line by line: a move changes no line's text, and a rewrite or delete touches one card's lines after you ask for it. CRLF or LF per line, a BOM and a missing final newline are kept.

### Not in this version

- Daily tokens and cost from Claude Code, Codex and Pi: herdr-app's mods cannot read transcripts over 1 MiB.
