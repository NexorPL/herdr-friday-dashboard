# Friday for herdr-app

Friday is a work dashboard for [herdr-app](https://github.com/herdrdev/herdr-app), written as one JavaScript mod (`mods/friday`). A Friday tab holds several panes of the mod, each showing one widget (summary, review ledger, and more in later phases). herdr-app moves, resizes and splits the panes. Nothing runs when herdr-app is closed.

Checked against herdr-app 0.1.12. Scope and design: `.ai/specs/product-brief.md` and `.ai/specs/2026-11-02-friday-on-herdr-app.md`.

## Install

Link or copy the mod folder into herdr-app's home (`~/.config/herdr-app`, or `$HERDR_APP_HOME`):

```sh
# Windows (cmd), from the repository root
mklink /J "%USERPROFILE%\.config\herdr-app\mods\friday" mods\friday
# macOS and Linux
ln -s "$PWD/mods/friday" ~/.config/herdr-app/mods/friday
```

Check it loads:

```sh
herdr-app check mods/friday
```

## Open the Friday tab

```sh
herdr-app do tab.new --name Friday --mod friday --props '{"widget":"summary"}'
```

The first pane arranges the default panes when it is the only pane in its tab. After that, rearrange them with herdr-app. The tab is kept by herdr-core, so the command is needed once, and again only after you close the tab. Settings (the gear in a pane header) shows the same command.

### Bind a hotkey

`mod.open:friday` opens Friday's launcher, which selects the Friday tab (switching space if needed) or creates it when none exists. Bind it in `keys.json`, for example `"global": { "ctrl-alt-f": "mod.open:friday" }`. On Windows keyboards ctrl+alt is AltGr, so in some layouts the combination types a character instead of reaching herdr-app; pick another chord there. herdr-app's docs advise against ctrl+alt chords in general, so if the binding misbehaves, use another chord.

## Mission control layout

`layouts/friday.json` is a whole window in one screen: herdr-app's spaces and agents on the left, the tab bar and the active tab (terminals and agents) in the middle, and a resizable column of Friday on the right: summary, meetings, pull requests, and Jira, priorities and todos. It has no theme or font of its own, so your settings decide the look. It is an addition to the Friday tab, not a replacement.

```sh
# from the repository root
cp layouts/friday.json ~/.config/herdr-app/layouts/
herdr-app do layout.switch --name friday    # or ctrl-shift-l to cycle
herdr-app do layout.switch --name main      # back to the default layout
```

### Board layout

`layouts/friday-board.json` puts the board across the top of the same window. Below it are three columns (summary over meetings, pull requests over the review ledger, Jira over favorites) and notes, then the active tab, which you can resize. The tab bar stays across the top of the window, where herdr-app draws the window buttons and the drag strip. The sidebar, the status bar and the hidden panel are the ones of `friday.json`, and it has no theme or font of its own either.

```sh
cp layouts/friday-board.json ~/.config/herdr-app/layouts/
herdr-app do layout.switch --name friday-board    # or ctrl-shift-l to cycle through all layouts
```

A layout block starts fresh on a switch: the board's selection and a half-typed draft are lost, and the file is read again. Cards are in `board.md` and are not affected.

On the board, press a card and release it over another card to place it above that card, or over a column's header or free space to send it to the end of the column (the top in Done). A line shows where it will land. Leaving the board ends the drag and the card stays where it was. Shift+arrows move the selected card too.

Keep the Friday tab open anyway. Another layout starts its mods fresh, while mod panes in a tab stay alive, so the tab keeps the meeting alerts running whichever layout is shown.

## Data

Friday keeps its files in `${appHome()}/data/friday/` (by default `~/.config/herdr-app/data/friday/`). Settings and secrets are plain text there, protected only by your user account's file permissions.

## Develop

```sh
node --test              # pure logic in mods/friday/core
herdr-app check mods/friday
```

`mods/friday/core/` never imports `herdr`, so its tests run in Node. Fixtures are anonymized.

herdr-app reloads a mod when a file in `mods/<name>` changes, but not when the folder is a Windows junction; after an edit, close the Friday tab and open it again.

`node scripts/demo-home.mjs <empty folder>` seeds a sandbox app home with the fixture ledger, for screenshots that must not show your real spaces. It writes no secrets.

## License

MIT, see `LICENSE`.
