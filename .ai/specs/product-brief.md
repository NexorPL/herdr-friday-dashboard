# Friday — product brief

> Notes this document cites but does not include (interviews, decision sessions, data, the first-version spec and agent run logs) are the maintainer's local notes and are not part of this repository. The ids (`D`, `R`, `N`, `G`) and the rows here are what the code and the docs rely on.

- Date: 2026-10-29; refreshed 2026-10-30 after a grilling session; copied to `herdr-friday-dashboard` and refreshed 2026-11-02 for herdr-app (D34–D42, R12)
- Mode: own (the owner is also the only target user); Owner: product owner (GitHub `NexorPL`); Pass: full
- Evidence basis: one person's account over two sessions (the owner, who builds Friday and is its only user for now), one dataset (the owner's PR review ledger, 24 working days), the owner's confirmed decisions (including a grilling session on 2026-10-29/30, `research/decisions/2026-10-30-grill-decisions.md`), and one competitor check from 2026-10-27. No other users were consulted (D17 puts them later). The most consequential untested beliefs: the iCal feed carries Teams and Meet join links (A01), and the owner can use a scoped Jira API token to add worklogs through the REST API (A02).
- Coverage: 73 claims — 66 sourced (interview 11, data 3, document 49, product 2, benchmark 1), 0 synthetic, 7 assumed; 2 entries on the collection plan
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: the owner (`NexorPL`), 2026-10-29; ready for: implementation planning of the stated scope, with A01 and A02 checked first
- Sources: `.ai/specs/research/interviews/2026-10-29-owner.md`, `.ai/specs/research/data/2026-10-29-pr-review-ledger.md`, `.ai/specs/research/decisions/2026-10-29-owner-decisions.md`, `.ai/specs/research/decisions/2026-10-30-grill-decisions.md`, `BACKWARD_COMPATIBILITY.md`

## Decision summary

**herdr-app, 2026-11-02.** This copy of the brief belongs to `herdr-friday-dashboard`, Friday rebuilt as a herdr-app mod (D34). Scope keeps the ten widgets with these changes: a Friday tab of panes instead of one herdr tab with views (D35), toasts while herdr-app is open instead of a background process (D36), no launcher jump (D37), secrets in a file (D39, R12), and Copilot CLI tokens moved to Later (D41). The text below is the terminal plugin's brief; where it conflicts with D34–D42 or R12, those win.

The decision: what goes into Friday's first version, and whether it is ready for a spec. Agreed by the owner on 2026-10-29.

Friday is built for one person, the owner, who works across Jira, Azure DevOps, Google Calendar and several coding agents and wants one herdr tab that works as a private secretary (Target group). The clearest observed workflow is PR review: 158 reviewer runs in 24 working days, counted by a hook ledger at 5 minutes per run, with the time later logged in Jira by an agent that splits it across each PR's Jira task (Problems).

Now is one tab with ten widgets on Windows, Linux and macOS: a Today screen with detail views behind keys, fed by a background process that also sends the alerts (D22, D23). It is listed in Scope and bounded by D01–D33, R01–R11 and N01–N04. Cursor and Gemini CLI tokens, other users and the Jira teams view come later. The one observed workflow, logging each PR's review minutes to its own Jira task, is in Now as an action on the review ledger (D21).

What could change the plan: whether the iCal feed carries join links (A01) and whether a scoped Jira API token can add worklogs (A02). The wishes for the meetings list, the PR list and the priorities rest on the owner's stated preferences; no case of a missed meeting or PR was described (Problems, A03).

Next: one spec for the whole first version, phased in the build order of D28. The owner checks A01 and A02 (Collection plan) before the meetings and time-logging parts are specified.

## Vision

For the owner: one herdr tab that shows the work day (meetings, priorities, Jira tasks, PRs, review time, token spend) and lets them act on it without switching tools. This is the intended direction, not a demonstrated benefit. `[INTERVIEW]` interviews/2026-10-29-owner.md

## Target group and stakeholders

- Customer (pays): none; a personal tool built by its user. `[DOCUMENT]` decisions D17
- User (uses): the owner, a developer who reviews Azure DevOps PRs with an agent, tracks work in Jira Cloud, has meetings in Google Workspace and runs several coding agents. `[INTERVIEW]` interviews/2026-10-29-owner.md
- Other users: later; not designed for in the first version. `[DOCUMENT]` decisions D17
- Stakeholders: a separate launcher plugin depends on the plugin id `friday` and the action `friday.open`. `[PRODUCT]` BACKWARD_COMPATIBILITY.md
- Decider for scope decisions: the owner (`NexorPL`).

