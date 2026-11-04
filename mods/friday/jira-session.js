// What a dialog needs to talk to Jira: the fetch helpers, the settings and the stored token, read
// for one action and dropped (R12). `cloudId` and `accountId` come from the last poll in shared();
// when that poll is missing or belongs to other settings, they are asked from Jira (/myself).
import { shared } from "herdr";
import { loadSettings, readSecret } from "./store.js";
import { JIRA, sourceKey } from "./hub.js";
import { jiraDeps } from "./net.js";
import { testMyself } from "./core/jira.js";

/** { deps, cfg: { site, email, kind, token, cloudId }, accountId } or null when Jira is not set up. */
export async function jiraSession(cx) {
  const settings = await loadSettings();
  const j = settings.values.jira;
  const token = await readSecret("jira_token");
  if (!token || !j.site || !j.email) return null;
  const shown = shared(JIRA);
  const data = shown && shown.for === sourceKey("jira", settings.values) ? shown.data ?? {} : {};
  const deps = jiraDeps(cx);
  const cfg = { site: j.site, email: j.email, kind: j.token_kind, token, cloudId: data.cloud_id ?? null };
  let accountId = data.account_id ?? null;
  if (!accountId) {
    const me = await testMyself(deps, cfg).catch(() => null);
    if (me && me.ok && me.accountId) {
      accountId = me.accountId;
      cfg.cloudId = cfg.cloudId ?? me.cloudId ?? null;
    }
  }
  return { deps, cfg, accountId };
}
