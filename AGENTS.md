# Repository guidelines

## Project overview

Friday is a work dashboard for herdr-app, herdr's desktop app, written as one JavaScript mod (`mods/friday`) that runs in herdr-app's QuickJS runtime. A Friday tab holds several panes of the mod, each showing one widget:

- a summary with the clock;
- today's meetings from a secret iCal address, with Teams and Meet join;
- Jira favorites with time logging (issues come from Jira for priorities, favorites and board cards);
- the PR review ledger, with per-PR time logging to Jira;
- active Azure DevOps pull requests;
- todos, notes and priorities as `.md` files;
- daily tokens and cost from Claude Code, Codex and Pi.

herdr-app moves, resizes and splits the panes. There is no background process: the mod polls while herdr-app is open and alerts with herdr-app toasts. It is built for its owner first.

> `.ai/` holds the published part of the maintainer's working notes: the product brief (rules `R`, decisions `D`, non-goals `N`), the design specs and research notes. Interviews, decision sessions, agent run logs, the agent pipeline's config and the process doc `SDLC.md` stay local, so a path into one of them points at a file you will not find here.

Scope, rules and decisions are in `.ai/specs/product-brief.md` (ids `D`, `R`, `N`; D34–D42 and R12 are the herdr-app ones). The design and the six-phase plan are in `.ai/specs/2026-11-02-friday-on-herdr-app.md`. The terminal plugin this replaces lives on, frozen, in a private repository; port its rules and fixtures, not its structure.

Status: Phases 1 to 5 are built: the summary, ledger, meetings and alerts, Jira, Azure DevOps, the todo, note and priority lists, Settings, the hub, and the tests. Tokens (Phase 6) moved to Later (see the spec, Phasing). `layouts/friday.json` is a second way to show the widgets, next to the Friday tab.

## Task routing

