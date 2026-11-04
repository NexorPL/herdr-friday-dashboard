// What the buttons in Settings > Jira do, without herdr-app: the dialog passes in the file and
// network calls and `say(text, state)`. Every path ends in a message, and no message quotes the
// token (R12): they come from core/jira.js or are fixed text.
import { validateJira } from "./jira.js";

/** Test: GET /myself with the typed settings and the typed token, else the stored one. */
export async function testJiraSettings({ cfg, typed, readSecret, test, say }) {
  try {
    const bad = validateJira(cfg);
    if (bad) return say(bad, "error");
    const token = typed || (await readSecret());
    if (!token) return say("No token yet.", "error");
    const r = await test({ ...cfg, token });
    if (r.ok) say(r.name ? `OK, signed in as ${r.name}.` : "OK.", "ok");
    else say(r.message, "error");
  } catch {
    say("jira: the test failed", "error");
  }
}

/** Save token (or Remove, with `remove`): writes secrets.json, then says so and calls `saved()`. */
export async function saveToken({ typed, remove, saveSecret, saved, say }) {
  if (!remove && !typed) return say("Paste the token first.", "error");
  try {
    await saveSecret(remove ? "" : typed);
  } catch {
    return say("Could not save secrets.json. Try again.", "error");
  }
  say(remove ? "Token removed." : "Token saved (written to secrets.json).", "ok");
  saved();
}
