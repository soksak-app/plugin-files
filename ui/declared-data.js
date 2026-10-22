const MAX_LIST_ITEMS = 1000;
const MAX_TREE_NODES = 5000;
const MAX_TREE_DEPTH = 16;
const MAX_VALUE_BYTES = 1048576;
const SAFE_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const encoder = new TextEncoder();

// A text over its code point limit is not cut or rejected here: the value goes to core unchanged, and core rejects
// it with its rejection text (docs/spec/declared-ui.md, Rejection). A control character is not plain text and is rejected here.
function text(value, field) {
  if (typeof value !== "string" || CONTROL.test(value)) throw new TypeError(`${field} must be plain text`);
}

function relativePath(value, field) {
  text(value, field);
  if (value === "" || value.startsWith("/") || value.split("/").some((part) => part === "" || part === "." || part === "..")) throw new TypeError(`${field} must be a normalized relative path`);
}

function stableKey(value) {
  if (SAFE_KEY.test(value)) return value;
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `p-${hash.toString(16).padStart(16, "0")}`;
}

const valueBytes = (value) => encoder.encode(JSON.stringify(value)).byteLength;

// Keeps the longest prefix of the first `total` rows whose value, with its cut status-line, fits the size limit.
// rowsValue(count) builds the value of the first `count` rows without the cut status-line; the size without it grows
// with each row, so the largest count within the limit is found by bisection, and the cut status-line, whose length
// depends on the count it states, is then checked by counting down from that count.
function cutToLimits(total, maxRows, rowsValue, cutText) {
  let low = 0;
  let high = maxRows;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (valueBytes(rowsValue(middle)) <= MAX_VALUE_BYTES) low = middle;
    else high = middle - 1;
  }
  for (let count = low; count >= 0; count -= 1) {
    const value = rowsValue(count);
    if (count < total) value.elements.push({ kind: "status-line", key: "cut", text: cutText(total - count) });
    if (valueBytes(value) <= MAX_VALUE_BYTES) return value;
  }
  throw new RangeError(`declared value exceeds ${MAX_VALUE_BYTES} bytes without any row`);
}

function validateEntries(entries) {
  const stack = [];
  const paths = new Set();
  const siblings = new Map();
  let selected = null;
  for (const [index, entry] of entries.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`entry ${index} must be an object`);
    if (typeof entry.name !== "string") throw new TypeError(`entry ${index} name must be a string`);
    text(entry.name, `entry ${index} name`);
    if (typeof entry.path !== "string") throw new TypeError(`entry ${index} path must be a string`);
    relativePath(entry.path, `entry ${index} path`);
    if (typeof entry.directory !== "boolean") throw new TypeError(`entry ${index} directory must be a boolean`);
    if (!Number.isInteger(entry.depth) || entry.depth < 0) throw new TypeError(`entry ${index} depth must be a non-negative integer`);
    if (entry.expanded !== undefined && typeof entry.expanded !== "boolean") throw new TypeError(`entry ${index} expanded must be a boolean`);
    if (entry.expanded === true && !entry.directory) throw new TypeError(`entry ${index} expanded requires a directory`);
    if (entry.selected !== undefined && typeof entry.selected !== "boolean") throw new TypeError(`entry ${index} selected must be a boolean`);
    if (entry.detail !== undefined) text(entry.detail, `entry ${index} detail`);
    if (entry.path.split("/").at(-1) !== entry.name) throw new TypeError(`entry ${index} path does not end in its name`);
    if (paths.has(entry.path)) throw new TypeError(`entry ${index} duplicates path ${entry.path}`);
    const parent = entry.depth === 0 ? null : stack[entry.depth - 1];
    if (entry.depth > 0 && !parent) throw new TypeError(`entry ${index} has no parent at depth ${entry.depth - 1}`);
    if (parent && !parent.directory) throw new TypeError(`entry ${index} has a non-directory parent ${parent.path}`);
    if (parent && entry.path !== `${parent.path}/${entry.name}`) throw new TypeError(`entry ${index} path is not a child of ${parent.path}`);
    if (!parent && entry.path !== entry.name) throw new TypeError(`entry ${index} root path must equal its name`);
    const parentPath = parent?.path ?? "";
    let names = siblings.get(parentPath);
    if (!names) { names = new Set(); siblings.set(parentPath, names); }
    if (names.has(entry.name)) throw new TypeError(`entry ${index} has duplicate sibling key ${entry.name}`);
    names.add(entry.name);
    if (entry.selected === true) {
      if (selected !== null) throw new TypeError("tree entries select more than one path");
      selected = entry.path;
    }
    paths.add(entry.path);
    stack[entry.depth] = entry;
    stack.length = entry.depth + 1;
  }
  return selected;
}

