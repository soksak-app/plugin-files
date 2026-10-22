// Checks the import map of ui/host.html and the files that the page imports against the packed file list of
// `npm pack --dry-run --json`. A page resolves its imports at its own origin, so each mapped core name must name a
// core target (sok://core/), and each relative import must be a file of the package.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE_ROOT = "sok://core/";
const HOST_PAGE = "ui/host.html";

const readText = (file) => readFileSync(path.join(root, file), "utf8");

function importMapOf(html) {
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(match, `${HOST_PAGE} has no import map`);
  return JSON.parse(match[1]).imports;
}

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

const hostScript = () => {
  const match = readText(HOST_PAGE).match(/<script type="module" src="([^"]+)"><\/script>/);
  assert.ok(match, `${HOST_PAGE} has no module script`);
  return path.posix.normalize(path.posix.join("ui", match[1]));
};

test("every entry of the page import map names a core target", () => {
  for (const [name, target] of Object.entries(importMapOf(readText(HOST_PAGE)))) {
    assert.ok(target.startsWith(CORE_ROOT), `${name} maps to ${target}, which is not a core target`);
  }
});

test("every bare name that the page closure imports is mapped", () => {
  const imports = importMapOf(readText(HOST_PAGE));
  const { names } = closureOf(hostScript());
  for (const name of names) {
    const mapped = Object.keys(imports).some((key) => (key.endsWith("/") ? name.startsWith(key) : name === key));
    assert.ok(mapped, `${name} is imported by the page closure but not mapped`);
  }
});

test("every file of the page closure exists and is in the package", () => {
  const packed = packedFiles();
  for (const file of [HOST_PAGE, ...closureOf(hostScript()).files]) {
    assert.ok(existsSync(path.join(root, file)), `${file} does not exist`);
    assert.ok(packed.has(file), `${file} is not in the package`);
  }
});
