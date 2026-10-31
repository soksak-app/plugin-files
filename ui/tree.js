// The file tree section view (docs/spec/native-surfaces.md#view-surfaces). It lists the project folder of its start values through
// the files sidecar and draws the rows with the tree library. Each expansion, selection and refresh is a declared command of the
// view; the commands send the sidecar requests, and each sidecar reply is the state that the view shows. A file opens with
// core.file.open, which runs the plugin that declares its extension.
import { createBinder, createExpose } from "@soksak/plugin-api";
import { createViewBridge } from "@soksak/plugin-api/view";
import { FileTree, themeToTreeStyles } from "./vendor/trees.js";
import { createEmitter } from "./events.js";
import { expansionRequests, openablePath, PLACEHOLDER, pathDiff, treeOf, treePaths } from "./tree-model.js";

const SIDECAR = "@soksak/sidecar-files";
const start = window.sokSurface;
const session = start.surface;
const project = start.project;

// The icons of the header buttons are the core icons star and rotate-cw (packages/workbench/icons.js). A view page has no icon
// accessor, so the page carries the two paths of that icon set.
const ICON_STAR = '<path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z"/>';
const ICON_ROTATE = '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>';
const icon = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

/* 트리 안의 4pt 스크롤 막대. */
const SCROLLBAR = `
::-webkit-scrollbar{-webkit-appearance:none;width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(127,127,127,0.22);border-radius:2px}
::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,0.42)}
::-webkit-scrollbar-corner{background:transparent}
`;

/*
 * The view's styles. A section body has no padding of its own: the section header and the tree rows start at the gutter, and the
 * folding mark of the header starts at the same column as the folding mark of the rows. The values were measured on the captures of
 * the two applications (e2e/files.test.mjs). The header buttons have the size and colors of the card header buttons.
 */
const GUTTER = 10;
const CHEVRON_INK = 2.5;
const TITLE_INK = 1;
const ROW_INK = 5.5;
const STYLE = `
.files-tree{display:flex;flex-direction:column;height:100%;min-width:0;min-height:48px}
.files-tree__head{display:flex;align-items:center;gap:1px;flex:0 0 auto;height:28px;padding:0 ${GUTTER - 4}px 0 ${GUTTER + CHEVRON_INK - TITLE_INK}px}
.files-tree__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}
.files-tree__button{display:grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--r-xs);
  background:transparent;color:var(--muted);cursor:pointer}
.files-tree__button svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.files-tree__button:hover:not(:disabled){background:var(--inset);color:var(--fg)}
.files-tree__button:disabled{opacity:.4;cursor:default}
.files-tree__holder{flex:1 1 auto;min-height:20px}
.files-tree__message{padding:0 ${GUTTER + CHEVRON_INK - TITLE_INK}px;color:var(--muted)}
`;

/* The row height of the sidebar list (12px text × 1.6, fitted to the pixels). */
const ROW_HEIGHT = 20;
const EMPTY_TEXT = "파일이 없습니다.";
const NO_PROJECT_TEXT = "프로젝트 없음";

const errorText = (error) => (error instanceof Error ? error.message : String(error));
/** The time since a monotonic start, in microseconds, as a non-negative integer. */
const micros = (started) => Math.round((performance.now() - started) * 1000);

/** The tree colors. Every color is a var() of the app tokens, so no default color of the library shows. */
function themeStyles() {
  const style = getComputedStyle(document.documentElement);
  const mode = document.documentElement.dataset.mode === "light" ? "light" : "dark";
  return {
    ...themeToTreeStyles({ type: mode, bg: style.getPropertyValue("--card").trim(), fg: style.getPropertyValue("--fg").trim() }),
    // The rows have the 12px text and the row height of the sidebar. The first row starts at the gutter.
    "--trees-font-size-override": "12px",
    "--trees-font-family-override": "var(--font)",
    "--trees-padding-inline-override": "0px",
    "--trees-item-margin-x-override": "0px",
    "--trees-item-padding-x-override": `${GUTTER + CHEVRON_INK - ROW_INK}px`,
    "--trees-bg-override": "var(--card)",
    "--trees-bg-muted-override": "var(--inset)",
    "--trees-fg-override": "var(--fg)",
    "--trees-fg-muted-override": "var(--muted)",
    "--trees-accent-override": "var(--rail)",
    "--trees-border-color-override": "var(--edge)",
    "--trees-selected-bg-override": "var(--chip-sel)",
    "--trees-selected-fg-override": "var(--fg)",
    "color-scheme": mode,
  };
}

