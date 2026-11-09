# Code review

`om-code-review` applies these rules on top of its built-in checklist. Rule ids (`R`, `D`, `N`) refer to `.ai/specs/product-brief.md`.

## Priorities

1. **Correctness of the owner's data.** Worklogs written to Jira, the `.md` lists, and the review minutes. A change that can double-log time, lose a line, or miscount minutes is a blocker.
2. **Secrets.** The Jira token, the Azure DevOps PAT and the iCal address.
3. **Contracts.** The surfaces in `BACKWARD_COMPATIBILITY.md`.
4. **Everything else.** Readability, size, naming.

## Repository checks

**Secrets (R12)**

- A secret is read only from `secrets.json` and only by the code that sends it.
- It never reaches `shared()`, `localStorage`, `console.log`, an error message, a toast, a fixture or a screenshot.
- Error text is built from the source name and the status code, never from a URL, header or response body. The iCal URL is itself a secret.

**Outward writes (D10, D25, N03)**

- Jira gets worklogs and their comments only, and each write follows a confirmation step.
- Azure DevOps gets nothing.
- R09's skip logic runs before every ledger-day write, including after a timeout.

**The owner's files (R10)**

- Edits go through `core/mdfile.js` and `writeTextFile` with the expected snapshot.
- No line is deleted, and no line Friday did not change is rewritten.
- CRLF, a BOM and a missing final newline survive a write.

**herdr-app runtime**

- No `setTimeout` or `setInterval`; a `cx` is never stored and used later; no `Intl`.
- Work whose cost grows with its input (parsing a feed, a large file) yields with `await cx.sleep(0)` between slices: herdr-app ends a job that runs about 0.5 s without yielding, and then no `catch` or `finally` runs.
- Timers poll only as often as the data changes.
- Animations use `.frames`, `.spin`, `.loop` or `.transition`, never a timer that calls `cx.notify()`.
- `herdr-app check mods/friday` passes, and the PR says so.

**`core/` purity**

- Nothing under `mods/friday/core/` imports `herdr`, `gpui-kit` or any herdr-app module.
- New logic there has a `node --test` test.
- Logic in a widget that could live in `core/` is a finding.

**Fixtures and screenshots (D32)**

- Fixtures are anonymized: no real Jira keys, PR titles, meeting titles, names, links or organization names.
- Screenshots come from the sandbox app home seeded by `scripts/demo-home`.

**Opening links**

- Only `https` links go to the OS opener, through `core/links.js`.
- Calendar and issue text reaches `exec` only as that single argument.

**Polling**

- A source is fetched once for all panes.
- Alerts fire at most once per occurrence and offset (R11); one more than 60 s late is dropped.

## Severity

- **Blocker:** a secret leak, an unconfirmed or duplicated Jira write, a lost or rewritten `.md` line, a broken protected surface without its required path, or a failing gate.
- **Major:** a missing test for new `core/` logic, a herdr-app runtime rule broken, or a source failure that breaks a pane instead of showing its error state.
- **Minor:** naming, duplication, readability.

Blockers and majors set `changes-requested`; minors can be left to a follow-up.
