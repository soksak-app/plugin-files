// Checks the import maps and the files of the view pages of plugin.json (each section page) against the packed file list of
// `npm pack --dry-run --json`. A page resolves its imports at its own origin, so each mapped core name must name a core target
// (sok://core/), and each relative import must be a file of the package.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE_ROOT = "sok://core/";
const manifest = JSON.parse(readFileSync(path.join(root, "plugin.json"), "utf8"));
const PAGES = manifest.sections.map((section) => section.composition.page);

const readText = (file) => readFileSync(path.join(root, file), "utf8");

function packedFiles() {
  const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" }));
  return new Set(pack.files.map((entry) => entry.path));
}

// The static imports, re-exports and dynamic imports of a module, with their specifiers.
function specifiersOf(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const found = [];
  for (const match of code.matchAll(/(?:import|export)\s+(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g)) found.push(match[1]);
  for (const match of code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) found.push(match[1]);
  return found;
}

// The plugin files that the page loads, and the bare names that the files import from the import map.
function closureOf(entry) {
  const files = new Set();
  const names = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of specifiersOf(readText(file))) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
      } else {
        names.add(specifier);
      }
    }
  }
  return { files: [...files], names: [...names] };
}

// The module that each view page loads, as a path of the package.
const moduleOf = (page) => {
  const match = readText(page).match(/<script type="module" src="([^"]+)"><\/script>/);
  assert.ok(match, `${page} has no module script`);
  return path.posix.normalize(path.posix.join(path.posix.dirname(page), match[1]));
};

test("every entry of the page import map names a core target", () => {
  for (const [name, target] of Object.entries(VIEW_IMPORTS)) {
    assert.ok(target.startsWith(CORE_ROOT), `${name} maps to ${target}, which is not a core target`);
  }
});

test("every bare name that the closure of each view page imports is mapped", () => {
  for (const page of PAGES) {
    const { names } = closureOf(moduleOf(page));
    for (const name of names) {
      const mapped = Object.keys(VIEW_IMPORTS).some((key) => (key.endsWith("/") ? name.startsWith(key) : name === key));
      assert.ok(mapped, `${name} is imported by the closure of ${page} but not mapped`);
    }
  }
});

test("every file of each view page closure exists and is in the package", () => {
  const packed = packedFiles();
  for (const page of PAGES) {
    for (const file of [page, ...closureOf(moduleOf(page)).files]) {
      assert.ok(existsSync(path.join(root, file)), `${file} does not exist`);
      assert.ok(packed.has(file), `${file} is not in the package`);
    }
  }
});

// The view import map of a page (docs/spec/plugins.md#view-surfaces): five entries, each naming a core target. A page imports
// no other name, so each view page of the files plugin imports the view bridge and the SDK entry, and no page API of a surface.
// The plugin API names are built from parts, so this file does not contain the SDK name.
const PLUGIN_API = "@soksak/" + "plugin-api";
const VIEW_IMPORTS = {
  "soksak": "sok://core/modules/soksak/dist/index.js",
  [PLUGIN_API]: `sok://core/modules/${PLUGIN_API}/index.js`,
  [`${PLUGIN_API}/view`]: `sok://core/modules/${PLUGIN_API}/view.js`,
  [`${PLUGIN_API}/screen-hash`]: `sok://core/modules/${PLUGIN_API}/screen-hash.js`,
  "@soksak/shared/": "sok://core/shared/",
};

test("each view page begins with its doctype and holds no import map, because the host inserts the view import map", () => {
  for (const page of PAGES) {
    const html = readText(page);
    assert.match(html, /^<!doctype html>/i, page);
    assert.doesNotMatch(html, /<script type="importmap">/, page);
  }
});

test("the closure of each view page imports only names of the view import map, and the bridge", () => {
  for (const page of PAGES) {
    const { names } = closureOf(moduleOf(page));
    for (const name of names) {
      const allowed = Object.keys(VIEW_IMPORTS).some((key) => (key.endsWith("/") ? name.startsWith(key) : name === key));
      assert.ok(allowed, `${name} is imported by the closure of ${page} but is not in the view import map`);
    }
    assert.ok(names.includes(`${PLUGIN_API}/view`), `${page} does not import the view bridge`);
  }
});