## Problems, with evidence

- The owner runs the PR reviewer agent often: 158 runs over 24 working days, 1 to 17 a day. `[DATA]` data/2026-10-29-pr-review-ledger.md
- Some PRs are reviewed more than once, on the same day or on later days. `[DATA]` data/2026-10-29-pr-review-ledger.md
- Review time is a fixed estimate of 5 minutes per run, chosen by the owner, not measured time. `[DATA]` data/2026-10-29-pr-review-ledger.md
- To get review time into Jira, the owner asks an agent to log it; on 2026-10-29 the agent split the minutes across the Jira task of each PR, using the ledger's keys and minutes. How long this takes and how often it happens was not described. `[INTERVIEW]` interviews/2026-10-29-owner.md
- The owner wants the Jira tasks they work on most often saved as favorites, to log time and an optional comment from there. `[INTERVIEW]` interviews/2026-10-29-owner.md
- The owner wants upcoming meetings in one list and to join Teams and Google Meet calls from it; no recent missed or late meeting was described. `[INTERVIEW]` interviews/2026-10-29-owner.md
- The owner wants an ordered list of what matters to them, mixing Jira tasks and hand-written items; the cost of not having it was not described. `[INTERVIEW]` interviews/2026-10-29-owner.md
- The need behind the PR list, the meetings list and the priorities is inferred: switching between Jira, Azure DevOps, the calendar and notes costs the owner attention. `[ASSUMPTION]` agent inference; see A03

## Product and how it stands out

- What it is: a herdr plugin in Rust/ratatui that opens a work dashboard in its own tab; contents in Scope. `[DOCUMENT]` decisions D01, D03
- What makes it different: it runs inside herdr on Windows, where visor's herdr integration does not. `[BENCHMARK]` visor, checked 2026-10-27

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|
| visor | ready widgets for Jira, tasks and notes; a plugin protocol with secret inputs and choice menus | its herdr plugin supports macOS and Linux only; on Windows its meetings and reminders do not work | 2026-10-27 | https://github.com/oronbz/visor |

## Goals and success criteria

- Business goal: none beyond the owner's own use. `[DOCUMENT]` decisions D17
- User outcome: the owner sees today's meetings, priorities, assigned Jira tasks, active PRs, review time and token spend in one tab, and can log time and join a meeting from it. `[INTERVIEW]` interviews/2026-10-29-owner.md
- Primary metric, baseline today, threshold, date: not set; the owner chose to revisit this after some weeks of use (Q03).
- What must not get worse: the launcher keeps opening Friday through `friday.open`. `[PRODUCT]` BACKWARD_COMPATIBILITY.md

## Scope

- **Now** (D16, D17): one herdr tab, a Today screen plus detail views behind keys, where Enter opens any linked item in the system's default program (D23), fed by a background process that polls the sources and sends notifications with the tab closed (D22), with
  1. a clock (R05);
  2. today's meetings from the iCal address (D07, D24), past ones hidden by default (R04), with joining on Teams or Google Meet (A01);
  3. Priorities: an ordered list of Jira tasks and hand-written items (D26);
  4. Jira issues assigned to me;
  5. Jira favorites: added by key, with time logging and an optional comment (D10, D25, D26, R07, A02);
  6. Todos and Notes as `.md` files (D11, D26, R10);
  7. the PR review ledger as a per-day table, with an action that logs a day's review minutes to each PR's Jira task (D19, D21, D27, R08, R09);
  8. active PRs of one Azure DevOps repo, new ones marked (D08, R03);
  9. daily tokens and cost from Claude Code, Codex, Pi and Copilot CLI (D04, D05, D06, D15, R02);
  10. herdr notifications for a new PR and before meetings (D12, R06, R11).

  Built in the order of D28.
