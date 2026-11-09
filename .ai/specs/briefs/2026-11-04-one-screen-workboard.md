# One screen for what matters: a built-in kanban, notes and movable priorities

- Date: 2026-11-04
- Category: feature
- Priority signal: medium — the owner wants to plan and track the day inside Friday instead of visiting several tools
- Risk signal: medium — phase 1 touches the owner's plain `.md` files (todos, priorities, notes), which Friday must never rewrite beyond the line it changes
- Routing: Next: om-spec-writing "One screen for what matters: kanban, notes, movable priorities (phase 1), PR actions and agent launch as later epics — brief: .ai/specs/briefs/2026-11-04-one-screen-workboard.md"

## Problem

The owner wants one clear, professional screen in Friday where everything that matters to them is visible, so they do not have to open several tools and look at the results there. Today they check outside Friday whether they are working on their priorities, they have nowhere to write notes next to that, and they cannot reorder priorities. They want a built-in kanban board (TODO, Priority, In progress, Done) where they throw items and watch them move. Animation is not important now; clarity and being easy to operate are.

## Agreed direction

Phase 1 (gets tasks): a kanban board with the columns TODO, Priority, In progress and Done, a place to write notes, and priorities that can be moved up and down, all on the mission control screen next to what already exists (meetings, pull requests, Jira, agents).

Later epics, written as epics without tasks until phase 1 has been used:

- **PR actions on Azure DevOps.** For each pull request: start an agent review of it, open it, and show how many review rounds were done on it. Needs a spike: where the round count comes from (the review ledger written by the owner's hook may hold it; not read yet).
- **Start an agent.** In a predefined folder, with a git worktree or without, or as a sub-agent of the main agent. Needs a spike: whether a herdr-app mod can open a terminal running an agent in a chosen folder (the kit has `terminal.open`; not tried).
- **Full calendar.** Titles and join links instead of "Busy". Blocked until the owner's Workspace admin enables a secret iCal address.

Rejected or deferred, and why:

- Animations and a visual showpiece: the owner said they are not key now. Park as an issue. If revisited, herdr-app's own guidance is to animate natively with `.loop`, `.transition` and `svg().spin`, never with a timer, because each redraw repaints the whole window (from the challenger review; verify in `~/.config/herdr-app/AGENTS.md`).
- Saving or restoring tab arrangement from the mod: `panes()` exposes no geometry, and decision D35 (rearranging comes from herdr-app, no layout code in the mod) is protected. A mod that manages layouts needs a new, owner-approved decision row that supersedes D35 before any spec. (That row is now D46, 2026-11-05.)
- Build nothing: lost because the owner already reaches for other tools daily and named what is missing.

## Resolved unknowns

| Question | Answer (from the conversation) |
|----------|--------------------------------|
| What is the goal? | One clear, professional screen showing what matters, with no visits to other tools; not animations. |
| What goes first? | Kanban, notes and priorities (phase 1); PR actions, agent launch and the full calendar follow as epics. |
| Kanban columns? | TODO, Priority, In progress, Done. |
| Priorities | Must be movable up and down. |
| Do the animations matter now? | No. |
| Which sources does the owner leave Friday for? | The calendar, checking progress on priorities, notes, Azure DevOps pull requests and agent review of them, and starting agents. |
| Does the Friday tab stay? | Yes: mod panes in a tab keep running across layout switches and keep the meeting alerts alive; a mod copy in a layout block starts fresh on every switch (its props carry `"block": true`). |

## Non-goals

- No animations or visual showpiece in phase 1.
- No layout management by the mod (D35 stays unless the owner approves a superseding decision). (See D46, 2026-11-05, for saving and restoring the Friday tab.)
- No tasks for the PR, agent-launch or calendar epics until phase 1 is used.
- Friday never rewrites content it did not change in the owner's `.md` files, and never deletes a line (existing rule for todos, priorities and notes).
- No new data source in phase 1: the board is built on the owner's own files.

## Open points for the spec

- How the four kanban columns map onto the existing plain `.md` files (todos, priorities, notes) without breaking the rule that Friday only changes the line it means to. This is the main design question.
- What "In progress" means for items that exist only as a Jira key.
- The owner has used the existing `layouts/friday.json` for hours at most; the spec should record what is still missing after a few workdays rather than assume it.

## Affected areas (if known)

- `layouts/friday.json` and `mods/friday/core/widgets.js` (the widget list and default splits).
- The existing lists and their file handling: `mods/friday/widgets/lists.js`, `mods/friday/core/lists.js`, `mods/friday/core/mdfile.js`. The spec should confirm these cover todos, priorities and notes; only the file names were checked here.
