import { test } from "node:test";
import assert from "node:assert/strict";
import { mix } from "../mods/friday/core/color.js";

test("mix tints one color with another", () => {
  assert.equal(mix("#000000", "#ffffff", 0), "#000000");
  assert.equal(mix("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mix("#102030", "#ff0000", 0.5), "#881018");
  assert.equal(mix("#10203040", "#ff0000", 0.5), "#88101840", "the alpha of the first color stays");
  assert.equal(mix("#102030", "#ff000040", 0.5), "#881018", "the alpha of the second is not used");
});

test("mix leaves a color it cannot read as it is", () => {
  assert.equal(mix("rgb(1,2,3)", "#ff0000", 0.5), "rgb(1,2,3)");
  assert.equal(mix("#102030", undefined, 0.5), "#102030");
  assert.equal(mix(undefined, "#ff0000", 0.5), undefined);
});