- **Later:** Cursor and Gemini CLI tokens (D15); other users and other providers (D17); the Jira teams view (postponed 2026-10-27); Jira status changes (D09 kept Jira read-only apart from D10).
- **Elsewhere:** The launcher's detection of Friday and its jump to `friday.open` are a change in the launcher's own repository, tracked there (D31).
- **Not doing:** see Non-goals.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Review ledger | Markdown file written by the owner's hook: per day, one row per Jira task and PR with runs, run times and minutes | the owner's hook | the owner |
| Run | One invocation of the `cloud-pr-reviewer` agent; the ledger counts it as 5 minutes | the owner | the owner |
| Favorite | A Jira task the owner saved by key to log time to it quickly | the owner | the owner |
| Priority | An item on the owner's ordered list: a Jira task or a hand-written entry | the owner | the owner |
| Headline tokens | Input + cache creation + output; cache read is shown separately (R02) | the owner | the owner |
| Worklog | A time entry on a Jira issue, optionally with a comment | Jira | everyone with access to the issue |
| Today screen | Friday's main view: clock, today's meetings, priorities, open todos, active PRs, today's review minutes and tokens (D23) | the owner | the owner |
| Background process | Friday's process started with herdr that polls the sources, stores results and sends notifications (D22) | Friday | the owner |

## Key flows

- Current state, review time: the owner runs the reviewer on a PR, the agent posts its report to Azure DevOps, the hook appends the run to the ledger, and later the owner asks an agent to log each PR's minutes to that PR's Jira task. `[INTERVIEW]` interviews/2026-10-29-owner.md
- Future state, time on a favorite: the owner picks a favorite Jira task in Friday, enters a duration and an optional comment, and Friday adds a worklog to that task (proposed steps; details in the spec). `[ASSUMPTION]` depends on A02
- Future state, joining a meeting: the owner picks an upcoming meeting and Friday opens its Teams or Google Meet link (proposed steps). `[ASSUMPTION]` depends on A01

Other flows are left to the spec.

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | The Azure DevOps PAT, the Jira token and the iCal address are stored only in the OS keyring, never in config, logs or test fixtures. | secrets | `[DOCUMENT]` decisions D13 | superseded | unknown | owner approves a superseding row | NexorPL | none |
| R02 | Headline tokens = input + cache creation + output; cache read is a separate column. | tokens widget | `[DOCUMENT]` decisions D05 | active | unknown | owner approves a superseding row | NexorPL | none |
| R03 | The Azure DevOps PAT has the Code (Read) scope only; Friday never writes to Azure DevOps. | PR widget | `[DOCUMENT]` decisions D08 | active | unknown | owner approves a superseding row | NexorPL | none |
| R04 | Meetings whose time has passed are hidden by default; a toggle shows them in their time slots, in chronological order. | meetings widget | `[INTERVIEW]` interviews/2026-10-29-owner.md | active | unknown | owner approves a superseding row | NexorPL | none |
| R05 | The clock shows the computer's local time as HH:MM:SS and updates every second. | clock | `[INTERVIEW]` interviews/2026-10-29-owner.md | active | unknown | owner approves a superseding row | NexorPL | none |
| R06 | Meeting alerts fire 5 minutes before by default; the owner can set several offsets, e.g. 15, 10 and 5. | notifications | `[DOCUMENT]` decisions D12 | active | unknown | owner approves a superseding row | NexorPL | none |
| R07 | Logging time on a favorite needs a duration; the comment is optional. | Jira favorites | `[INTERVIEW]` interviews/2026-10-29-owner.md | active | unknown | owner approves a superseding row | NexorPL | none |
| R08 | Review minutes are shown as the ledger records them; Friday does not recount them. | review ledger widget | `[DOCUMENT]` decisions D19 | active | unknown | owner approves a superseding row | NexorPL | none |
| R09 | Before logging a ledger row, Friday skips (day, task) pairs it already logged and pairs that already have the owner's worklog on that task and day, and marks them as logged; the owner can still select one deliberately. | review ledger time logging | `[DOCUMENT]` grill-decisions G08, G26 | active | unknown | owner approves a superseding row | NexorPL | none |
| R10 | Friday never deletes lines from the owner's `.md` files; done todos stay as `- [x]`. | todos, notes, priorities, favorites, board | `[DOCUMENT]` grill-decisions G28 | superseded | unknown | owner approves a superseding row | NexorPL | none |
| R11 | Each notification fires once: once per new PR, once per meeting occurrence and offset, also across restarts; an alert whose time passed while Friday was not running is not sent late. | notifications | `[DOCUMENT]` grill-decisions G15, G16 | active | unknown | owner approves a superseding row | NexorPL | none |
| R12 | The Azure DevOps PAT, the Jira token and the iCal address are stored only in `secrets.json` in Friday's data folder, never in settings, shared state, logs, toasts, errors or test fixtures. | secrets | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | active | unknown | owner approves a superseding row | NexorPL | R01 |
| R13 | On `board.md` Friday only adds a line, moves a card's lines or adds a missing heading or the import marker. It changes no line's text and deletes none, and a card's column never writes to Jira. | board | `[INTERVIEW]` 2026-11-04, spec `2026-11-04-one-screen-workboard.md` | superseded | unknown | owner approves a superseding row | NexorPL | none |
| R14 | On `board.md` Friday adds a line, moves a card's lines, adds a missing heading or the import marker, and rewrites the one first line of a card the owner edits or flags (a `! ` after its list marker). It deletes no line and changes no other, and a card's column or flag never writes to Jira. | board | `[INTERVIEW]` 2026-11-09 | superseded | unknown | owner approves a superseding row | NexorPL | R13 |
| R15 | On `board.md` Friday adds a line, moves a card's lines, adds a missing heading or the import marker, rewrites the one first line of a card the owner edits or flags (a `! ` after its list marker), and deletes the lines of one card the owner has confirmed in a dialog. It changes no other line, and a card's column, flag or deletion never writes to Jira. | board | `[INTERVIEW]` 2026-11-09 | active | unknown | owner approves a superseding row | NexorPL | R14 |
| R16 | Friday never deletes lines from the owner's `.md` files, except the lines of one board card (R15) and the line of one row of `priorities.md` or one key of `favorites.md`, each only after the owner confirmed it in a dialog; done todos stay as `- [x]` and no line of `todos.md` or `notes.md` is deleted. | todos, notes, priorities, favorites, board | `[INTERVIEW]` 2026-11-09 | active | unknown | owner approves a superseding row | NexorPL | R10 |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Any data exchange with the launcher; Friday neither reads nor writes launcher data. | Friday is self-contained; the launcher only detects and opens it. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions D02 | none |
| N02 | A server or Docker container. | A local SQLite file is enough. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions D04 | none |
| N03 | Any write to Azure DevOps (comments, votes, merges). | The PAT is read-only by choice. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions D08 | none |
| N04 | Google sign-in (OAuth) for the calendar. | The secret iCal address is available and needs no Google Cloud project. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions D07 | none |

