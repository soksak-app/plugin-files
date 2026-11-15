import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const SDK_SCOPE = ["@", "soksak", "/"].join("");
// The tests import only the plugin API of the SDK, the devDependency that package.json pins; a name of another @soksak/ package is refused.
const IMPORT_OF_OTHER_SDK = new RegExp(`(?:from\\s*|import\\(\\s*)["']${SDK_SCOPE}(?!plugin-api(?:["'/]))`);

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(?:mjs|js)$/.test(entry.name) ? [file] : [];
  });
}

test("no test file imports a @soksak/ name other than the plugin API", () => {
  for (const file of sources(testRoot)) {
    assert.doesNotMatch(readFileSync(file, "utf8"), IMPORT_OF_OTHER_SDK, path.relative(testRoot, file));
  }
});

// The SDK needle is built from parts, so this file does not contain it. The guard reports each line of test/ that contains it, except
// an import statement of the plugin API, which the tests use.
const SDK_NEEDLE = "@soksak/" + "plugin-api";
const PLUGIN_API_IMPORT = new RegExp(`^\\s*import\\b.*\\bfrom\\s+["']${SDK_NEEDLE}(?:/[\\w.-]+)?["'];?\\s*$`);

function everyFile(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? everyFile(file) : [file];
  });
}

test("no line of test/ contains the SDK needle outside an import of the plugin API", () => {
  const found = [];
  for (const file of everyFile(testRoot)) {
    readFileSync(file, "utf8").split("\n").forEach((line, index) => {
      if (line.includes(SDK_NEEDLE) && !PLUGIN_API_IMPORT.test(line)) found.push(`${path.relative(testRoot, file)}:${index + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
