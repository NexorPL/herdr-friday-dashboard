# Backward compatibility

These are the surfaces that the owner's saved state and files depend on. Each surface below enters in force in the phase of `.ai/specs/2026-11-02-friday-on-herdr-app.md` that ships it, and that phase's PR moves it from "Planned" to "In force".

Versioning follows SemVer in `package.json`. Before 1.0, a breaking change goes in a minor bump with a migration note in the release notes.

## In force

### Mod name and widget ids (in force since Phase 1)

herdr-core saves each Friday pane as `{ "mod": "friday", "props": { "widget": "<id>" } }` in the owner's tabs.

- **Breaking:** renaming the mod folder `friday` or a `widget` id, which turns saved panes into errors.
- **Required path:** never rename an id. A replaced widget keeps answering to its old id.

### Launcher `mod.open:friday` (in force)

The owner's `keys.json` binds a key to `mod.open:friday`. It works through the `overlay` entry in `mods/friday/mod.json` and the launcher branch in `main.js` (`props().overlay` without `dialog` or `widget`), which selects or creates the Friday tab and closes its overlay.

- **Breaking:** removing or renaming the `overlay` entry, or changing the launcher check so the open starts a widget or does nothing.
- **Required path:** keep `mod.open:friday` working, and note any change in the release notes.

### `settings.json` (in force since Phase 1, keys added per phase)

`settings.json` lives in the data folder, `${appHome()}/data/friday/`. Phase 1 defines `ledger.path`; Phase 3 adds `calendar.email`, `calendar.interval` (default `10m`), `calendar.alerts` (default `["5m"]`) and `notifications.sound` (`none`, `done` or `blocked`; default `done`); Phase 2 adds `jira.site`, `jira.email`, `jira.token_kind` (`scoped` or `classic`; default `scoped`) and `jira.interval` (default `5m`); Phase 4 adds `azure_devops.organization`, `azure_devops.project`, `azure_devops.repo` (the repo name) and `azure_devops.interval` (default `2m`); each later phase adds its own, as listed in the spec's Data Model. `mods/friday/core/settings.js` is the one definition of the keys. The file carries `"version": 1`; a Friday that finds a newer version leaves the file alone and names the version it needs.

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

One Jira key per line in the data folder, in the owner's order; other text on a line is kept and ignored. Friday only adds a key, as a line of its own, under R10: no line is ever deleted or rewritten, and CRLF or LF per line, a BOM and a missing final newline are kept (`core/mdfile.js`). `priorities.md` is read only for its Jira keys until Phase 4.

- **Breaking:** a format change that makes existing files unreadable, or that rewrites content Friday did not change.
- **Required path:** always read the older format, and never reformat a file wholesale.

### `prs.json` (in force since Phase 4)

`{ "version": 1, "repos": { "<organization>/<project>/<repo>": { "baseline_set": bool, "prs": { "<id>": { title, author, created_at, is_draft, url, first_seen_at, last_seen_at, active, unseen, notified } } } } }`, written with compare-and-swap. It is why a new PR gets one toast (R11) and why the first fetch of a repo is a silent baseline, also across restarts. `notified` means no toast is owed (true for the baseline); a draft waits unnotified until it is ready. Inactive rows keep only `active`, `is_draft`, `notified` and `last_seen_at`, for 30 days, so a PR that comes back is not new again.

- **Breaking:** renaming a field, changing what `notified` or `unseen` mean (which makes open PRs toast again or hides new ones), or changing the repo key shape (a new key starts a silent baseline, so the owner misses the PRs that arrived in between).
- **Required path:** read the older shape, raise `version` and migrate forward on read.

## Planned

### Data-folder files and their `version` (Phase 1 onward)

`settings.json` already follows this (see In force). `worklogs.json` is in force too (see above). The other files are `prices.json` and `tokens.json`, each with `"version"`.

- **Breaking:** a change that loses data or needs the owner to delete a file.
- **Required path:** raise `version` and migrate the file forward on read. A Friday that finds a newer version leaves the file alone and names the version it needs.

### The other `.md` files (Phase 4)

These are `todos.md`, `notes.md` and `priorities.md` in the data folder; `favorites.md` is in force (see above).

- **Breaking:** a format change that makes existing files unreadable, or that rewrites content Friday did not change (R10).
- **Required path:** always read the older format, and never reformat a file wholesale.

### Token metric (Phase 6)

Headline tokens = input + cache creation + output; cache read is a separate column (R02).

- **Breaking:** changing the formula, which changes every reported number including history.
- **Required path:** a spec that names the change, plus a release note.
