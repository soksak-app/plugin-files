import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The DOM-free rules of the tree view, which the view page imports (core docs/spec/plugin-processes.md, Layer rules).
const sourcePaths = ["../ui/tree-model.js"];
const forbidden = ["document", "window", "innerHTML", "createElement", "querySelector", "appendChild"];

function assertDomFree(source) {
  const found = forbidden.filter((name) => new RegExp(`\\b${name}\\b`).test(source));
  assert.deepEqual(found, [], `DOM APIs found: ${found.join(", ")}`);
}

for (const path of sourcePaths) {
  test(`${path} contains no DOM APIs`, async () => {
    assertDomFree(await readFile(new URL(path, import.meta.url), "utf8"));
  });
}

test("the DOM-free assertion rejects an injected document element", async () => {
  const source = await readFile(new URL(sourcePaths[0], import.meta.url), "utf8");
  assert.throws(() => assertDomFree(`${source}\ndocument.createElement(\"div\");`), /DOM APIs found: document, createElement/);
});
