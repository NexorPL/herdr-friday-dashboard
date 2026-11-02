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

`settings.json` lives in the data folder, `${appHome()}/data/friday/`. Phase 1 defines `ledger.path`; Phase 3 adds `calendar.email`, `calendar.interval` (default `10m`), `calendar.alerts` (default `["5m"]`) and `notifications.sound` (`none`, `done` or `blocked`; default `done`); each later phase adds its own, as listed in the spec's Data Model. `mods/friday/core/settings.js` is the one definition of the keys. The file carries `"version": 1`; a Friday that finds a newer version leaves the file alone and names the version it needs.

- **Breaking:** removing or renaming a key, changing a key's meaning or default, or rejecting a value that used to be accepted.
- **Required path:** keep reading the old key for at least one minor release, and say so in Settings; note the migration in the release notes.

### Secrets file `secrets.json` (in force since Phase 3, entries per phase)

`secrets.json` is in the data folder and holds `jira_token`, `ado_pat` and `ical_url` (R12), each only once its phase ships: Phase 3 ships `ical_url`, the secret iCal address of the calendar. It is plain text, written only by Settings and read only by the code that fetches. A secret never goes into `shared()`, `localStorage`, logs, errors, toasts, fixtures, screenshots or git.

- **Breaking:** renaming an entry, which loses a stored secret.
- **Required path:** read the old name, write the new one, then drop the old.

### `alerts.json` (in force since Phase 3)

`{ "version": 1, "sent": { "<uid>|<occurrence_start>|<offset_min>": <sent_at ms> } }`, written with compare-and-swap (R11). It is why a meeting alert is shown once per occurrence and offset, also across restarts.

- **Breaking:** changing the key format, which makes every alert in the next minute fire a second time.
- **Required path:** read the old keys until their entries are pruned (7 days), and raise `version`.

## Planned

### Data-folder files and their `version` (Phase 1 onward)

`settings.json` already follows this (see In force). The other files are `worklogs.json`, `prs.json`, `prices.json` and `tokens.json`, each with `"version"`. `worklogs.json` is the input to R09, so losing it can double-log time in Jira.

- **Breaking:** a change that loses data or needs the owner to delete a file.
- **Required path:** raise `version` and migrate the file forward on read. A Friday that finds a newer version leaves the file alone and names the version it needs.

### The owner's `.md` files (Phase 2 onward)

These are `todos.md`, `notes.md`, `priorities.md` and `favorites.md` in the data folder.

- **Breaking:** a format change that makes existing files unreadable, or that rewrites content Friday did not change (R10).
- **Required path:** always read the older format, and never reformat a file wholesale.

### Token metric (Phase 6)

Headline tokens = input + cache creation + output; cache read is a separate column (R02).

- **Breaking:** changing the formula, which changes every reported number including history.
- **Required path:** a spec that names the change, plus a release note.
