// The tree view against the declared wire contract of the files sidecar (test/fixtures/sidecar-files/tree-wire.json): each request
// body has the form that the contract declares, and each tree reply becomes the rows of the view. No test runs the sidecar.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { treeOf } from "../ui/tree-model.js";

const wire = JSON.parse(readFileSync(new URL("./fixtures/sidecar-files/tree-wire.json", import.meta.url), "utf8"));

test("each request of the contract names its operation and carries the generation and path of a tree operation", () => {
  assert.deepEqual(Object.keys(wire.requests).sort(), ["collapse", "expand", "select", "snapshot"]);
  assert.deepEqual(wire.requests.snapshot, { operation: "snapshot" });
  for (const operation of ["expand", "collapse", "select"]) {
    assert.equal(wire.requests[operation].operation, operation);
    assert.equal(typeof wire.requests[operation].generation, "number");
    assert.equal(typeof wire.requests[operation].path, "string");
  }
});

test("the snapshot reply becomes the rows of the view with the folder expansion and the git detail", () => {
  const { generation, rows, selected } = treeOf(wire.replies.snapshot.tree);
  assert.equal(generation, 1);
  assert.equal(selected, null);
  assert.deepEqual(rows.map((row) => [row.path, row.directory, row.expanded, row.detail]), [
    ["src", true, true, "deleted"],
    ["src/main.go", false, false, "modified"],
    ["src/old.go", false, false, "deleted"],
    ["readme.md", false, false, undefined],
  ]);
});

test("the select reply marks the selected row", () => {
  const { selected, rows } = treeOf(wire.replies.select.tree);
  assert.equal(selected, "src/main.go");
  assert.deepEqual(rows.filter((row) => row.selected).map((row) => row.path), ["src/main.go"]);
});

test("the error replies of the contract carry text and no tree", () => {
  for (const name of ["expandFailed", "staleGeneration"]) {
    assert.equal(typeof wire.replies[name].error, "string");
    assert.equal(wire.replies[name].tree, undefined);
  }
});

test("the change line of the contract carries no id and names a directory", () => {
  assert.equal(wire.change.id, undefined);
  assert.equal(typeof wire.change.changed, "string");
});
