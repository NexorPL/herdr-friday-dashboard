# Backward compatibility

These are the surfaces that the owner's saved state and files depend on. Each surface below enters in force in the phase of `.ai/specs/2026-11-02-friday-on-herdr-app.md` that ships it, and that phase's PR moves it from "Planned" to "In force".

Versioning follows SemVer in `package.json`. Before 1.0, a breaking change goes in a minor bump with a migration note in the release notes.

## In force

### Mod name and widget ids (in force since Phase 1)

herdr-core saves each Friday pane as `{ "mod": "friday", "props": { "widget": "<id>" } }` in the owner's tabs.

- **Breaking:** renaming the mod folder `friday` or a `widget` id, which turns saved panes into errors.
- **Required path:** never rename an id. A replaced widget keeps answering to its old id.

### `settings.json` (in force since Phase 1, keys added per phase)

`settings.json` lives in the data folder, `${appHome()}/data/friday/`. Phase 1 defines one key, `ledger.path`; each later phase adds its own, as listed in the spec's Data Model. `mods/friday/core/settings.js` is the one definition of the keys. The file carries `"version": 1`; a Friday that finds a newer version leaves the file alone and names the version it needs.

- **Breaking:** removing or renaming a key, changing a key's meaning or default, or rejecting a value that used to be accepted.
- **Required path:** keep reading the old key for at least one minor release, and say so in Settings; note the migration in the release notes.

## Planned

### Data-folder files and their `version` (Phase 1 onward)

`settings.json` already follows this (see In force). The other files are `worklogs.json`, `alerts.json`, `prs.json`, `prices.json` and `tokens.json`, each with `"version"`. `worklogs.json` is the input to R09, so losing it can double-log time in Jira.

- **Breaking:** a change that loses data or needs the owner to delete a file.
- **Required path:** raise `version` and migrate the file forward on read. A Friday that finds a newer version leaves the file alone and names the version it needs.

### Secrets file (Phase 2, entries per phase)

`secrets.json` holds `jira_token`, `ado_pat` and `ical_url` (R12).

- **Breaking:** renaming an entry, which loses a stored secret.
- **Required path:** read the old name, write the new one, then drop the old.

### The owner's `.md` files (Phase 2 onward)

These are `todos.md`, `notes.md`, `priorities.md` and `favorites.md` in the data folder.

- **Breaking:** a format change that makes existing files unreadable, or that rewrites content Friday did not change (R10).
- **Required path:** always read the older format, and never reformat a file wholesale.

### Token metric (Phase 6)

Headline tokens = input + cache creation + output; cache read is a separate column (R02).

- **Breaking:** changing the formula, which changes every reported number including history.
- **Required path:** a spec that names the change, plus a release note.
