import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourcePath = new URL("../ui/declared-data.js", import.meta.url);
const forbidden = ["document", "window", "innerHTML", "createElement", "querySelector", "appendChild"];

function assertDomFree(source) {
  const found = forbidden.filter((name) => new RegExp(`\\b${name}\\b`).test(source));
  assert.deepEqual(found, [], `DOM APIs found: ${found.join(", ")}`);
}

test("the declared files data module contains no DOM APIs", async () => {
  assertDomFree(await readFile(sourcePath, "utf8"));
});

test("the DOM-free assertion rejects an injected document element", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.throws(() => assertDomFree(`${source}\ndocument.createElement(\"div\");`), /DOM APIs found: document, createElement/);
});
