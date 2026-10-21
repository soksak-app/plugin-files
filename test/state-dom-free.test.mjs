import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourcePath = new URL("../ui/state.js", import.meta.url);
const forbidden = ["document", "window", "innerHTML", "createElement", "querySelector", "appendChild"];

function violations(source) {
  return forbidden.filter((name) => new RegExp(`\\b${name}\\b`).test(source));
}

test("the files state module does not use DOM APIs", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.deepEqual(violations(source), []);
});

test("the DOM-free check rejects a module that creates a document element", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.deepEqual(violations(`${source}\ndocument.createElement(\"div\");`), ["document", "createElement"]);
});
