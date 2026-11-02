import { test } from "node:test";
import assert from "node:assert/strict";
import { backoff, backsOff, rejectsToken, parseRetryAfter, httpError, networkError } from "../mods/friday/core/backoff.js";

const m = (n) => n * 60;

test("backoff doubles up to 30 minutes and honours Retry-After", () => {
  assert.equal(backoff(m(5)), m(10));
  assert.equal(backoff(m(5), m(10)), m(20));
  assert.equal(backoff(m(5), m(20)), m(30));
  assert.equal(backoff(m(5), m(30)), m(30));
  assert.equal(backoff(m(5), null, m(45)), m(45));
  assert.equal(backoff(m(5), null, m(3)), m(10));
  assert.equal(backoff(m(5), null, m(48 * 60)), m(24 * 60));
});

test("only 429 and 5xx back off; 401 and 403 reject the token", () => {
  for (const s of [429, 500, 503, 599]) assert.ok(backsOff(s), String(s));
  for (const s of [200, 400, 401, 403, 404, 600]) assert.ok(!backsOff(s), String(s));
  assert.ok(rejectsToken(401) && rejectsToken(403) && !rejectsToken(404));
});

test("Retry-After reads seconds and HTTP dates", () => {
  const now = Date.parse("2026-10-21T07:26:00Z");
  assert.equal(parseRetryAfter(" 120 ", now), 120);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT", now), 120);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:20:00 GMT", now), null, "in the past");
  for (const bad of ["", "soon", "-5", "2026-10-21T07:28:00Z", null, undefined]) {
    assert.equal(parseRetryAfter(bad, now), null, String(bad));
  }
});

test("error messages never carry a URL or a secret", () => {
  assert.equal(httpError("calendar", 429), "calendar: HTTP 429");
  assert.equal(networkError("calendar"), "calendar: request failed");
});
