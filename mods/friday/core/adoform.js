// What the buttons in Settings > Azure DevOps do, without herdr-app: the dialog passes in the file
// and network calls and `say(text, state)`. Every path ends in a message, and no message quotes the
// PAT (R12): they come from core/ado.js or are fixed text.
import { validateAdo, groupRepos } from "./ado.js";

/**
 * Test: lists the organization's repositories with the typed PAT, else the stored one. On success
 * `loaded(groups)` gets the project-then-repo picker's data ([{ project, repos: [{ id, name }] }]).
 */
export async function testAdoSettings({ cfg, typed, readSecret, test, say, loaded }) {
  try {
    const bad = validateAdo(cfg);
    if (bad) return say(bad, "error");
    const pat = typed || (await readSecret());
    if (!pat) return say("No PAT yet.", "error");
    const r = await test({ ...cfg, pat });
    if (!r.ok) return say(r.message, "error");
    const groups = groupRepos(r.repos);
    loaded(groups);
    say(`OK, ${r.repos.length} ${r.repos.length === 1 ? "repository" : "repositories"} in ${groups.length} ${groups.length === 1 ? "project" : "projects"}.`, "ok");
  } catch {
    say("ado: the test failed", "error");
  }
}

/** Save PAT (or Remove, with `remove`): writes secrets.json, then says so and calls `saved()`. */
export async function savePat({ typed, remove, saveSecret, saved, say }) {
  if (!remove && !typed) return say("Paste the PAT first.", "error");
  try {
    await saveSecret(remove ? "" : typed);
  } catch {
    return say("Could not save secrets.json. Try again.", "error");
  }
  say(remove ? "PAT removed." : "PAT saved (written to secrets.json).", "ok");
  saved();
}