## Decisions

Full wording and reasons for D01–D21 are in `research/decisions/2026-10-29-owner-decisions.md`, and for D22–D33 in `research/decisions/2026-10-30-grill-decisions.md` (G ids); the rows below carry the contract fields.

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-10-28 | Own herdr plugin in Rust/ratatui, not visor. | visor's herdr integration lacks Windows support. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D02 | 2026-10-28 | Self-contained; the launcher only detects Friday and opens `friday.open`. | Owner wants Friday autonomous, with only a jump from the launcher for now. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D03 | 2026-10-28 | Opens in its own herdr tab. | Owner's choice over a popup. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D04 | 2026-10-28 | Own token import into own SQLite; parsers copied from the launcher. | Autonomy; chosen over reading dashboard-tokens-usage's database. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D05 | 2026-10-28 | Headline token definition, see R02. | Daily numbers not inflated by cache reads (agent proposal, accepted). | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D06 | 2026-10-28 | Prices edited by hand, plus an action that fetches current prices and applies them. | Owner's choice. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D07 | 2026-10-27 | Meetings from the secret iCal address. | Available in the owner's calendar; avoids OAuth (agent proposal, accepted). | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D08 | 2026-10-27 | All active PRs of one repo, chosen by project then repo; new ones marked; PAT Code (Read). | Owner's description; narrowest scope that lists PRs. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D09 | 2026-10-28 | Jira view only. | First answer, "for now, just a view". | NexorPL | superseded | none | none | `[DOCUMENT]` decisions | none |
| D10 | 2026-10-29 | Jira favorites allow logging time with an optional comment. | Owner wants to log time from Friday. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | D09 |
| D11 | 2026-10-28 | Tasks and Notes as plain `.md` files. | Owner's choice. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D12 | 2026-10-28 | herdr notifications for a new PR and meeting alerts, see R06. | Owner's choice. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D13 | 2026-10-29 | Secrets in the OS keyring, see R01. | Agent proposal from 2026-10-27, confirmed by the owner. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D14 | 2026-10-28 | Six token sources including Cursor and Gemini CLI. | Owner wants different setups covered. | NexorPL | superseded | none | none | `[DOCUMENT]` decisions | none |
| D15 | 2026-10-29 | Four token sources now (Claude Code, Codex, Pi, Copilot CLI); Cursor and Gemini CLI later, after a local-data check. | Cursor is not installed on the checked machine; its three Gemini CLI sessions had no token fields (agent proposal, accepted). | NexorPL | superseded | after the Cursor and Gemini CLI check | owner approves a superseding row | `[DOCUMENT]` decisions | D14 |
| D16 | 2026-10-29 | The 2026-10-29 widget list adds to the earlier one; PRs, tokens and notifications stay. | Owner: the new list fills in what was forgotten. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D17 | 2026-10-29 | First version built for the owner and the owner's tools; other users later. | Owner: "pode mnie". | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D18 | 2026-10-28 | Repository private now, public later. | Owner's choice. | NexorPL | active | before going public | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D19 | 2026-10-29 | The review ledger widget reads the file the owner's hook writes, from a path in Friday's config; the hook stays the only source of runs and minutes. | The data already exists; the alternative, counting reviewer runs from agent transcripts in Friday, duplicates the hook (agent proposal, accepted). | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D20 | 2026-10-29 | The first version runs on Windows, Linux and macOS. | Owner's choice ("everywhere") over Windows first. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D21 | 2026-10-29 | The review ledger widget gets an action that logs a day's review minutes to each PR's Jira task, using the ledger's keys and minutes. | It is the only workflow observed in data, done today by an agent on request; the alternative was leaving it to the agent (agent recommendation, accepted). | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` decisions | none |
| D22 | 2026-10-30 | A background process polls the sources, stores results in SQLite and sends notifications, so alerts arrive with the tab closed; it follows the launcher's collector pattern. | Alerts that only work with the tab open are easy to miss (agent recommendation, accepted). | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G02, G13 | none |
| D23 | 2026-10-30 | A Today screen plus detail views behind keys; Enter opens any linked item in the system's default program. | Ten widgets do not fit one terminal screen; the owner added opening PRs in the browser. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G03, G12 | none |
| D24 | 2026-10-30 | The meetings list shows today only; all-day events on top without alerts; declined meetings hidden. | Owner's choice over today plus the next working day. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G07, G17 | none |
| D25 | 2026-10-30 | Friday calls Jira's REST API itself and writes native worklogs, with an API token scoped to `read:jira-work` and `write:jira-work`; an unscoped token only if scoped ones are not allowed. | Chosen over calling `acli`; MCP cannot be used from the binary (agent recommendation, accepted). | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G05, G11, G33 | none |
| D26 | 2026-10-30 | Todos, notes, priorities and favorites are `todos.md`, `notes.md`, `priorities.md` and `favorites.md` in one folder set in config. | Same plain-file approach as D11; editable by hand. | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G06, G18, G23 | none |
| D27 | 2026-10-30 | Logging a ledger day shows a confirmation list, follows R09, logs what it can on partial failure with a retry for the rest, shows how many rows are logged (e.g. 2 of 5), starts each worklog at the PR's first review run that day and comments `Code review PR !<number>`. | Prevents double logging while agents still log time outside Friday (agent recommendation, accepted; the owner added the logged count). | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G08, G25, G26 | none |
| D28 | 2026-10-30 | Build order: foundation; review ledger and Jira; meetings and alerts; Azure DevOps PRs; todos, notes and priorities; tokens and prices. | The only observed problem, review time logging, comes first (agent recommendation, accepted). | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G31 | none |
| D29 | 2026-10-30 | herdr builds Friday from source while the repository is private; release binaries come after it goes public. | Downloading releases from a private repository needs a login. | NexorPL | superseded | when the repo goes public (D18) | owner approves a superseding row | `[DOCUMENT]` grill-decisions G09 | none |
| D30 | 2026-10-30 | Copy from the launcher the herdr client, theme, line editor, `pricing.rs`, transcript parsers and build scripts; same look and keys; no shared crate. | Extends D04; keeps Friday self-contained (D02). | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G10 | none |
| D31 | 2026-10-30 | The launcher's detection of and jump to Friday is a separate issue in the launcher's own repository. | Friday only provides `friday.open` (D02). | NexorPL | superseded | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G30 | none |
| D32 | 2026-10-30 | Tests use UI snapshots and parser fixtures, never live APIs; fixtures are anonymized, with no company keys, links or names. | The repository will be public (D18). | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G32 | none |
| D33 | 2026-10-30 | Friday runs mainly on the work machine; every path is set in config. | The ledger, the agent sessions and the work tools are there. | NexorPL | active | unknown | owner approves a superseding row | `[DOCUMENT]` grill-decisions G01 | none |
| D34 | 2026-11-02 | Friday for herdr-app is a new product in `NexorPL/herdr-friday-mod`, rebuilt from scratch as one JavaScript mod with this brief's rules; the terminal plugin stays in `herdr-friday`. | The owner wants panels they can rearrange and chose a fresh design for herdr-app over porting the Rust code (Q1, Q4). | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | D01, D29, D30 |
| D35 | 2026-11-02 | One `friday` mod in a Friday tab; each pane shows one widget, and herdr-app moves, resizes and splits the panes. | Rearranging comes from herdr-app with no layout code in the mod (that part superseded by D46; the rest stays active); a pane in a tab keeps running while another tab is shown (Q2, Q7). | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | D03, D23 |
| D36 | 2026-11-02 | No background process: the mod polls the sources while herdr-app is open and alerts as herdr-app toasts. | Owner's choice (Q3). | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | D12, D22 |
| D37 | 2026-11-02 | No launcher contract; the launcher keeps opening the terminal plugin through `friday.open`. | A launcher port to herdr-app is undecided (Q5). | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | D02, D31 |
| D38 | 2026-11-02 | State lives in JSON files in Friday's data folder (`~/.config/herdr-app/data/friday/`) and in herdr-app's shared state; the token import stays Friday's own. | Mods cannot open SQLite. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | D04 |
| D39 | 2026-11-02 | Secrets live in `secrets.json` in the data folder, in plain text, see R12. | The owner does not want the OS keyring (Q8) and accepts that any program under their account can read the file. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | D13 |
| D40 | 2026-11-02 | `todos.md`, `notes.md`, `priorities.md` and `favorites.md` live in the data folder. | Mods write files only under `~/.config/herdr-app` (Q9). | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | D26 |
| D41 | 2026-11-02 | Tokens from Claude Code, Codex and Pi; Copilot CLI moves to Later. | Mods cannot read Copilot's SQLite file, and the owner rarely uses Copilot CLI (Q10, A04). | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | D15 |
| D42 | 2026-11-02 | A Settings dialog with a setup checklist writes `settings.json`, which can also be edited by hand. | On 2026-11-02 the owner found nothing told them what to set up (Q11). | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-02, spec `2026-11-02-friday-on-herdr-app.md` | none |
| D43 | 2026-11-04 | Planning lives on a kanban board in `board.md` with the columns TODO, Priority, In progress and Done; a move is one line moving in one file. | The owner plans the day across several tools and has no board and no way to reorder priorities. Refines D40, which it does not supersede. | NexorPL | superseded | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-04, spec `2026-11-04-one-screen-workboard.md` | none |
| D44 | 2026-11-04 | `layouts/friday-board.json` is a further way to show the widgets, next to the Friday tab and `friday.json`, with the board on top and the active tab kept. | The owner wants one screen showing what matters; the tab alone loses its pane arrangement when closed (no longer so, see D46). | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-04, spec `2026-11-04-one-screen-workboard.md` | none |
| D45 | 2026-11-05 | The owner can reorder `favorites.md` with Shift+Up and Shift+Down: Friday swaps a key with its neighbour among the rows by moving one line, and writes nothing else. | The owner asked for a way to reorder favorites (spec `2026-11-04-one-screen-workboard.md`, small PRs). Widens R10's 'Friday only adds' for `favorites.md` to 'adds or moves'; nothing is deleted or rewritten. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-04, spec `2026-11-04-one-screen-workboard.md` | none |
| D46 | 2026-11-05 | The mod saves the Friday tab's arrangement (widgets, splits, sizes) in `arrangement.json` by reading herdr-core's document, and `mod.open:friday` rebuilds it with `tab.new`, `pane.split` and `layout.resize`. The owner still arranges panes in herdr-app, and herdr's document is only read. | The owner rearranges after every close and after herdr dies. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-05 | D35 (only its "no layout code in the mod") |
| D47 | 2026-11-05 | `layouts/friday-panel.json` is a further way to show the widgets: herdr-app's main layout with a Friday button before the tabs, whose checkbox menu opens any number of widgets, one under the other and in an order the owner sets and keeps, in a closed panel on the right. The shipped tab bar stays as it is, not cloned. | The owner wants Friday on the tab bar and to pick which widgets appear, with the terminal at full width until then. A clone of the read-only `tabs` mod would never get updates. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-05 | none |
| D48 | 2026-11-09 | The board has the columns TODO, In progress and Done. A card is a priority when its text starts with `! `: the owner flags it with `p` and edits a card's text or Jira key with `k`, and the flagged cards also show in a row above the columns. A `## Priority` heading from D43 is still read and drawn while it holds cards, and is never written. Priorities imported from `priorities.md` go to TODO, flagged. A todo goes to TODO with `b` in the todos widget. Friday does not create Jira issues. | The Priority column was not useful; the owner wants to mark what matters and see it on top, to type a key onto a card, and to move a todo onto the board. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-09 | D43 |
| D49 | 2026-11-09 | The owner can delete a card from the board with Delete or the Delete button, after a dialog that shows the card. The card's first line and its indented lines go; the write is refused if the file changed since the card was drawn. | The board had no way to remove a card, and the owner wants one. This is the first time Friday deletes a line of an owner file, so it asks first. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-09 | none |
| D50 | 2026-11-09 | The owner can reorder the rows of `todos.md`, `notes.md` and `priorities.md` with Shift+Up and Shift+Down or the Up and Down buttons, as D45 does for favorites: Friday swaps a row with its neighbour by moving one line (with the indented lines under it), and writes nothing else. Numbers in a numbered priorities list are not renumbered. A row cut short in a widget shows its full text in a hover label. | The owner wants to set the order of every list, and to read a long row without opening the file. Widens R10's 'Friday only adds' for these files to 'adds or moves'; nothing is deleted or rewritten. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-09 | D45 |
| D51 | 2026-11-09 | The owner can delete a row of `priorities.md` or a key of `favorites.md` with Delete or the Delete button, after a dialog that shows it. The row's line goes (for a favorite, the first line of its key); the write is refused if the line under the cursor is no longer the one drawn. Todos and notes have no delete. | The owner asked for a way to remove a priority and a favorite. This widens D49's one-card delete to these two lists, under R16. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-09 | none |
| D52 | 2026-11-09 | The Pull requests widget reads the active PRs of one or several repos of one project, chosen by project then repos (a checklist in Settings); each row names its repo when there are several, and each repo has its own silent baseline and its own toasts. A repo that fails keeps its last rows and the others are still read. `azure_devops.repos` holds the names; the older `azure_devops.repo` is still read when `repos` is empty. PAT Code (Read) only. | The owner's project has several repositories and the widget saw only one (issue #7). Widens D08 from one repo to several of one project; several projects or organizations stay out. | NexorPL | active | unknown | owner approves a superseding row | `[INTERVIEW]` 2026-11-09 | D08 |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | The secret iCal feed carries the Teams or Google Meet join link of each online meeting. `[ASSUMPTION]` no material | high | none checked | joining from the list needs another source (Google sign-in, excluded by N04) or is dropped | open the feed's `.ics` locally and look for the link in one Meet and one Teams event (Collection plan) | NexorPL | before the meetings spec | confirmed 2026-11-01 `[INTERVIEW]`: the owner checked the feed, which carries both Teams and Meet links. Friday takes the link from the event's conference data, location or description. |
| A02 | A Jira API token scoped to `read:jira-work` and `write:jira-work` can add native worklogs and comments through Jira's REST API for the owner. `[ASSUMPTION]` partial material | high | on 2026-10-29 an agent added native worklogs to each PR's Jira task through the Atlassian MCP server or `acli` (owner's account); the REST API with an API token is not yet tried, and the organization may restrict API tokens | time logging on favorites and from the review ledger needs another integration (e.g. `acli`) or is dropped | create the scoped token and add one worklog through the REST API (Collection plan) | NexorPL | before the time-logging spec | untested. On 2026-11-01 `[INTERVIEW]` the owner chose this API-token route over the Atlassian MCP server or the Claude connector, because an organization can block a client that is not Claude. Friday builds it; the first `myself` call on the work machine shows whether the organization allows API tokens ("token rejected" if not). |
| A03 | Having everything in one tab saves the owner time or missed items compared with today's separate tools. `[ASSUMPTION]` agent inference | medium | the owner's stated wishes; no case of a missed item described | Friday becomes a passive screen; the widget set should shrink | after some weeks of daily use, the owner notes which widgets they used; period and threshold not set (Q03) | NexorPL | unknown | untested |
| A04 | Copilot CLI's `session-store.db` holds complete token counts. `[ASSUMPTION]` 2026-10-28 interview | medium | dashboard-tokens-usage imports Copilot from it; the launcher reads another location where tokens appear only after a session closes | Copilot numbers are incomplete | compare one day's totals from both locations | spec author | during the tokens spec | tested 2026-10-31 `[DATA]`, incomplete on the owner's home machine: `assistant_usage_events` covers 9 local days (2026-07-09 to 2026-08-08) where `session-state/*/events.jsonl` totals cover 48 days up to 2026-08-08; on 2026-08-08 both match to the token, on 7 other shared days the database holds less. Friday imports the database as specified and marks Copilot numbers incomplete; the owner decides the source. Not yet compared on the work machine. On 2026-11-01 `[INTERVIEW]` the owner said they mostly use Claude Code and rarely Copilot CLI, so the database stays the source and the gap is accepted. |

## Kill criteria

Not decided: the owner chose to revisit what would make them stop building or using Friday after some weeks of use (Q03). It does not block the first version, which is a personal tool.

## Hypotheses to test

None; no synthetic walkthroughs were run.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Must the first version run on Linux and macOS too, or on Windows only? | was blocking the spec's platform targets | owner | closed: all three, D20 |
| Q02 | Where do hand-written priority items and their order live: a `.md` file like Todos, or Friday's database? | no | owner | closed: `priorities.md`, D26 |
| Q03 | How will the owner judge, after some weeks, that Friday is worth keeping? | no | owner | closed for now: no criterion; revisit after some weeks of use (G22) |
| Q04 | Should Friday log a day's review minutes to each PR's Jira task in one action, and is that part of the first version? | was blocking the scope decision | owner | closed: yes, in Now, D21 |
| Q05 | On which machine does Friday run day to day: the work machine, where the ledger and the agent transcripts are, the home machine, or both? | no | owner | closed: work machine, D33 |

## Definition of Ready addendum (own)

Problems and Target group are supported for one user: the owner's own account and the ledger data. The problems behind the meetings, PR and priorities widgets are stated wishes, not observed failures (A03). The only observed workflow, per-PR review time logging, is in Now (D21). The owner signed on 2026-10-29 and confirmed the grilling decisions on 2026-10-30. A01 and A02 are high-importance and untested; the spec checks them before the meeting join and time logging are built. Not ready for: other users (D17).

## Collection plan

### Do Teams and Google Meet events in the secret iCal feed carry a join link?

- What decision or work needs it: joining a meeting from the list (A01), part of Now.
- Who can answer it: the owner.
- How: download the `.ics` from the secret address on the owner's machine; open one event with Google Meet and one with Teams; note which field holds the link, if any. Do not share the address or event contents.
- Owner and by when: NexorPL; before the meetings spec.
- Template: `.ai/specs/research/templates/data-request.md`

### Can a scoped Jira API token add a worklog through the REST API?

- What decision or work needs it: time logging on favorites and from the review ledger (A02, D25), part of Now.
- Who can answer it: the owner.
- How: create an API token scoped to `read:jira-work` and `write:jira-work` at id.atlassian.com (or note that the organization blocks it), then add one worklog with it through the REST API to a task the owner picks. Already known: the agent's worklogs of 2026-10-29 were native Jira worklogs written through the Atlassian MCP server or `acli`.
- Owner and by when: NexorPL; before the time-logging spec.
- Template: `.ai/specs/research/templates/data-request.md`