// The bridge reports its lost calls and snapshots here. A count or a skipped call is not an error; each other report is shown.
const bridge = createViewBridge({
  handler: window.webkit.messageHandlers["sok-view"],
  report: (event) => {
    if (event.kind === "open-calls" || event.kind === "skipped") return;
    showError(event.where ?? "view bridge", event.text ?? event.kind);
  },
});
const emitEvent = createEmitter(bridge.runtime, "files");
// The message row text of the view; an empty text means that no message row shows.
let messageText = "";
// The watchers of the files.tree status, which receive its value on each change.
const statusListeners = new Set();

const sheet = new CSSStyleSheet();
sheet.replaceSync(STYLE);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
const box = document.createElement("div");
box.className = "files-tree";
const head = document.createElement("div");
head.className = "files-tree__head";
const title = document.createElement("span");
title.className = "files-tree__title";
const star = document.createElement("button");
star.type = "button";
star.className = "files-tree__button";
star.innerHTML = icon(ICON_STAR);
star.title = "북마크 추가";
star.disabled = true;
const refresh = document.createElement("button");
refresh.type = "button";
refresh.className = "files-tree__button";
refresh.innerHTML = icon(ICON_ROTATE);
refresh.title = "새로 고침";
const holder = document.createElement("div");
holder.className = "files-tree__holder";
const message = document.createElement("div");
message.className = "files-tree__message";
head.append(title, star, refresh);
box.append(head, holder, message);
document.body.append(box);

/** Shows a message line; an empty text hides the line. */
const showMessage = (text) => {
  messageText = text;
  message.textContent = text;
  message.hidden = text === "";
  notifyTree();
};

/**
 * The one display path of an error of this view: the error line of the view writes it to the application log at the moment it
 * appears, and the message line shows it until the next tree is drawn.
 */
function showError(where, error) {
  const text = errorText(error);
  showMessage(text);
  bridge.runtime.error(where, text).catch((failure) => console.error(`files tree could not write an error: ${errorText(failure)}`));
}

const binder = createBinder((name, params) => bridge.runtime.command(name, params), {
  check: (name) => {
    if (!COMMANDS.includes(name)) throw new Error(`${name} is not a command of the files tree view`);
  },
});
const COMMANDS = ["files.refresh", "files.select", "files.open", "files.open.failed", "files.tree.toggle", "files.bookmarks.add"];

// The exposure of the page: the declared status files.tree and the dom names of the header buttons. The requests of the surface
// arrive as the host event exposure-request and are answered through exposureReply (core docs/spec/native-surfaces.md#view-surfaces).
const expose = createExpose({
  register: (kind, name) => bridge.exposure.register(kind, name),
  onRequest: (answer) => bridge.runtime.native.on("exposure-request", ({ id, surface, method, params }) => {
    if (surface !== start.surface) {
      showError("files tree", new Error(`exposure request ${id} names surface ${surface}, not ${start.surface}`));
      return;
    }
    answer({ id, method, params });
  }),
  reply: bridge.exposure.reply,
  report: (text) => showError("files tree", new Error(text)),
}, () => start.declarations);

// The state of the view: the last tree reply, its generation, the selected path, the folders with a request that the next reply has
// not answered, and the requests waiting for their replies.
let generation = null;
let rows = [];
let selection = null;
let paths = [];
const pending = new Set();
const waiting = new Map();
let nextRequest = 0;
// syncing guards the changes that the view makes to the library, so the library notifies none of them back as a user change.
let syncing = false;
let syncingSelection = false;

const tree = new FileTree({
  paths: [],
  density: "compact",
  itemHeight: ROW_HEIGHT,
  flattenEmptyDirectories: false,
  unsafeCSS: SCROLLBAR,
  onSelectionChange(picked) {
    if (syncingSelection) return;
    const file = [...picked].reverse().find((path) => !path.endsWith(PLACEHOLDER));
    const path = file === undefined ? null : file.replace(/\/$/, "");
    if (path !== selection) binder.run("files.select", { path }).catch((error) => showError("files tree", error));
  },
});
tree.render({ containerWrapper: holder });

const applyTheme = () => Object.entries(themeStyles()).forEach(([name, value]) => holder.style.setProperty(name, value));
applyTheme();
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-mode"] });

const isExpanded = (path) => {
  const item = tree.getItem(path);
  return item !== null && item.isDirectory() && item.isExpanded();
};

