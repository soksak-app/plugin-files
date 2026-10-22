// The DOM-free plugin-host consumer of the files sidecar snapshot protocol, of the bookmarks in the project data, and of the
// records of its commands and tree requests.
import { bookmarkValue, treeValue } from "./declared-data.js";

const SIDECAR = "@soksak/sidecar-files";
const TREE_STATUS = "files.tree";
const BOOKMARKS_STATUS = "files.bookmarks";
const BOOKMARKS_KEY = "bookmarks";
// A file row opens its file through the plugin command files.open, which the page runs with core.file.open (docs/spec/declared-ui.md, Tree keys).
const TREE_OPTIONS = {
  openCommand: "files.open",
  declaredCommands: ["files.refresh", "files.tree.toggle", "files.select", "files.open"],
};

const errorText = (error) => error instanceof Error ? error.message : String(error);
/** The time since a monotonic start, in microseconds, as a non-negative integer. */
const micros = (started) => Math.round((performance.now() - started) * 1000);

/** Register the tree and bookmarks statuses and their commands in the plugin-host page runtime. */
export async function mountFilesHost({ page, expose, project = page?.project } = {}) {
  if (!page || typeof page.sidecar !== "function" || typeof page.report !== "function") {
    throw new TypeError("files host requires page.sidecar and page.report");
  }
  if (typeof page.open !== "function") {
    throw new TypeError("files host requires page.open");
  }
  if (!page.data || typeof page.data.get !== "function" || typeof page.data.set !== "function") {
    throw new TypeError("files host requires page.data.get and page.data.set");
  }
  if (typeof page.emit !== "function") {
    throw new TypeError("files host requires page.emit");
  }
  if (!expose || typeof expose.status !== "function" || typeof expose.command !== "function") {
    throw new TypeError("files host requires exposure status and command registration");
  }
  const emitEvent = page.emit;
  const hasProject = project !== null && typeof project === "object" &&
    typeof project.id === "string" && project.id !== "" && typeof project.root === "string" && project.root !== "";
  let value = treeValue({ root: hasProject ? project.root : null, entries: [], ...TREE_OPTIONS });
  const listeners = new Set();
  const bookmarkListeners = new Set();
  const pending = new Map();
  let stopped = false;
  let nextRequest = 0;
  let generation = null;
  let bookmarks = [];
  const session = hasProject ? "plugin:files:" + project.id + ":" + SIDECAR : null;
  const read = () => value;
  const readBookmarks = () => bookmarkValue(bookmarks, hasProject ? project.root : null);
  const notify = (next) => {
    value = next;
    for (const fn of listeners) fn(value);
  };
  const notifyBookmarks = () => {
    const next = readBookmarks();
    for (const fn of bookmarkListeners) fn(next);
  };
  const reportError = async (error, where = "files tree") => {
    try {
      await page.report({ level: "error", where, text: errorText(error) });
    } catch (reportError) {
      console.error("files host could not report an error: " + errorText(reportError));
    }
  };
  const publishTree = (tree) => {
    if (!tree || !Number.isSafeInteger(tree.generation) || tree.generation < 1 || !Array.isArray(tree.entries)) {
      throw new Error("files sidecar returned an invalid tree snapshot");
    }
    if (tree.selected !== null && typeof tree.selected !== "string") {
      throw new Error("files sidecar returned an invalid selected path");
    }
    generation = tree.generation;
    const entries = tree.entries.map((entry) => {
      if (!entry || typeof entry.path !== "string" || typeof entry.name !== "string" ||
          typeof entry.directory !== "boolean" || !Number.isInteger(entry.depth) || entry.depth < 0) {
        throw new Error("files sidecar returned an invalid tree row");
      }
      const row = {
        path: entry.path,
        name: entry.name,
        directory: entry.directory,
        depth: entry.depth,
        selected: entry.selected === true,
      };
      if (entry.directory) row.expanded = entry.expanded === true;
      if (entry.detail !== undefined) row.detail = entry.detail;
      return row;
    });
    notify(treeValue({ root: project.root, entries, selected: tree.selected, ...TREE_OPTIONS }));
  };
  const rejectPending = (error) => {
    for (const [id, call] of pending) {
      pending.delete(id);
      call.reject(error);
    }
  };
  const onMessage = (body) => {
    if (stopped || !body || typeof body !== "object") return;
    if (Object.hasOwn(body, "changed")) {
      emitEvent("debug", "plugin.files.tree.changed", { path: String(body.changed) });
      request("snapshot").catch(reportError);
      return;
    }
    const call = pending.get(body.id);
    if (!call) return;
    pending.delete(body.id);
    if (typeof body.error === "string") {
      call.reject(new Error(body.error));
      return;
    }
    try {
      publishTree(body.tree);
      call.resolve(null);
    } catch (error) {
      call.reject(error);
    }
  };
  const sidecar = hasProject ? page.sidecar(SIDECAR) : null;
  const send = async (operation, params) => {
    const body = { operation, id: "files-" + (++nextRequest), ...params };
    const response = new Promise((resolve, reject) => pending.set(body.id, { resolve, reject }));
    try {
      await sidecar.send(session, body, []);
    } catch (error) {
      pending.delete(body.id);
      throw error;
    }
    return response;
  };
  /** A tree request, with its result recorded as an event. */
  const request = async (operation, params = {}) => {
    if (!hasProject) return null;
    if (stopped) throw new Error("files host is disposed");
    const started = performance.now();
    try {
      const result = await send(operation, params);
      emitEvent("debug", "plugin.files.tree.request", { operation, ok: true, micros: micros(started) });
      return result;
    } catch (error) {
      emitEvent("warn", "plugin.files.tree.request", { operation, ok: false, micros: micros(started), error: errorText(error) });
      throw error;
    }
  };
  const runSnapshot = () => request("snapshot");
  const toggle = async ({ path } = {}) => {
    if (!hasProject) return null;
    if (typeof path !== "string") throw new Error("files.tree.toggle requires a path");
    const tree = value.elements.find((element) => element.kind === "tree");
    const flatten = (nodes) => nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
    const entry = tree === undefined ? undefined : flatten(tree.nodes).find((node) => node.params?.path === path);
    if (!entry?.branch) throw new Error(path + " is not a listed directory");
    const operation = entry.expanded ? "collapse" : "expand";
    return request(operation, { generation, path });
  };
  const select = async ({ path } = {}) => {
    if (!hasProject) return null;
    if (path === undefined) throw new Error("files.select requires path, a string or null");
    return request("select", { generation, path: path ?? "" });
  };
  const open = async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new Error("files.open requires a path");
    return page.open(path);
  };
  const addBookmark = async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new Error("files.bookmarks.add requires a path");
    if (!hasProject || bookmarks.includes(path)) return null;
    const next = [...bookmarks, path];
    await page.data.set(BOOKMARKS_KEY, next);
    bookmarks = next;
    notifyBookmarks();
    return null;
  };
  const removeBookmark = async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new Error("files.bookmarks.remove requires a path");
    if (!hasProject) return null;
    if (!bookmarks.includes(path)) throw new Error(`${path} is not bookmarked`);
    const next = bookmarks.filter((item) => item !== path);
    await page.data.set(BOOKMARKS_KEY, next);
    bookmarks = next;
    notifyBookmarks();
    return null;
  };
  const openFailed = async ({ error } = {}) => {
    if (typeof error !== "string" || error === "") throw new Error("files.open.failed requires error, a non-empty string");
    emitEvent("warn", "plugin.files.open.failed", { error });
    return null;
  };
  /** A command run with its result recorded as an event. A failure of a tree command is shown on the tree through the error route first. */
  const recorded = (name, run, where) => async (params) => {
    const started = performance.now();
    try {
      const result = await run(params);
      emitEvent("debug", "plugin.files.command", { name, ok: true, micros: micros(started) });
      return result;
    } catch (failure) {
      if (where !== undefined) await reportError(failure, where);
      emitEvent("warn", "plugin.files.command", { name, ok: false, micros: micros(started), error: `-32000: ${failure.message}` });
      throw failure;
    }
  };

  if (hasProject) {
    try {
      bookmarks = await page.data.get(BOOKMARKS_KEY);
      if (!Array.isArray(bookmarks) || bookmarks.some((item) => typeof item !== "string")) {
        throw new Error("the stored bookmarks are not a list of paths");
      }
    } catch (error) {
      bookmarks = [];
      await reportError(error, "files bookmarks");
    }
  }
  await expose.status(TREE_STATUS, read, (fn) => { listeners.add(fn); return () => listeners.delete(fn); });
  await expose.status(BOOKMARKS_STATUS, readBookmarks, (fn) => { bookmarkListeners.add(fn); return () => bookmarkListeners.delete(fn); });
  for (const [name, run, where] of [
    ["files.refresh", runSnapshot, "files tree"],
    ["files.tree.toggle", toggle, "files tree"],
    ["files.select", select, "files tree"],
    ["files.open", open, undefined],
    ["files.bookmarks.add", addBookmark, "files bookmarks"],
    ["files.bookmarks.remove", removeBookmark, "files bookmarks"],
    ["files.open.failed", openFailed, undefined],
  ]) await expose.command(name, recorded(name, run, where));
  if (hasProject) {
    // Subscribe to messages and failures before the first request; the sidecar may answer immediately.
    await Promise.all([sidecar.on(session, onMessage), sidecar.onFailure(session, (reason) => {
      const error = new Error(errorText(reason));
      emitEvent("warn", "plugin.files.tree.failed", { error: error.message });
      rejectPending(error);
      reportError(error);
    })]);
    try {
      await runSnapshot();
    } catch (error) {
      notify(treeValue({ root: project.root, entries: [], listingFailed: true, ...TREE_OPTIONS }));
      await reportError(error);
    }
  }
  return {
    dispose() {
      stopped = true;
      rejectPending(new Error("files host is disposed"));
      listeners.clear();
      bookmarkListeners.clear();
    },
  };
}