| When the task involves… | Read first | Key rules |
|---|---|---|
| herdr-app mod API: layouts, panes, commands, `herdr` module | `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts` next to it (written by the installed herdr-app) | The installed type files are the truth for the installed version. No `setTimeout`/`setInterval` (use `cx.timer`), never keep a `cx`, no top-level side effects on `globalThis`, animate natively, no `Intl`. herdr-app silently ends a job that runs about 0.5 s without `await cx.sleep(0)`: no `catch`, no `finally`, no error in `herdr-app status`. `herdr-app check mods/friday` passes before a mod change is called done. What the runtime does and does not have (no `fetch` headers, no `AbortController`, `btoa` instead of `Buffer`, separate module scope per pane): `.ai/specs/research/2026-11-02-herdr-app-spikes.md`. |
| Widgets, dialogs, the pane header | `mods/friday/main.js`, `mods/friday/widgets/`, `mods/friday/dialogs/` | Widgets stay thin over `core/`; colors from `theme()`; never block a render on network or disk; a failing source shows its error state, never breaks the pane. Friday's layouts head their panes with `widgets/pane-head.js`: the widget's header for a Friday pane, the shipped `pane` look for a terminal. The widget comes from the core's `docs.json`, because `panes()` has no props. |
| Polling, leases, alerts | `mods/friday/hub.js`, `mods/friday/core/lease.js`, `mods/friday/core/due.js` | One fetch per source across all panes; alerts at most once per occurrence and offset (R11); alerts more than 60 s late are dropped. |
| Settings, secrets, data folder | `mods/friday/store.js`, `mods/friday/core/settings.js`, `mods/friday/core/datafile.js` | Data folder `${appHome()}/data/friday/`. Secrets only in `secrets.json` (R12): never in `shared()`, `localStorage`, logs, errors, toasts, fixtures or screenshots. Writes go through `writeTextFile` with the expected snapshot. |
| Remembering the Friday tab (D46) | `mods/friday/arrangement.js`, `mods/friday/core/arrangement.js`, `core/arrange.js`, `core/launch.js` | herdr-core's `docs.json` is only ever read (Windows path from `home()`; elsewhere saving does nothing); never `doc.set`. `arrangement.json` holds only widgets, splits and sizes. Closing the tab never clears it; layout blocks do not save; no saving during a rebuild. Bad document or file: the default arrangement, never an error in the pane. Only a pane alone in its tab rebuilds. `run()` returns nothing, so new panes are found by comparing `panes()`. The tests' split simulator is a model of herdr, not herdr: check a change in the live window. |
| The mission control layout | `layouts/friday.json`, `mods/friday/core/arrange.js`, `test/layout.test.js` | A copy of the mod in a layout block is not a pane: its props carry `"block": true`, which turns off the first-pane arrangement and the + menu. Mirror `main.json` from the installed herdr-app for everything that is not Friday; no theme or font of its own; use only widget ids from `core/widgets.js`. The Friday tab stays: it keeps the alerts alive across layout switches. |
| The Friday button and panel | `layouts/friday-panel.json`, `mods/friday/core/panel.js`, `mods/friday/dialogs/panel.js` | A button block (`panelMenu`) has no widget or hub; its one timer closes the panel while the focused tab holds Friday panes (`planAutoHide`). It stands beside the shipped `tabs` mod, which is not cloned. A new widget also gets a block in the panel's column (`test/layout.test.js` fails until it has one). Every copy started in the panel stays alive while the layout is shown. A collapsed block is one whose size is `COLLAPSED_PX` (`core/panel.js`); the layout's `min` for panel blocks is the same, and herdr-app holds a block at its `min` whatever `layout.resize` says. |
| Pure logic and tests | `mods/friday/core/`, `test/` | `core/` never imports `herdr`; every rule there has a `node --test` test; fixtures are anonymized, with no company keys, links or names (D32). |
| Jira | TODO: `mods/friday/core/jira.js` (Phase 2); first-version spec, Outbound calls | Token scoped to `read:jira-work` and `write:jira-work`; the only writes are worklogs and their comments, each confirmed first (D10, D25, D27). |
| Review ledger | `mods/friday/core/ledger.js` | Read only; never recount its minutes (R08); logging a day skips rows already logged (R09). |
| Meetings and alerts | `mods/friday/core/meetings.js`, `core/calendar.js`, `core/alerts.js`, vendored `mods/friday/vendor/ical.js` | The iCal address is a secret (`secrets.json`, `ical_url`). Recurrence, EXDATE, RECURRENCE-ID and DST each have fixtures. Expansion starts near the window and has step budgets (QuickJS is slow); `alerts.json` is `{version, sent}`, keys `uid|ISO occurrence|offset_min`. |
| Azure DevOps | `mods/friday/core/ado.js`, `core/prs.js`, `dialogs/ado-section.js`, `widgets/prs.js` | PAT scope Code (Read); no writes (N03). The PAT is in `secrets.json` (`ado_pat`) and in error text never; the first fetch of a repo is a baseline with no toasts; a new PR toasts once, recorded in `prs.json` first (R11). |
| The board (`board.md`) | `mods/friday/core/board.js`, `core/mdfile.js` (`moveLines`, `onlyMoved`), `widgets/board.js`, `.ai/specs/2026-11-04-one-screen-workboard.md` | A move changes no line's text and deletes none; only an edit or a priority flag (`k`, `p`) rewrites the one first line of its card, through `rewriteFirstLine` and `onlyLineChanged` (R14, D48), and only a delete the owner confirmed in `dialogs/deletecard.js` removes lines, through `removeCard` and `onlyRemoved` (R15, D49); every write goes through `editMd` with `onlyMoved` or `keepsEveryLine`; a redraw while dragging only when the target changes; `node --test` and `herdr-app check` cannot see layout, so look at a change in the live window. |
| Todos, notes, priorities, favorites | `mods/friday/core/mdfile.js`, `core/lists.js`, `widgets/lists.js` | Plain `.md` files owned by the owner; never rewrite a line Friday did not change; delete only a board card (R15, D49) or a priorities row or favorite the owner confirmed in `dialogs/deleterow.js` (R16, D51), never a todo or a note; keep CRLF, BOM and a missing final newline. |
| Tokens and prices (Later: transcripts over 1 MiB are unreadable, see the spec Phasing) | TODO: `mods/friday/core/tokens/`, `core/pricing.js` (Phase 6); the frozen plugin's token and pricing code | Headline tokens = input + cache creation + output; cache read is its own column (R02). Copilot CLI is Later (D41). |
| Screenshots for PRs | `scripts/demo-home.mjs` | Only from a sandbox app home (`HERDR_APP_HOME`) seeded with fixtures, never from the owner's real one. |
| CI | `.github/workflows/ci.yml` | `node --test` on Linux for pull requests and `main`, on Linux, macOS and Windows only when started by hand (`gh workflow run CI`); Actions minutes are limited, so run the gate locally before pushing. |
| Product decisions, the brief | `.ai/specs/product-brief.md`, `.ai/specs/research/` | Non-goals, rules and decisions are a protected contract; a change needs an owner-approved superseding row. |

## Agents and models

Implementation sub-agents run on Sonnet 5.5, or Haiku 5.5 for small mechanical steps. Code, spec and plan reviews run on Opus 5.5. The owner reviews and merges every PR; agents never approve or merge their own.

## Validation

Run before every push:

```bash
node --test
```

For a change under `mods/friday`, also run `herdr-app check mods/friday` on a machine with herdr-app (not in CI).

## Process docs

- `CODE_REVIEW.md`: review rules.
- `BACKWARD_COMPATIBILITY.md`: protected contract surfaces.
