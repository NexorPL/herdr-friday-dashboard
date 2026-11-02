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
