// Builds the UI tree that the plugin tests load. build/test/ui is a copy of ui/ in which the plugin API import
// is replaced by the consumer-side fake of test/fixtures/plugin-api.mjs, so no test loads the plugin API package.
// ui/host.js is left out: it is the plugin-page entry that wires the plugin API page module, and no test loads it
// (its wiring is tested through injected page and expose objects).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "build", "test");
const outputUI = path.join(outputRoot, "ui");
const fakeFile = path.join(outputRoot, "fakes", "plugin-api.mjs");
const API = "@soksak/plugin-api";
const IMPORT_OF_API = new RegExp(`(from\\s*|import\\(\\s*)(["'])${API.replace("/", "\\/")}\\2`, "g");
const IMPORT_OF_SDK = /(?:from\s*|import\(\s*)["']@soksak\//;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(path.dirname(fakeFile), { recursive: true });
fs.copyFileSync(path.join(root, "test", "fixtures", "plugin-api.mjs"), fakeFile);
fs.cpSync(path.join(root, "ui"), outputUI, { recursive: true });
fs.rmSync(path.join(outputUI, "host.js"));

let count = 0;
for (const file of walk(outputUI).filter((name) => /\.(?:mjs|js)$/.test(name))) {
  count += 1;
  const source = fs.readFileSync(file, "utf8");
  const specifier = path.relative(path.dirname(file), fakeFile).split(path.sep).join("/");
  const relative = specifier.startsWith(".") ? specifier : "./" + specifier;
  const rewritten = source.replace(IMPORT_OF_API, (match, prefix, quote) => `${prefix}${quote}${relative}${quote}`);
  if (IMPORT_OF_SDK.test(rewritten)) {
    throw new Error("UI module imports a plugin API the test build does not fake: " + path.relative(root, file));
  }
  if (rewritten !== source) fs.writeFileSync(file, rewritten);
}
console.log("Built test UI tree: " + count + " modules, plugin API fake " + path.relative(root, fakeFile));
