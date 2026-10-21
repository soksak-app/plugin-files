import assert from "node:assert/strict";
import test from "node:test";
import { treeValue, bookmarkValue } from "../ui/declared-data.js";

test("treeValue builds the declared sidebar tree from sidecar rows", () => {
  assert.deepEqual(treeValue({
    root: "/work/project",
    entries: [
      { path: "src", name: "src", directory: true, depth: 0, expanded: true },
      { path: "src/a.js", name: "a.js", directory: false, depth: 1, selected: true, detail: "modified" },
      { path: "README.md", name: "README.md", directory: false, depth: 0 },
    ],
  }), { elements: [
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

test("treeValue cuts excess rows and reports their count", () => {
  const entries = Array.from({ length: 5001 }, (_, index) => ({ path: `f${index}`, name: `f${index}`, directory: false, depth: 0 }));
  const value = treeValue({ root: "/project", entries });
  const tree = value.elements.find((element) => element.kind === "tree");
  assert.equal(tree.nodes.length, 5000);
  assert.equal(value.elements.at(-1).text, "1개 항목을 표시하지 않았습니다.");
});

test("treeValue cuts rows deeper than the declared tree limit", () => {
  const entry = { path: "a/".repeat(16) + "leaf", name: "leaf", directory: false, depth: 16 };
  const value = treeValue({ root: "/project", entries: [{ path: "a", name: "a", directory: true, depth: 0 }, entry] });
  assert.equal(value.elements.at(-1).text, "1개 항목을 표시하지 않았습니다.");
});

test("bookmarkValue builds a declared list with removal commands", () => {
  assert.deepEqual(bookmarkValue(["a.txt", "src"]), { elements: [{ kind: "list", key: "bookmarks", empty: "북마크 없음", items: [
    { key: "a.txt", label: "a.txt", command: "files.bookmarks.remove", params: { path: "a.txt" } },
    { key: "src", label: "src", command: "files.bookmarks.remove", params: { path: "src" } },
  ] }] });
});