/** Sets the library's folders and selection to the rows of the last reply. A folder with a request waiting keeps the state the user left. */
function syncTree() {
  syncing = true;
  try {
    for (const row of rows) {
      if (!row.directory || pending.has(row.path)) continue;
      const item = tree.getItem(row.path);
      if (!item?.isDirectory()) continue;
      if (row.expanded && !item.isExpanded()) item.expand();
      if (!row.expanded && item.isExpanded()) item.collapse();
    }
    for (const path of [...pending]) {
      const row = rows.find((item) => item.path === path);
      if (!row || row.expanded === isExpanded(path)) pending.delete(path);
    }
  } finally {
    syncing = false;
  }
  syncingSelection = true;
  try {
    for (const path of tree.getSelectedPaths()) if (path.replace(/\/$/, "") !== selection) tree.getItem(path)?.deselect();
    const item = selection === null ? null : tree.getItem(selection);
    if (item && !item.isSelected()) item.select();
  } finally {
    syncingSelection = false;
  }
}

/** The value of the files.tree status: the visible rows of the tree and the message row text, or null when no message shows. */
const treeStatus = () => ({
  rows: rows.map((row) => ({
    path: row.path,
    kind: row.directory ? "directory" : "file",
    depth: row.depth,
    expanded: row.expanded,
    selected: row.selected,
  })),
  message: messageText === "" ? null : messageText,
});

/** Calls each watcher of the files.tree status with its value. The status keeps a value that equals the last one, so a repeated call sends nothing. */
function notifyTree() {
  const value = treeStatus();
  for (const listener of [...statusListeners]) listener(value);
}

/** Draws the rows of the last reply: the library paths, the git details, the selection, the message and the buttons. */
function render() {
  const next = treePaths(rows);
  syncing = true;
  try {
    const operations = pathDiff(paths, next);
    if (operations.length > 0) tree.batch(operations);
    paths = next;
  } finally {
    syncing = false;
  }
  tree.setGitStatus(rows.filter((row) => row.detail !== undefined).map((row) => ({ path: row.path, status: row.detail })));
  syncTree();
  showMessage(rows.length === 0 ? EMPTY_TEXT : "");
  star.disabled = !rows.some((row) => row.path === selection && !row.directory);
  notifyTree();
}

/** Takes a tree reply as the state of the view. An invalid reply throws, and the view keeps the state it had. */
function publish(reply) {
  const next = treeOf(reply);
  generation = next.generation;
  rows = next.rows;
  selection = next.selected;
  title.textContent = project === null ? NO_PROJECT_TEXT : project.root.split(/[\\/]/).filter(Boolean).at(-1) ?? project.root;
  title.title = project === null ? "" : project.root;
  render();
}

/** One request to the files sidecar. The reply resolves with the tree of the reply, and a sidecar error rejects with its text. */
async function request(operation, params = {}) {
  // Without a project the session is not subscribed, so a request would wait for a reply that cannot come.
  if (project === null) throw new Error("the file tree has no project to list");
  const started = performance.now();
  const id = `files-${++nextRequest}`;
  const response = new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
  try {
    const [tree] = await Promise.all([response, sidecar.send(session, { operation, id, ...params }, [])]);
    emitEvent("debug", "plugin.files.tree.request", { operation, ok: true, micros: micros(started) });
    return tree;
  } catch (error) {
    waiting.delete(id);
    emitEvent("warn", "plugin.files.tree.request", { operation, ok: false, micros: micros(started), error: errorText(error) });
    throw error;
  }
}

const sidecar = bridge.runtime.sidecar(SIDECAR);

const onMessage = (body) => {
  if (!body || typeof body !== "object") {
    showError("files tree", new Error("files sidecar message must be an object"));
    return;
  }
  if (Object.hasOwn(body, "changed")) {
    emitEvent("debug", "plugin.files.tree.changed", { path: String(body.changed) });
    refreshTree().catch((error) => showError("files tree", error));
    return;
  }
  // A message with an error and no id is a watch failure of the session, which answers no request.
  if (!Object.hasOwn(body, "id") && typeof body.error === "string") {
    showError("files tree", new Error(`files sidecar watch failed: ${body.error}`));
    return;
  }
  if (!Object.hasOwn(body, "id")) {
    const kind = typeof body.event === "string" ? `event ${body.event}` : "no event";
    const keys = Object.keys(body).sort();
    showError("files tree", new Error(`files sidecar sent an undeclared message without id: ${kind}; keys ${keys.length > 0 ? keys.join(", ") : "none"}`));
    return;
  }
  const call = waiting.get(body.id);
  if (!call) {
    showError("files tree", new Error(`files sidecar replied to unknown request ${body.id}`));
    return;
  }
  waiting.delete(body.id);
  if (typeof body.error === "string") call.reject(new Error(body.error));
  else call.resolve(body.tree);
};

