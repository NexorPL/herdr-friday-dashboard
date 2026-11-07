# Contributing

Friday is built for its owner first, so scope stays small. Issues and pull requests are welcome, but the owner decides what fits.

Open an issue before a large change. Small fixes can go straight to a pull request.

## Setup

Friday is a mod for [herdr-app](https://github.com/herdrdev/herdr-app). See the README for linking `mods/friday` into herdr-app's home.

## Before you push

```sh
node --test
```

For a change under `mods/friday`, also run `herdr-app check mods/friday` on a machine with herdr-app. CI cannot run it.

## Rules that matter

- `mods/friday/core/` is pure logic: it never imports `herdr`, and every rule there has a `node --test` test.
- Fixtures are anonymized: no company keys, links or names.
- Secrets stay in `secrets.json`. They never appear in logs, errors, toasts, fixtures or screenshots.
- The owner's `.md` files are edited only through `core/mdfile.js`: no line deleted, no unchanged line rewritten.
- Friday writes to Jira only worklogs and their comments, each confirmed first. It writes nothing to Azure DevOps.
- A UI change needs a look in the live herdr-app window, because tests cannot see layout.

More detail: `AGENTS.md`, `CODE_REVIEW.md` and `BACKWARD_COMPATIBILITY.md`.

## Pull requests

Describe what changed and why, and keep it to one concern. Screenshots must come from a sandbox app home seeded by `scripts/demo-home.mjs`, never from a real one. The owner reviews and merges.

By contributing you agree your work is released under the MIT license.
