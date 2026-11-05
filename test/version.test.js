import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION, CHECKED_AGAINST, REOPEN_COMMAND } from "../mods/friday/version.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("the mod's version is package.json's", () => {
  assert.equal(VERSION, pkg.version);
});

test("the README names the herdr-app version and the reopen command Settings shows", () => {
  assert.ok(readme.includes(`herdr-app ${CHECKED_AGAINST}`));
  assert.ok(readme.includes(REOPEN_COMMAND));
  assert.ok(REOPEN_COMMAND.includes("mod.open"), "a plain tab.new would give the default arrangement and replace the saved one");
});
