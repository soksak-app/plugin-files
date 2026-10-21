import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = ["ui/sections/tree.js", "ui/sections/bookmarks.js", "ui/sections/tree-horizontal.js"];
const forbidden = ["contextmenu", "rename", "drag", "input", "textarea", "contenteditable"];

function interactions(source) {
  return forbidden.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(source));
}

test("files sidebar sections do not require view interactions", async () => {
  const sources = await Promise.all(files.map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
  assert.deepEqual(sources.flatMap(interactions), []);
});

test("the view-contract check detects a forbidden interaction", () => {
  assert.deepEqual(interactions("element.addEventListener(\"contextmenu\", rename)").sort(), ["contextmenu", "rename"]);
});
