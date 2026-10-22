import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SDK_SCOPE = ["@", "soksak", "/"].join("");
const IMPORT_OF_SDK = new RegExp(`(?:from\\s*|import\\(\\s*)["']${SDK_SCOPE}`);

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(?:mjs|js)$/.test(entry.name) ? [file] : [];
  });
}

test("no test file imports a plugin API or any other @soksak/ name", () => {
  for (const file of sources(testRoot)) {
    assert.doesNotMatch(readFileSync(file, "utf8"), IMPORT_OF_SDK, path.relative(testRoot, file));
  }
});
