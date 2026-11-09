// Jira favorites (D10, D26): the keys of favorites.md with their issue. Enter logs time on the
// cursor's favorite (R07); `o` opens the issue, `a` adds a key, `e` opens the file. A key Jira
// cannot find is marked, and time logging is off for it.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { favoriteRows, favoriteKeys } from "../core/favorites.js";
import { dataPath, FAVORITES_FILE, moveInFavorites, readDataText } from "../store.js";
import { openLink, openPath } from "../open.js";
import { button, note, rowAction, tip } from "../ui.js";

/** The rows to draw now, for the view and its keys alike. */
export function favoriteList(v) {
  const j = v.hub.jira();
  return j ? favoriteRows(j.data.favorites ?? [], j.data.issues, j.data.missing) : [];
}

export const favoritesFile = () => dataPath(FAVORITES_FILE).replaceAll("\\", "/");

/** Enter: the log-time dialog, unless the row cannot take a worklog. */
export function logRow(v, row) {
  if (!row) return;
  if (row.missing || !row.loaded) {
    v.message = row.missing ? "not found in Jira: time logging is off" : "still loading";
    return;
  }
  v.message = null;
  v.openLogTime(row);
}

/** Shift+Up or Shift+Down: moves the cursor's favorite; one write at a time, the cursor follows the key. */
export function moveFavoriteRow(v, rows, dir, cx) {
  const row = rows[v.cursor];
  const edge = dir === "up" ? v.cursor <= 0 : v.cursor >= rows.length - 1;
  if (!row || edge || v.busy) return;
  v.busy = true;
  cx.spawn(async (cx) => {
    try {
      const r = await moveInFavorites(row.key, dir).catch(() => ({ ok: false, message: "could not write the file" }));
      if (!r.ok) v.message = r.message;
      else {
        const text = await readDataText(FAVORITES_FILE);
        if (text !== null) { // a failed read keeps the rows as they are until the next poll
          const keys = favoriteKeys(text);
          v.hub.setFavorites(keys);
          if (keys.includes(row.key)) v.cursor = keys.indexOf(row.key);
        }
      }
    } finally {
      v.busy = false;
      cx.notify();
    }
  });
}

export function renderFavorites(v) {
  const t = theme();
  const state = v.hub.state("jira");
  const status = v.hub.status().jira;
  if (state === "not_set_up") {
    return v_flex().size_full().p(12).gap(8)
      .child(note(t, "Favorites need your Jira site, e-mail and an API token."))
      .child(h_flex().child(button(t, "fav-settings", "Set up Jira", () => v.openSettings("jira"), true)));
  }
  const j = v.hub.jira();
  if (!j) {
    return v_flex().size_full().p(12).gap(8)
      .child(state === "error" ? note(t, status?.error ?? "error", "error") : note(t, "Reading Jira…"))
      .when(state === "error", (el) => el.child(h_flex().child(button(t, "fav-settings", "Open Settings", () => v.openSettings("jira")))));
  }
  const rows = favoriteList(v);
  return v_flex().id("fav-list").size_full().overflow_y_scrollbar().p(10).gap(4)
    .on_mouse_down("left", () => { if (v.handle) v.handle.focus(); }) // a press anywhere in the widget gives it the keys
    .when(state === "error", (el) => el.child(note(t, `${status?.error} (showing the last read)`, "error")))
    .when(Boolean(v.message), (el) => el.child(note(t, v.message, "stale")))
    .child(h_flex().gap(8)
      .child(button(t, "fav-add", "Add favorite (a)", () => v.openAddFavorite()))
      .child(button(t, "fav-edit", "Edit file (e)", () => openPath(favoritesFile())))
      .child(button(t, "fav-up", "▲ Up", (_e, cx) => moveFavoriteRow(v, rows, "up", cx)))
      .child(button(t, "fav-down", "▼ Down", (_e, cx) => moveFavoriteRow(v, rows, "down", cx))))
    .when(rows.length === 0, (el) => el.child(note(t, "No favorites yet. Add a Jira key.")))
    .children(rows.map((r, i) => h_flex().id(`fav-${i}`).gap(8).px(4).h(24).items_center().rounded(4).cursor_pointer()
      .when(i === v.cursor, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((e, cx) => { v.cursor = i; if (v.handle) v.handle.focus(); if (e.click_count >= 2) logRow(v, r); cx.notify(); }) // a click selects; a double-click or Enter opens the time log
      .child(rowAction(t, `fav-open-${i}`, "↗", "Open in Jira", r.url ? () => openLink(r.url) : null))
      .child(rowAction(t, `fav-log-${i}`, "✎", "Log time (Enter)", (_e, cx) => { v.cursor = i; logRow(v, r); cx.notify(); }))
      .child(div().w(84).flex_none().truncate().text_size(12).text_color(r.missing ? t.dim : t.accent).child(r.key))
      .child(tip(div().flex_1().truncate().text_size(12.5).text_color(r.missing ? t.dim : t.foreground).child(r.missing ? "not found" : r.summary), r.missing ? "" : r.summary))
      .child(div().w(84).flex_none().truncate().text_size(11).text_color(t.dim).child(r.status))
      .child(div().w(64).flex_none().truncate().text_size(11).text_color(t.muted).child(r.priority))));
}
