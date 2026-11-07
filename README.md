# Friday for herdr-app

Friday is a work dashboard for [herdr-app](https://github.com/herdrdev/herdr-app), written as one JavaScript mod (`mods/friday`). A Friday tab holds several panes of the mod, each showing one widget: summary, meetings, Jira issues and favorites, Azure DevOps pull requests, the review ledger, priorities, todos, notes and a board. herdr-app moves, resizes and splits the panes. Nothing runs when herdr-app is closed.

Checked against herdr-app 0.1.12.

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
herdr-app do mod.open --name friday
```

This selects the Friday tab, or creates it when there is none: with your saved arrangement (see below), or the first time with the default panes. After that, rearrange them with herdr-app. The tab is kept by herdr-core, so the command is needed once, and again only after you close the tab. Settings (the gear in a pane header) shows the same command.

### Bind a hotkey

`mod.open:friday` opens Friday's launcher, which selects the Friday tab (switching space if needed) or creates it when none exists, as you last left it (see below). Bind it in `keys.json`, for example `"global": { "ctrl-alt-f": "mod.open:friday" }`. On Windows keyboards ctrl+alt is AltGr, so in some layouts the combination types a character instead of reaching herdr-app; pick another chord there. herdr-app's docs advise against ctrl+alt chords in general, so if the binding misbehaves, use another chord.

### Your arrangement is remembered

On Windows, the panes of a Friday tab check about every 10 seconds how the tab is arranged and save its widgets, splits and sizes in `arrangement.json` in the data folder, and nothing else. Closing the tab, or herdr dying, keeps that file. When the launcher finds no Friday tab, it builds the new one from the file. With no file or a bad one you get the default arrangement. On macOS and Linux nothing is saved, and the default arrangement stays.

Limits:

- A change in the last 15 seconds or so before closing may not be saved (the 10-second check, plus up to 5 seconds until herdr-core has written it down). It can take longer right after you close the pane that was doing the checking, until another pane takes over.
- A rebuild that fails leaves a partial tab and keeps the file: nothing is saved for an hour, so you can close the tab and press the key again. Changes you make in that hour are not saved either.
- A terminal in the Friday tab does not come back.
- With several tabs holding Friday panes, the one with the most panes is saved, and the first of those on a tie.
- The arrangement comes from an internal file of herdr-core, which Friday only reads. An update can change that file, and then you get the default arrangement back.

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

The notes widget has an input that is always there: type a note and press Enter to add it with a timestamp. A failed write keeps the text and shows the message. While the input has the keyboard, typed letters go to it and not to the widget keys; `a` or `n` moves the keyboard to the input, and Esc moves it back. A layout block that restarts loses a typed draft.

### Panel layout

`layouts/friday-panel.json` is herdr-app's main layout with a `Friday ▾` button before the tabs. The terminal keeps the whole width until you check a widget in the button's menu; the widget then opens in a panel on the right, which you can resize. Check more and they stack one under the other, in the menu's order; uncheck the last one and the panel closes. The arrows on a checked widget move it past its checked neighbour, and the order is kept in your copy of the layout, so copying the file again resets it. The menu stays open until you click beside it or press Esc. A widget stays as it was while it is unchecked. The chevron on a widget's header folds it to that header, and the others take the room; it expands to its earlier size. Folding needs the panel's blocks to have `"min": 30` in your copy of the layout. Files and Changes work as in the main layout and can be open next to it.

```sh
cp layouts/friday-panel.json ~/.config/herdr-app/layouts/
herdr-app do layout.switch --name friday-panel    # or pick it in Settings
```

Friday's layouts draw the pane header themselves, so a pane in a Friday tab has one row with its widget's title, and a terminal's header looks as in the main layout. That needs the layout's `header` to be `{ "mod": "friday", "props": { "paneHead": true } }` in your copy too; copying the file gives you that but resets the order, so you can also change that one field. Panes already open keep their old code until herdr-app restarts. Friday finds a pane's widget in herdr-core's document, so a new pane may say `friday` for a few seconds, and if the document cannot be used the widgets keep their own headers under that row.

The button stands before the tabs because herdr-app's tab bar is read-only and draws the window buttons at its right edge. On macOS with the sidebar hidden, the window buttons cover it.

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