/** Build the plugin-authored declared UI value for the project file tree. */
export function treeValue({ root, entries = [], selected = null, openCommand, declaredCommands = [], listingFailed = false } = {}) {
  if (root === null) {
    if (!Array.isArray(entries) || entries.length !== 0) throw new TypeError("treeValue requires no entries when root is null");
    if (selected !== null) throw new TypeError("treeValue requires no selection when root is null");
    return { elements: [{ kind: "status-line", key: "project", text: "프로젝트 없음" }] };
  }
  if (typeof root !== "string" || root === "" || !Array.isArray(entries)) throw new TypeError("treeValue requires a non-empty string root and an entries array");
  text(root, "project root");
  const markedSelection = validateEntries(entries);
  if (selected !== null && typeof selected !== "string") throw new TypeError("selected must be a string or null");
  if (selected !== null) relativePath(selected, "selected");
  if (markedSelection !== null && selected !== null && markedSelection !== selected) throw new TypeError("selected disagrees with the selected entry");
  const selectedPath = selected ?? markedSelection;
  if (!Array.isArray(declaredCommands) || declaredCommands.some((name) => typeof name !== "string")) throw new TypeError("declaredCommands must be an array of command names");
  if (openCommand !== undefined && (typeof openCommand !== "string" || !/^files\.[A-Za-z0-9._-]+$/.test(openCommand) || !declaredCommands.includes(openCommand))) throw new TypeError("openCommand must name a declared command of this plugin");

  // Rows beyond the first depth-16 row end the listing, so a prefix never contains a row whose parent it lacks.
  const deepest = entries.findIndex((entry) => entry.depth >= MAX_TREE_DEPTH);
  const maxRows = Math.min(deepest === -1 ? entries.length : deepest, MAX_TREE_NODES);
  if (typeof listingFailed !== "boolean") throw new TypeError("listingFailed must be a boolean");
  const rowsValue = (count) => {
    const roots = [];
    const stack = [];
    const nodeKeys = new Map();
    let bookmarkEnabled = false;
    for (const entry of entries.slice(0, count)) {
      const key = stableKey(entry.name);
      const parent = entry.depth === 0 ? null : stack[entry.depth - 1];
      const siblingKey = entry.depth === 0 ? "" : entry.path.slice(0, entry.path.lastIndexOf("/"));
      let keys = nodeKeys.get(siblingKey);
      if (!keys) { keys = new Set(); nodeKeys.set(siblingKey, keys); }
      if (keys.has(key)) throw new TypeError(`tree nodes have duplicate sibling key ${key}`);
      keys.add(key);
      const node = { key, label: entry.name, command: "files.select", params: { path: entry.path } };
      if (entry.directory) {
        node.branch = true;
        if (entry.expanded === true) node.expanded = true;
      }
      if (entry.path === selectedPath) node.selected = true;
      if (entry.path === selectedPath && !entry.directory) bookmarkEnabled = true;
      if (entry.detail !== undefined && entry.detail !== "") node.detail = entry.detail;
      // A folder opens nothing; the open command applies to a file (P15).
      if (openCommand !== undefined && !entry.directory) node.open = openCommand;
      if (entry.depth === 0) roots.push(node);
      else {
        parent.children ??= [];
        parent.children.push(node);
      }
      stack[entry.depth] = node;
      stack.length = entry.depth + 1;
    }
    return { elements: [
      { kind: "status-line", key: "project", text: root },
      { kind: "button", key: "bookmark", label: "북마크 추가", command: "files.bookmarks.add", params: { path: selectedPath ?? "" }, enabled: bookmarkEnabled },
      { kind: "button", key: "refresh", label: "새로 고침", command: "files.refresh" },
      { kind: "tree", key: "files", empty: listingFailed ? "" : "파일이 없습니다.", nodes: roots },
    ] };
  };
  return cutToLimits(entries.length, maxRows, rowsValue, (omitted) => `${omitted}개 항목을 표시하지 않았습니다.`);
}

/** Build the plugin-authored declared UI list for project bookmarks. */
export function bookmarkValue(paths, root = "/project") {
  if (!Array.isArray(paths)) throw new TypeError("bookmarkValue requires an array of paths");
  const seenPaths = new Set();
  const seenKeys = new Set();
  for (const path of paths) {
    text(path, "bookmark label");
    relativePath(path, "bookmark path");
    if (seenPaths.has(path)) throw new TypeError(`bookmarkValue received duplicate path ${path}`);
    seenPaths.add(path);
    const key = stableKey(path);
    if (seenKeys.has(key)) throw new TypeError(`bookmarkValue received duplicate key ${key}`);
    seenKeys.add(key);
  }
  const rowsValue = (count) => ({ elements: [{ kind: "list", key: "bookmarks", empty: root === null ? "프로젝트 없음" : "북마크 없음", items: paths.slice(0, count).map((path) => ({ key: stableKey(path), label: path, command: "files.bookmarks.remove", params: { path } })) }] });
  return cutToLimits(paths.length, Math.min(paths.length, MAX_LIST_ITEMS), rowsValue, (omitted) => `${omitted}개 북마크를 표시하지 않았습니다.`);
}
