import assert from "node:assert/strict";
import test from "node:test";
import { treeValue, bookmarkValue } from "../ui/declared-data.js";

const MAX_VALUE_BYTES = 1048576;
const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

test("treeValue builds the declared sidebar tree from sidecar rows", () => {
  assert.deepEqual(treeValue({
    root: "/work/project",
    entries: [
      { path: "src", name: "src", directory: true, depth: 0, expanded: true },
      { path: "src/a.js", name: "a.js", directory: false, depth: 1, selected: true, detail: "modified" },
      { path: "README.md", name: "README.md", directory: false, depth: 0 },
    ],
  }), { elements: [
    { kind: "status-line", key: "project", text: "/work/project" },
    { kind: "button", key: "bookmark", label: "북마크 추가", command: "files.bookmarks.add", params: { path: "src/a.js" }, enabled: true },
    { kind: "button", key: "refresh", label: "새로 고침", command: "files.refresh" },
    { kind: "tree", key: "files", empty: "파일이 없습니다.", nodes: [
      { key: "src", label: "src", command: "files.select", params: { path: "src" }, branch: true, expanded: true, children: [
        { key: "a.js", label: "a.js", command: "files.select", params: { path: "src/a.js" }, selected: true, detail: "modified" },
      ] },
      { key: "README.md", label: "README.md", command: "files.select", params: { path: "README.md" } },
    ] },
  ] });
});

test("treeValue emits only the no-project status line when root is null", () => {
  assert.deepEqual(treeValue({ root: null, entries: [] }), { elements: [{ kind: "status-line", key: "project", text: "프로젝트 없음" }] });
});

test("treeValue leaves no empty-folder label after a listing failure", () => {
  const tree = treeValue({ root: "/project", entries: [], listingFailed: true }).elements.find((element) => element.kind === "tree");
  assert.equal(tree.empty, "");
});

test("treeValue rejects rows when no project root exists", () => {
  assert.throws(() => treeValue({ root: null, entries: [{ path: "x", name: "x", directory: false, depth: 0 }] }), /no entries/);
});

test("treeValue cuts excess rows and reports their count", () => {
  const entries = Array.from({ length: 5001 }, (_, index) => ({ path: `f${index}`, name: `f${index}`, directory: false, depth: 0 }));
  const value = treeValue({ root: "/project", entries });
  const tree = value.elements.find((element) => element.kind === "tree");
  assert.equal(tree.nodes.length, 5000);
  assert.equal(value.elements.at(-1).text, "1개 항목을 표시하지 않았습니다.");
});

test("treeValue cuts rows deeper than the declared tree limit", () => {
  const ancestors = Array.from({ length: 16 }, (_, depth) => ({ path: ["a", ...Array(depth).fill("b")].join("/"), name: depth === 0 ? "a" : "b", directory: true, depth, expanded: true }));
  const entry = { path: `${ancestors.at(-1).path}/leaf`, name: "leaf", directory: false, depth: 16 };
  const value = treeValue({ root: "/project", entries: [...ancestors, entry] });
  assert.equal(value.elements.at(-1).text, "1개 항목을 표시하지 않았습니다.");
});

test("treeValue ends the listing at the first row beyond the depth limit", () => {
  const chain = Array.from({ length: 16 }, (_, depth) => ({ path: ["deep", ...Array(depth).fill("child")].join("/"), name: depth === 0 ? "deep" : "child", directory: true, depth, expanded: true }));
  const tooDeep = { path: `${chain.at(-1).path}/leaf`, name: "leaf", directory: false, depth: 16 };
  const later = Array.from({ length: 5000 }, (_, index) => ({ path: `f${index}`, name: `f${index}`, directory: false, depth: 0 }));
  const value = treeValue({ root: "/project", entries: [...chain, tooDeep, ...later] });
  const count = (nodes) => nodes.reduce((total, node) => total + 1 + count(node.children ?? []), 0);
  assert.equal(count(value.elements.find((element) => element.kind === "tree").nodes), 16);
  assert.equal(value.elements.at(-1).text, "5001개 항목을 표시하지 않았습니다.");
});

test("treeValue keeps the longest prefix whose serialized value fits 1048576 bytes", () => {
  const entries = Array.from({ length: 3000 }, (_, index) => {
    const name = `f${index}-${"x".repeat(300)}`;
    return { path: name, name, directory: false, depth: 0 };
  });
  const value = treeValue({ root: "/project", entries });
  const shown = value.elements.find((element) => element.kind === "tree").nodes.length;
  assert.equal(value.elements.at(-1).key, "cut");
  assert.equal(value.elements.at(-1).text, `${3000 - shown}개 항목을 표시하지 않았습니다.`);
  assert.ok(jsonBytes(value) <= MAX_VALUE_BYTES, `value has ${jsonBytes(value)} bytes`);
  assert.ok(value.elements.length < 64);
  // Adding the next row, with the status-line that states one fewer row, exceeds the limit, so the cut is the longest prefix.
  const longer = structuredClone(value);
  longer.elements.find((element) => element.kind === "tree").nodes.push(treeValue({ root: "/project", entries: [entries[shown]] }).elements.find((element) => element.kind === "tree").nodes[0]);
  longer.elements.at(-1).text = `${3000 - shown - 1}개 항목을 표시하지 않았습니다.`;
  assert.ok(jsonBytes(longer) > MAX_VALUE_BYTES, `one more row has ${jsonBytes(longer)} bytes`);
});

