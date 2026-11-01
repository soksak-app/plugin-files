// Checks the declarations of plugin.json and package.json, and the files that they name, with literal expectations.
// The application validates plugin.json at installation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const manifest = JSON.parse(read("plugin.json"));
const pkg = JSON.parse(read("package.json"));

test("the plugin requires the current files sidecar process identity release", () => {
  assert.equal(manifest.dependencies["@soksak/sidecar-files"], ">=0.0.9");
  assert.equal(pkg.version, "0.0.15");
});

test("plugin.json declares the two sections as views of their pages, with the tree filling the sidebar", () => {
  assert.deepEqual(manifest.sections, [
    { id: "files.tree", name: "파일 트리", composition: { kind: "view", page: "ui/tree.html" }, height: "fill" },
    { id: "files.bookmarks", name: "북마크", composition: { kind: "view", page: "ui/bookmarks.html" }, height: 160 },
  ]);
});

test("plugin.json declares no plugin host page and no host operations", () => {
  assert.equal(manifest.host, undefined, "plugin.json still declares a host page");
  assert.equal(manifest.hostOperations, undefined, "plugin.json still declares host operations");
  assert.equal(exists("ui/host.html"), false, "ui/host.html still exists");
  assert.equal(exists("ui/host.js"), false, "ui/host.js still exists");
  assert.equal(pkg.files.includes("ui/host.html"), false, "package.json files still name ui/host.html");
});

test("each section page loads its view module", () => {
  for (const [page, module] of [["ui/tree.html", "./tree.js"], ["ui/bookmarks.html", "./bookmarks.js"]]) {
    assert.match(read(page), new RegExp(`<script type="module" src="${module.replace(/\./g, "\\.")}"></script>`), page);
    assert.ok(exists(page.replace(/\.html$/, ".js")), `${page} has no module`);
  }
});

// The views expose their visible state: the statuses of the tree and the bookmarks, and the dom names of their buttons and items.
test("the plugin declares the statuses of the views and the dom names of their elements", () => {
  assert.deepEqual(manifest.exposes.status.map((entry) => entry.name), ["files.tree", "files.bookmarks"]);
  assert.deepEqual(manifest.exposes.dom.map((entry) => entry.name), [
    "files.tree.refresh",
    "files.tree.row",
    "files.bookmarks.add",
    "files.bookmarks.item",
    "files.bookmarks.remove",
  ]);
  assert.deepEqual(manifest.exposes.dom.filter((entry) => entry.many).map((entry) => entry.name), ["files.tree.row", "files.bookmarks.item", "files.bookmarks.remove"]);
});

test("the section modules of the earlier sidebar form are removed", () => {
  assert.equal(exists("ui/sections"), false, "ui/sections still exists");
});

test("the plugin declares no state module and publishes its catalog", () => {
  assert.equal(manifest.state, undefined, "plugin.json still declares a state module");
  assert.equal(exists("ui/state.js"), false, "ui/state.js still exists");
  assert.ok(pkg.files.includes("plugin.json"));
  assert.ok(pkg.files.includes("events.json"));
  assert.ok(pkg.files.includes("ui"));
});

// The plugin draws its tree section with @pierre/trees, so the release ships the bundle that scripts/build-vendor.mjs writes.
test("the vendored @pierre/trees bundle is the output of its build", () => {
  const check = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/build-vendor.mjs", import.meta.url)), "--check"], { encoding: "utf8" });
  assert.equal(check.status, 0, `scripts/build-vendor.mjs --check failed: ${check.stderr}`);
});