const onFailure = (reason) => {
  const error = new Error(errorText(reason));
  emitEvent("warn", "plugin.files.tree.failed", { error: error.message });
  // A waiting request is rejected to its caller, which reports the error with its context. The failure reports itself only when no request waits.
  const waitingCount = waiting.size;
  for (const [id, call] of waiting) {
    waiting.delete(id);
    call.reject(error);
  }
  if (waitingCount === 0) showError("files tree", error);
};

/** Lists the project folder again and draws its tree. */
async function refreshTree() {
  publish(await request("snapshot"));
}

/** The folder expansion of the library, as the view sends it: the sidecar lists or unlists the folder, and the reply is drawn. */
function onLibraryChange() {
  if (syncing) return;
  for (const { path, expanded } of expansionRequests(rows, isExpanded, pending)) {
    binder.run("files.tree.toggle", { path, expanded }).catch((error) => showError("files tree", error));
  }
}

const handlers = {
  "files.refresh": () => refreshTree(),
  "files.select": async ({ path } = {}) => {
    if (path === undefined) throw new TypeError("files.select requires path, a string or null");
    if (path !== null && typeof path !== "string") throw new TypeError("files.select requires path, a string or null");
    publish(await request("select", { generation, path: path ?? "" }));
  },
  "files.tree.toggle": async ({ path, expanded } = {}) => {
    if (typeof path !== "string" || path === "" || typeof expanded !== "boolean") throw new TypeError("files.tree.toggle requires path and expanded");
    try {
      publish(await request(expanded ? "expand" : "collapse", { generation, path }));
    } catch (error) {
      // The library returns to the state of the last reply, and the folder can be requested again.
      pending.delete(path);
      syncTree();
      throw error;
    }
  },
  "files.open": async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new TypeError("files.open requires a path");
    try {
      await bridge.runtime.command("core.file.open", { path });
    } catch (error) {
      const text = errorText(error);
      if (error?.code !== -32000 || text !== `no plugin opens ${path}`) throw error;
      await binder.run("files.open.failed", { error: text });
      // The row of the file shows the failure until the next tree reply.
      rows = rows.map((row) => (row.path === path ? { ...row, detail: [row.detail, `열 수 없음: ${text}`].filter(Boolean).join(" · ") } : row));
      render();
    }
  },
  "files.open.failed": ({ error } = {}) => {
    if (typeof error !== "string" || error === "") throw new TypeError("files.open.failed requires error, a non-empty string");
    emitEvent("warn", "plugin.files.open.failed", { error });
    return null;
  },
  "files.bookmarks.add": async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new TypeError("files.bookmarks.add requires a path");
    const stored = await bridge.runtime.data.get("bookmarks");
    if (!Array.isArray(stored) || stored.some((item) => typeof item !== "string")) throw new TypeError("the stored bookmarks are not a list of paths");
    if (stored.includes(path)) return null;
    await bridge.runtime.data.set("bookmarks", [...stored, path]);
    return null;
  },
};

await Promise.all([
  expose.status("files.tree", treeStatus, (listener) => {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  }),
  expose.dom("files.tree.refresh", refresh),
  expose.dom("files.bookmarks.add", star),
  bridge.commands.register("files.refresh", handlers["files.refresh"]),
  bridge.commands.register("files.select", handlers["files.select"]),
  bridge.commands.register("files.tree.toggle", handlers["files.tree.toggle"]),
  bridge.commands.register("files.open", handlers["files.open"]),
  bridge.commands.register("files.open.failed", handlers["files.open.failed"]),
  bridge.commands.register("files.bookmarks.add", handlers["files.bookmarks.add"]),
]);
binder.bind(star, "files.bookmarks.add", () => ({ path: selection ?? "" }), { failed: (error) => showError("files tree", error) });
binder.bind(refresh, "files.refresh", {}, { failed: (error) => showError("files tree", error) });
// The library notifies each change it makes, so a user's expansion reaches the sidecar as the command of the folder.
tree.subscribe(onLibraryChange);
// A file opens on a double click or Enter on the selected row.
const openSelection = () => {
  const path = openablePath(rows, selection);
  if (path !== null) binder.run("files.open", { path }).catch((error) => showError("files tree", error));
};
holder.addEventListener("dblclick", openSelection);
holder.addEventListener("keydown", (event) => {
  if (event.key === "Enter") openSelection();
});

if (project === null) {
  title.textContent = NO_PROJECT_TEXT;
  showMessage("");
} else {
  await sidecar.on(session, onMessage);
  await sidecar.onFailure(session, onFailure);
  await refreshTree().catch((error) => showError("files tree", error));
}
