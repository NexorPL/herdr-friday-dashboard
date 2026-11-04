# Repository guidelines

## Project overview

Friday is a work dashboard for herdr-app, herdr's desktop app, written as one JavaScript mod (`mods/friday`) that runs in herdr-app's QuickJS runtime. A Friday tab holds several panes of the mod, each showing one widget:

- a summary with the clock;
- today's meetings from a secret iCal address, with Teams and Meet join;
- Jira issues assigned to the owner, and Jira favorites with time logging;
- the PR review ledger, with per-PR time logging to Jira;
- active Azure DevOps pull requests;
- todos, notes and priorities as `.md` files;
- daily tokens and cost from Claude Code, Codex and Pi.

herdr-app moves, resizes and splits the panes. There is no background process: the mod polls while herdr-app is open and alerts with herdr-app toasts. It is built for its owner first.

Scope, rules and decisions are in `.ai/specs/product-brief.md` (ids `D`, `R`, `N`; D34–D42 and R12 are the herdr-app ones). The design and the six-phase plan are in `.ai/specs/2026-11-02-friday-on-herdr-app.md`. The terminal plugin this replaces lives on, frozen, in `NexorPL/herdr-friday`; port its rules and fixtures, not its structure.

Status: Phases 1 and 3 (the foundation and the review ledger; meetings and alerts) are built: the summary, ledger, meetings and Settings, the hub, and the tests. Phases 2, 4, 5 and 6 follow the spec.

## Task routing

| When the task involves… | Read first | Key rules |
|---|---|---|
| herdr-app mod API: layouts, panes, commands, `herdr` module | `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts` next to it (written by the installed herdr-app) | The installed type files are the truth for the installed version. No `setTimeout`/`setInterval` (use `cx.timer`), never keep a `cx`, no top-level side effects on `globalThis`, animate natively, no `Intl`. herdr-app silently ends a job that runs about 0.5 s without `await cx.sleep(0)`: no `catch`, no `finally`, no error in `herdr-app status`. `herdr-app check mods/friday` passes before a mod change is called done. What the runtime does and does not have (no `fetch` headers, no `AbortController`, `btoa` instead of `Buffer`, separate module scope per pane): `.ai/specs/research/2026-11-02-herdr-app-spikes.md`. |
| Widgets, dialogs, the pane header | `mods/friday/main.js`, `mods/friday/widgets/`, `mods/friday/dialogs/` | Widgets stay thin over `core/`; colors from `theme()`; never block a render on network or disk; a failing source shows its error state, never breaks the pane. |
| Polling, leases, alerts | `mods/friday/hub.js`, `mods/friday/core/lease.js`, `mods/friday/core/due.js` | One fetch per source across all panes; alerts at most once per occurrence and offset (R11); alerts more than 60 s late are dropped. |
| Settings, secrets, data folder | `mods/friday/store.js`, `mods/friday/core/settings.js`, `mods/friday/core/datafile.js` | Data folder `${appHome()}/data/friday/`. Secrets only in `secrets.json` (R12): never in `shared()`, `localStorage`, logs, errors, toasts, fixtures or screenshots. Writes go through `writeTextFile` with the expected snapshot. |
| Pure logic and tests | `mods/friday/core/`, `test/` | `core/` never imports `herdr`; every rule there has a `node --test` test; fixtures are anonymized, with no company keys, links or names (D32). |
| Jira | TODO: `mods/friday/core/jira.js` (Phase 2); first-version spec, Outbound calls | Token scoped to `read:jira-work` and `write:jira-work`; the only writes are worklogs and their comments, each confirmed first (D10, D25, D27). |
| Review ledger | `mods/friday/core/ledger.js`; `herdr-friday/src/ledger.rs` | Read only; never recount its minutes (R08); logging a day skips rows already logged (R09). |
| Meetings and alerts | `mods/friday/core/meetings.js`, `core/calendar.js`, `core/alerts.js`, vendored `mods/friday/vendor/ical.js` | The iCal address is a secret (`secrets.json`, `ical_url`). Recurrence, EXDATE, RECURRENCE-ID and DST each have fixtures. Expansion starts near the window and has step budgets (QuickJS is slow); `alerts.json` is `{version, sent}`, keys `uid|ISO occurrence|offset_min`. |
| Azure DevOps | `mods/friday/core/ado.js`, `core/prs.js`, `dialogs/ado-section.js`, `widgets/prs.js` | PAT scope Code (Read); no writes (N03). The PAT is in `secrets.json` (`ado_pat`) and in error text never; the first fetch of a repo is a baseline with no toasts; a new PR toasts once, recorded in `prs.json` first (R11). |
| Todos, notes, priorities, favorites | `mods/friday/core/mdfile.js`, `core/lists.js`, `widgets/lists.js` | Plain `.md` files owned by the owner; never delete a line or rewrite one Friday did not change; keep CRLF, BOM and a missing final newline (R10). |
| Tokens and prices | TODO: `mods/friday/core/tokens/`, `core/pricing.js` (Phase 6); `herdr-friday/src/tokens/`, `src/pricing.rs` | Headline tokens = input + cache creation + output; cache read is its own column (R02). Copilot CLI is Later (D41). |
| Screenshots for PRs | `scripts/demo-home.mjs` | Only from a sandbox app home (`HERDR_APP_HOME`) seeded with fixtures, never from the owner's real one. |
| CI | `.github/workflows/ci.yml` | `node --test` on Linux for pull requests, on Linux, macOS and Windows on `main`; Actions minutes are limited, so run the gate locally before pushing. |
| Product decisions, the brief | `.ai/specs/product-brief.md`, `.ai/specs/research/` | Non-goals, rules and decisions are a protected contract; a change needs an owner-approved superseding row. |

## Agents and models

Implementation sub-agents run on Sonnet 5.5, or Haiku 5.5 for small mechanical steps. Code, spec and plan reviews run on Opus 5.5. The owner reviews and merges every PR; agents never approve or merge their own.

## Validation

Run before every push (also in `.ai/agentic.config.json`):

```bash
node --test
```

For a change under `mods/friday`, also run `herdr-app check mods/friday` on a machine with herdr-app (not in CI).

## Process docs

- `SDLC.md`: ticket flow, labels, QA gate, claim protocol.
- `CODE_REVIEW.md`: review rules.
- `BACKWARD_COMPATIBILITY.md`: protected contract surfaces.
- `.ai/agentic.config.json`: agent pipeline configuration.
