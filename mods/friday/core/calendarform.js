// What the address buttons in Settings > Calendar do, without herdr-app: the dialog passes in the
// file and network calls and `say(text, state)`. Every path ends in a message, and no message
// quotes the address (R12).
import { validateIcalUrl } from "./calendar.js";
import { rejectsToken } from "./backoff.js";

/** Test: fetches the feed with the typed address, else the stored one. */
export async function testAddress({ typed, readSecret, fetchFeed, say }) {
  try {
    const url = typed || (await readSecret());
    if (!url) return say("No address yet.", "error");
    const bad = validateIcalUrl(url);
    if (bad) return say(bad, "error");
    const r = await fetchFeed(url);
    if (r.ok) say(`OK, ${r.value.meetings.length} meetings today and tomorrow.`, "ok");
    else say(rejectsToken(r.status) ? "calendar: address rejected" : r.message, "error");
  } catch {
    say("calendar: the test failed", "error");
  }
}

/** Save address (or Remove, with `remove`): writes secrets.json, then says so and calls `saved()`. */
export async function saveAddress({ typed, remove, saveSecret, saved, say }) {
  if (!remove && !typed) return say("Paste the address first.", "error");
  const bad = remove ? null : validateIcalUrl(typed);
  if (bad) return say(bad, "error");
  try {
    await saveSecret(remove ? "" : typed);
  } catch {
    return say("Could not save secrets.json. Try again.", "error");
  }
  say(remove ? "Address removed." : "Address saved (written to secrets.json).", "ok");
  saved();
}
