// Checks the declarations of plugin.json and package.json, and the files that they name, with literal expectations.
// The pinned plugin API validates the same declarations in make check (scripts/check-manifest.mjs).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const manifest = JSON.parse(read("plugin.json"));
const pkg = JSON.parse(read("package.json"));
const STATUS_SCHEMA = { type: "object", properties: { elements: { type: "array" } } };

test("the plugin requires the current files sidecar process identity release", () => {
  assert.equal(manifest.dependencies["@soksak/sidecar-files"], ">=0.0.8");
  assert.equal(pkg.version, "0.0.7");
});

test("plugin.json declares the plugin host page and no host state", () => {
  assert.deepEqual(manifest.host, { page: "ui/host.html" });
  assert.ok(exists("ui/host.html"), "ui/host.html is missing");
  assert.ok(pkg.files.includes("ui/host.html"), "package.json files omit ui/host.html");
});

test("the host page loads the page entry module", () => {
  assert.match(read("ui/host.html"), /<script type="module" src="\.\/host\.js"><\/script>/);
  assert.ok(exists("ui/host.js"), "ui/host.js is missing");
});

test("every section names one declared status of the plugin and declares no module", () => {
  const statuses = manifest.exposes.status.map(({ name }) => name);
  const backed = [];
  for (const section of manifest.sections) {
    assert.deepEqual(Object.keys(section).filter((key) => key === "module" || key === "status").sort(), ["status"], section.id);
    assert.equal(typeof section.status, "string", section.id);
    assert.ok(statuses.includes(section.status), `${section.id} names ${section.status}, which the plugin does not expose`);
    backed.push(section.status);
  }
  assert.equal(new Set(backed).size, backed.length, "one status backs at most one section");
  assert.deepEqual(manifest.sections.map(({ id, status }) => [id, status]), [["files.tree", "files.tree"], ["files.bookmarks", "files.bookmarks"]]);
});

test("the declared sidebar statuses use the declared UI schema", () => {
  assert.deepEqual(manifest.exposes.status.map(({ name }) => name), ["files.tree", "files.bookmarks"]);
  for (const name of ["files.tree", "files.bookmarks"]) {
    assert.deepEqual(manifest.exposes.status.find((entry) => entry.name === name).schema, STATUS_SCHEMA, name);
  }
});

test("the tree section fills the sidebar and the bookmarks section does not", () => {
  assert.equal(manifest.sections.find(({ id }) => id === "files.tree").fill, true);
  assert.equal(manifest.sections.find(({ id }) => id === "files.bookmarks").fill, undefined);
});

test("the section modules of the earlier sidebar form are removed", () => {
  assert.equal(exists("ui/sections"), false, "ui/sections still exists");
});

test("the plugin declares no state module: the host page serves every status and command, and the catalog is published", () => {
  assert.equal(manifest.state, undefined, "plugin.json still declares a state module");
  assert.equal(exists("ui/state.js"), false, "ui/state.js still exists");
  assert.ok(exists("ui/host.js"), "ui/host.js is missing");
  assert.ok(pkg.files.includes("plugin.json"));
  assert.ok(pkg.files.includes("events.json"));
  assert.ok(pkg.files.includes("ui"));
});

test("the plugin ships no third-party library bundle", () => {
  assert.equal(exists("ui/vendor"), false, "ui/vendor still exists");
});

// The sidecar declaration of the files sidecar (fixture copy of its sidecar.json): the operations that a plugin host may call.
const sidecar = JSON.parse(read("test/fixtures/sidecar-files/sidecar.json"));
const TREE_OPERATIONS = ["snapshot", "expand", "collapse", "select"];

test("plugin.json lets the plugin host call the tree operations of the files sidecar, which the sidecar declares read-only", () => {
  assert.deepEqual(manifest.hostOperations, { "@soksak/sidecar-files": TREE_OPERATIONS });
  assert.ok(manifest.dependencies["@soksak/sidecar-files"] !== undefined, "the sidecar is not a dependency");
  for (const operation of manifest.hostOperations["@soksak/sidecar-files"]) {
    assert.ok(sidecar.hostReadOperations.includes(operation), `${operation} is not a host read operation of the sidecar`);
  }
});
