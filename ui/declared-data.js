const MAX_TREE_NODES = 5000;
const MAX_TREE_DEPTH = 16;

/** Build the plugin-authored declared UI value for the project file tree. */
export function treeValue({ root, entries = [], selected = null, openCommand } = {}) {
  if (root === null) return { elements: [{ kind: "status-line", key: "project", text: "프로젝트 없음" }] };
  if (typeof root !== "string" || !Array.isArray(entries)) throw new TypeError("treeValue requires a string root and an entries array");
  const selectedPath = selected ?? entries.find((entry) => entry.selected === true)?.path ?? null;
  const visible = [];
  let omitted = 0;
  for (const entry of entries) {
    if (visible.length >= MAX_TREE_NODES || entry.depth >= MAX_TREE_DEPTH) { omitted++; continue; }
    visible.push(entry);
  }
  const roots = [];
  const stack = [];
  for (const entry of visible) {
    if (typeof entry.path !== "string" || typeof entry.name !== "string" || typeof entry.directory !== "boolean" || !Number.isInteger(entry.depth) || entry.depth < 0) {
      throw new TypeError("treeValue received an invalid entry");
    }
    const node = { key: entry.name, label: entry.name, command: "files.select", params: { path: entry.path } };
    if (entry.directory) {
      node.branch = true;
      if (entry.expanded === true) node.expanded = true;
    }
    if (entry.path === selectedPath) node.selected = true;
    if (typeof entry.detail === "string" && entry.detail !== "") node.detail = entry.detail;
    if (openCommand !== undefined) node.open = openCommand;
    if (entry.depth === 0) roots.push(node);
    else {
      const parent = stack[entry.depth - 1];
      if (parent) {
        parent.children ??= [];
        parent.children.push(node);
        parent.branch = true;
      } else {
        omitted++;
        continue;
      }
    }
    stack[entry.depth] = node;
    stack.length = entry.depth + 1;
  }
  const elements = [
    { kind: "button", key: "bookmark", label: "북마크 추가", command: "files.bookmarks.add", params: { path: selectedPath ?? "" }, enabled: selectedPath !== null },
    { kind: "button", key: "refresh", label: "새로 고침", command: "files.refresh" },
    { kind: "tree", key: "files", empty: "파일이 없습니다.", nodes: roots },
  ];
  if (omitted > 0) elements.push({ kind: "status-line", key: "cut", text: `${omitted}개 항목을 표시하지 않았습니다.` });
  return { elements };
}

/** Build the plugin-authored declared UI list for project bookmarks. */
export function bookmarkValue(paths) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string" || path.length === 0)) throw new TypeError("bookmarkValue requires non-empty string paths");
  const seen = new Set();
  const items = [];
  for (const path of paths) {
    if (seen.has(path)) throw new TypeError(`bookmarkValue received duplicate path ${path}`);
    seen.add(path);
    items.push({ key: path, label: path, command: "files.bookmarks.remove", params: { path } });
  }
  return { elements: [{ kind: "list", key: "bookmarks", empty: "북마크 없음", items }] };
}
