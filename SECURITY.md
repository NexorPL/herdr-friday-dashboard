# Security policy

Friday handles three secrets: a Jira API token, an Azure DevOps PAT and a secret iCal address. They live only in `secrets.json` in the data folder and never leave the machine except in the request that needs them.

## Reporting a vulnerability

Please report privately through GitHub: **Security** tab, **Report a vulnerability** (private vulnerability reporting). Do not open a public issue.

Include what you found, how to reproduce it, and the version of Friday and herdr-app. This is a one-owner project, so expect a reply in days, not hours.

## In scope

- A secret reaching a log, an error message, a toast, `shared()`, `localStorage` or a fixture.
- A write that Friday should not make: anything to Azure DevOps, or a Jira write other than a confirmed worklog and its comment.
- A change that loses or rewrites a line of the owner's `.md` files.

## Out of scope

- Problems in herdr-app itself: report them to the herdr-app project.
- Anything that needs access to the machine's data folder already.

## Supported versions

Only the latest commit on `main`.
