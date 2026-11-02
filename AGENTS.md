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

Status: Phase 1 (the foundation and the review ledger) is built: the summary, ledger and Settings, the hub, and the tests. Phases 2 to 6 follow the spec.

## Task routing

| When the task involves… | Read first | Key rules |
|---|---|---|
| herdr-app mod API: layouts, panes, commands, `herdr` module | `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts` next to it (written by the installed herdr-app) | The installed type files are the truth for the installed version. No `setTimeout`/`setInterval` (use `cx.timer`), never keep a `cx`, no top-level side effects on `globalThis`, animate natively, no `Intl`. `herdr-app check mods/friday` passes before a mod change is called done. What the runtime does and does not have (no `fetch` headers, no `AbortController`, `btoa` instead of `Buffer`, separate module scope per pane): `.ai/specs/research/2026-11-02-herdr-app-spikes.md`. |
| Widgets, dialogs, the pane header | `mods/friday/main.js`, `mods/friday/widgets/`, `mods/friday/dialogs/` | Widgets stay thin over `core/`; colors from `theme()`; never block a render on network or disk; a failing source shows its error state, never breaks the pane. |
| Polling, leases, alerts | `mods/friday/hub.js`, `mods/friday/core/lease.js`, `mods/friday/core/due.js` | One fetch per source across all panes; alerts at most once per occurrence and offset (R11); alerts more than 60 s late are dropped. |
| Settings, secrets, data folder | `mods/friday/store.js`, `mods/friday/core/settings.js`, `mods/friday/core/datafile.js` | Data folder `${appHome()}/data/friday/`. Secrets only in `secrets.json` (R12): never in `shared()`, `localStorage`, logs, errors, toasts, fixtures or screenshots. Writes go through `writeTextFile` with the expected snapshot. |
| Pure logic and tests | `mods/friday/core/`, `test/` | `core/` never imports `herdr`; every rule there has a `node --test` test; fixtures are anonymized, with no company keys, links or names (D32). |
| Jira | TODO: `mods/friday/core/jira.js` (Phase 2); first-version spec, Outbound calls | Token scoped to `read:jira-work` and `write:jira-work`; the only writes are worklogs and their comments, each confirmed first (D10, D25, D27). |
| Review ledger | `mods/friday/core/ledger.js`; `herdr-friday/src/ledger.rs` | Read only; never recount its minutes (R08); logging a day skips rows already logged (R09). |
| Meetings | TODO: `mods/friday/core/meetings.js`, vendored `ical.js` (Phase 3) | The iCal address is a secret. Recurrence, EXDATE, RECURRENCE-ID and DST each have fixtures. |
| Azure DevOps | TODO: `mods/friday/core/ado.js`, `core/prs.js` (Phase 4) | PAT scope Code (Read); no writes (N03). |
| Todos, notes, priorities, favorites | TODO: `mods/friday/core/mdfile.js` (Phase 2) | Plain `.md` files owned by the owner; never delete a line or rewrite one Friday did not change; keep CRLF, BOM and a missing final newline (R10). |
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
