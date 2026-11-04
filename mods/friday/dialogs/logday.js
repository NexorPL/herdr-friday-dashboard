// Log a ledger day to Jira (D27, R09): the day's rows with their checks, a selection, a progress
// line while writing, and a retry for the rows that failed. The rules are in core/worklogs.js.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, props, closeOverlay, shared } from "herdr";
import { LEDGER } from "../hub.js";
import { readWorklogRecords, saveWorklogRecord } from "../store.js";
import { jiraSession } from "../jira-session.js";
import { listWorklogs, postWorklog } from "../core/jira.js";
import { planDay, planText, loggedCount, logDay, summaryText, retrySelection } from "../core/worklogs.js";
import { dayStart, addDays } from "../core/meetings.js";
import { offsetNow } from "../net.js";
import { button, note, stateColor } from "../ui.js";

const LOGGABLE = (p) => p.status !== "no_key" && p.status !== "no_time";

export class LogDayDialog {
  init(cx) {
    this.day = (props() || {}).day ?? "";
    this.phase = "loading"; // loading, ready, logging, done
    this.plan = [];
    this.results = [];
    this.progress = null;
    this.error = null;
    this.session = null;
    this.records = [];
    cx.spawn(async (cx) => {
      try {
        await this.load(cx);
      } catch {
        this.error = "Could not read the ledger day.";
        this.phase = "ready";
      }
      cx.notify();
    });
  }

  async load(cx) {
    const rows = shared(LEDGER)?.data.days.find((d) => d.date === this.day)?.rows ?? [];
    this.session = await jiraSession(cx);
    this.records = await readWorklogRecords();
    const offsetMin = offsetNow();
    const after = dayStart(this.day, offsetMin);
    const before = dayStart(addDays(this.day, 1), offsetMin);
    const remoteByKey = {};
    for (const key of new Set(rows.filter((r) => r.task).map((r) => r.task.key))) {
      const s = this.session;
      const r = s && s.accountId ? await listWorklogs(s.deps, s.cfg, key, { after, before, accountId: s.accountId }) : null;
      remoteByKey[key] = r && r.ok ? r.worklogs : null;
    }
    this.plan = planDay(rows, { day: this.day, records: this.records, remoteByKey, offsetMin });
    if (!this.session) this.error = "Jira is not set up: open Settings.";
    this.phase = "ready";
  }

  toggle(i, cx) {
    const p = this.plan[i];
    if (this.phase === "logging" || !LOGGABLE(p)) return;
    p.selected = !p.selected;
    cx.notify();
  }

  start(cx) {
    const s = this.session;
    if (this.phase !== "ready" || !s || !this.plan.some((p) => p.selected)) return;
    this.phase = "logging";
    this.progress = [0, this.plan.filter((p) => p.selected).length];
    cx.notify();
    cx.spawn(async (cx) => {
      const offsetMin = offsetNow();
      const after = dayStart(this.day, offsetMin);
      const before = dayStart(addDays(this.day, 1), offsetMin);
      try {
        this.results = await logDay(this.plan, {
          day: this.day,
          records: this.records,
          offsetMin,
          now: Date.now(),
          list: (key) => listWorklogs(s.deps, s.cfg, key, { after, before, accountId: s.accountId }),
          post: (key, body) => postWorklog(s.deps, s.cfg, key, body),
          saveRecord: async (r) => { await saveWorklogRecord(r); this.records.push(r); },
          progress: (done, total) => { this.progress = [done, total]; cx.notify(); },
        });
      } catch {
        this.error = "Logging stopped unexpectedly. Reopen this dialog to see what was logged.";
      }
      this.phase = "done";
      cx.notify();
    });
  }

  retry(cx) {
    this.plan = retrySelection(this.plan, this.results);
    this.results = [];
    this.phase = "ready";
    this.start(cx);
  }

  render() {
    const t = theme();
    const overlay = (props() || {}).overlay;
    const { logged, of } = loggedCount(this.plan);
    const selected = this.plan.filter((p) => p.selected).length;
    const retryable = this.results.some((r) => ["failed", "unknown", "not_tried"].includes(r.result));
    const resultOf = (p) => this.results.find((r) => r.pr === p.pr && r.key === p.key);
    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(12.5)
      .child(h_flex().px(18).pt(16).pb(8).items_center()
        .child(div().flex_1().text_size(15).font_semibold().child(`Log ${this.day} to Jira`))
        .child(div().text_size(11).text_color(t.dim).child(this.phase === "loading" ? "" : `${logged} of ${of} logged`)))
      .child(v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(18).pb(8).gap(4)
        .when(this.phase === "loading", (el) => el.child(note(t, "Checking Jira for worklogs already logged…")))
        .when(Boolean(this.error), (el) => el.child(note(t, this.error, "error")))
        .when(this.phase !== "loading" && this.plan.length === 0, (el) => el.child(note(t, "No ledger rows for this day.")))
        .children(this.plan.map((p, i) => {
          const r = resultOf(p);
          return v_flex().id(`ld-${i}`).gap(1).py(2).px(4).rounded(4)
            .when(LOGGABLE(p) && this.phase !== "logging", (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.toggle(i, cx)))
            .child(div().truncate().text_size(12).text_color(LOGGABLE(p) ? t.foreground : t.dim).child(planText(p)))
            .when(Boolean(r), (el) => el.child(div().truncate().text_size(11).text_color(stateColor(t, r.result === "logged" ? "ok" : r.result === "skipped" ? "stale" : "error")).child(r.result === "logged" ? "logged" : `${r.result}${r.message ? `: ${r.message}` : ""}`)));
        })))
      .child(v_flex().px(18).pb(6).gap(2)
        .when(this.phase === "logging", (el) => el.child(note(t, `Logging ${this.progress[0]} of ${this.progress[1]}…`)))
        .when(this.phase === "done", (el) => el.child(note(t, summaryText(this.results), retryable ? "error" : "ok"))))
      .child(h_flex().px(18).py(12).gap(8).justify_end().border_t(1).border_color(t.border)
        .when(this.phase === "done" && retryable, (el) => el.child(button(t, "ld-retry", "Retry failed (R)", (_e, cx) => this.retry(cx))))
        .when(this.phase === "ready" && this.plan.length > 0, (el) => el.child(button(t, "ld-log", `Log selected (${selected})`, (_e, cx) => this.start(cx), true)))
        .child(button(t, "ld-close", this.phase === "done" ? "Close" : "Cancel", () => closeOverlay(overlay))));
  }
}
