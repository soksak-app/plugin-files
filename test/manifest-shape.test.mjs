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

test("the state module is published with the manifest and the events catalog", () => {
  assert.ok(exists(manifest.state.module), manifest.state.module);
  assert.ok(pkg.files.includes("plugin.json"));
  assert.ok(pkg.files.includes("events.json"));
  assert.ok(pkg.files.includes("ui"));
});

test("the plugin ships no third-party library bundle", () => {
  assert.equal(exists("ui/vendor"), false, "ui/vendor still exists");
});