test("treeValue rejects malformed rows even when a row would be cut", () => {
  assert.throws(() => treeValue({ root: "/project", entries: [{ path: "bad", name: "bad", directory: "yes", depth: 16 }] }), /directory/);
});

test("treeValue validates malformed entries after the node cut", () => {
  const entries = Array.from({ length: 5000 }, (_, index) => ({ path: `f${index}`, name: `f${index}`, directory: false, depth: 0 }));
  entries.push({ path: "bad", name: "bad", directory: "no", depth: 0 });
  assert.throws(() => treeValue({ root: "/project", entries }), /directory must be a boolean/);
});

test("treeValue rejects an orphan depth and a child below a file", () => {
  assert.throws(() => treeValue({ root: "/project", entries: [{ path: "orphan/child", name: "child", directory: false, depth: 1 }] }), /parent/);
  assert.throws(() => treeValue({ root: "/project", entries: [
    { path: "file", name: "file", directory: false, depth: 0 },
    { path: "file/child", name: "child", directory: false, depth: 1 },
  ] }), /non-directory/);
});

test("treeValue rejects duplicate sibling keys and uses valid keys for ordinary filenames", () => {
  assert.throws(() => treeValue({ root: "/project", entries: [
    { path: "same", name: "same", directory: false, depth: 0 },
    { path: "same", name: "same", directory: false, depth: 0 },
  ] }), /duplicates path/);
  const tree = treeValue({ root: "/project", entries: [{ path: "a file.txt", name: "a file.txt", directory: false, depth: 0 }] }).elements.find((item) => item.kind === "tree");
  assert.match(tree.nodes[0].key, /^[A-Za-z0-9._:-]{1,128}$/);
});

test("treeValue requires an open command declared by this plugin", () => {
  assert.throws(() => treeValue({ root: "/project", entries: [], openCommand: "core.file.open", declaredCommands: ["core.file.open"] }), /declared command of this plugin/);
  assert.throws(() => treeValue({ root: "/project", entries: [], openCommand: "files.open" }), /declared command of this plugin/);
  const value = treeValue({ root: "/project", entries: [{ path: "a.txt", name: "a.txt", directory: false, depth: 0 }], openCommand: "files.open", declaredCommands: ["files.open"] });
  assert.equal(value.elements.find((element) => element.kind === "tree").nodes[0].open, "files.open");
});

test("bookmarkValue cuts excess items and reports their count", () => {
  const value = bookmarkValue(Array.from({ length: 1001 }, (_, index) => `f${index}`));
  assert.equal(value.elements[0].items.length, 1000);
  assert.equal(value.elements.at(-1).text, "1개 북마크를 표시하지 않았습니다.");
});

test("bookmarkValue rejects labels beyond the declared text limit", () => {
  assert.throws(() => bookmarkValue(["a".repeat(501)]), /bookmark label/);
});

test("bookmarkValue builds a declared list with removal commands", () => {
  assert.deepEqual(bookmarkValue(["a.txt", "src"]), { elements: [{ kind: "list", key: "bookmarks", empty: "북마크 없음", items: [
    { key: "a.txt", label: "a.txt", command: "files.bookmarks.remove", params: { path: "a.txt" } },
    { key: "src", label: "src", command: "files.bookmarks.remove", params: { path: "src" } },
  ] }] });
});

test("bookmarkValue keeps the longest prefix whose serialized value fits 1048576 bytes", () => {
  const paths = Array.from({ length: 1000 }, (_, index) => `${index}${"가".repeat(450)}`);
  const value = bookmarkValue(paths);
  const shown = value.elements[0].items.length;
  assert.equal(value.elements.at(-1).text, `${1000 - shown}개 북마크를 표시하지 않았습니다.`);
  assert.ok(jsonBytes(value) <= MAX_VALUE_BYTES, `value has ${jsonBytes(value)} bytes`);
  const longer = structuredClone(value);
  longer.elements[0].items.push(bookmarkValue([paths[shown]]).elements[0].items[0]);
  longer.elements.at(-1).text = `${1000 - shown - 1}개 북마크를 표시하지 않았습니다.`;
  assert.ok(jsonBytes(longer) > MAX_VALUE_BYTES, `one more item has ${jsonBytes(longer)} bytes`);
});
