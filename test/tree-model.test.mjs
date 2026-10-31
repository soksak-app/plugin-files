// The DOM-free rules of the file tree view: the rows of a sidecar tree reply, the paths of the tree library, the batch from one
// path list to the next, the expansion requests, and the file that a double click opens.
import assert from "node:assert/strict";
import test from "node:test";
import { expansionRequests, openablePath, PLACEHOLDER, pathDiff, treeOf, treePaths } from "../ui/tree-model.js";

const entry = (fields) => ({ expanded: false, selected: false, ...fields });

test("a tree reply becomes its rows with the directory expansion and the git detail", () => {
  const tree = treeOf({
    generation: 2,
    selected: "src/main.go",
    entries: [
      entry({ path: "src", name: "src", directory: true, depth: 0, expanded: true }),
      entry({ path: "src/main.go", name: "main.go", directory: false, depth: 1, selected: true, detail: "modified" }),
    ],
  });
  assert.equal(tree.generation, 2);
  assert.equal(tree.selected, "src/main.go");
  assert.deepEqual(tree.rows.map((row) => [row.path, row.directory, row.expanded, row.selected, row.detail]), [
    ["src", true, true, false, undefined],
    ["src/main.go", false, false, true, "modified"],
  ]);
});

test("a tree reply with a row that has no selected flag is refused", () => {
  assert.throws(() => treeOf({ generation: 1, selected: null, entries: [{ path: "a", name: "a", directory: false, depth: 0 }] }),
    /invalid tree row/);
});

test("a tree reply with a generation below one is refused", () => {
  assert.throws(() => treeOf({ generation: 0, selected: null, entries: [] }), /invalid tree snapshot/);
});

test("a directory is listed by its own path and gets a placeholder child only when the listing has no child", () => {
  const rows = treeOf({
    generation: 1,
    selected: null,
    entries: [
      entry({ path: "src", name: "src", directory: true, depth: 0, expanded: true }),
      entry({ path: "src/main.go", name: "main.go", directory: false, depth: 1 }),
      entry({ path: "empty", name: "empty", directory: true, depth: 0, expanded: false }),
    ],
  }).rows;
  assert.deepEqual(treePaths(rows), ["src/", "src/main.go", "empty/", `empty/${PLACEHOLDER}`]);
});

test("pathDiff adds first and removes a removed directory with its subtree once", () => {
  assert.deepEqual(pathDiff(["a/", "a/x", "b"], ["a/", "a/y", "c"]), [
    { type: "add", path: "a/y" },
    { type: "add", path: "c" },
    { type: "remove", path: "a/x" },
    { type: "remove", path: "b" },
  ]);
  assert.deepEqual(pathDiff(["d/", "d/x", "d/y"], []), [{ type: "remove", path: "d/", recursive: true }]);
});

test("expansionRequests asks for the state the library shows, once until the reply follows", () => {
  const rows = [
    { path: "src", directory: true, expanded: true },
    { path: "docs", directory: true, expanded: false },
    { path: "readme.md", directory: false, expanded: false },
  ];
  const libraryOpen = new Set(["docs"]);
  const pending = new Set();
  const isExpanded = (path) => libraryOpen.has(path);
  assert.deepEqual(expansionRequests(rows, isExpanded, pending), [
    { path: "src", expanded: false },
    { path: "docs", expanded: true },
  ]);
  assert.deepEqual(expansionRequests(rows, isExpanded, pending), []);
  libraryOpen.add("src");
  libraryOpen.delete("docs");
  assert.deepEqual(expansionRequests(rows, isExpanded, pending), []);
});

test("openablePath opens the selected file and nothing for a folder or no selection", () => {
  const rows = [
    { path: "src", directory: true },
    { path: "src/main.go", directory: false },
  ];
  assert.equal(openablePath(rows, "src/main.go"), "src/main.go");
  assert.equal(openablePath(rows, "src"), null);
  assert.equal(openablePath(rows, null), null);
});
