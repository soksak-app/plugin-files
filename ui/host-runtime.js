// The DOM-free plugin-host consumer of the files sidecar snapshot protocol, of the bookmarks in the project data, and of the
// records of its commands and tree requests.
import { bookmarkValue, treeValue } from "./declared-data.js";

const SIDECAR = "@soksak/sidecar-files";
const BOOKMARKS_KEY = "bookmarks";
// A file row opens its file through the plugin command files.open, which the page runs with core.file.open (docs/spec/declared-ui.md, Tree keys).
const TREE_OPTIONS = {
  openCommand: "files.open",
  declaredCommands: ["files.refresh", "files.tree.toggle", "files.select", "files.open"],
};

// The text of a thrown value: the message of an Error, and the value itself for any other thrown value.
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
  // The start value of the page is the project {id, root} or null for a page without a project; another value is refused.
  const hasProject = project !== null;
  if (hasProject && !(typeof project === "object" && typeof project.id === "string" && project.id !== "" &&
      typeof project.root === "string" && project.root !== "")) {
    throw new TypeError("files host requires project to be null or an object with id and root");
  }
  let value = treeValue({ root: hasProject ? project.root : null, entries: [], ...TREE_OPTIONS });
  const listeners = new Set();
  const bookmarkListeners = new Set();
  const pending = new Map();
  let stopped = false;
  let nextRequest = 0;
  let generation = null;
  let bookmarks = [];
  // Set while the stored bookmarks cannot be read; a change waits until a read succeeds, so no stored list is overwritten.
  let bookmarksFailed = false;
  const session = hasProject ? "plugin:files:" + project.id + ":" + SIDECAR : null;
  const read = () => value;
  const readBookmarks = () => bookmarkValue(bookmarks, hasProject ? project.root : null, bookmarksFailed);
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
    } catch (reportFailure) {
      // The refused report is written to the console and reported through the log route of the page.
      console.error("files host could not report an error: " + errorText(reportFailure));
      try {
        await page.report({ level: "error", where: "log", text: errorText(reportFailure) });
      } catch (logFailure) {
        console.error("files host could not report a refused error: " + errorText(logFailure));
      }
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
        selected: entry.selected,
      };
      if (typeof entry.selected !== "boolean") throw new Error("files sidecar returned an invalid tree row");
      if (entry.directory) {
        if (typeof entry.expanded !== "boolean") throw new Error("files sidecar returned an invalid tree row");
        row.expanded = entry.expanded;
      }
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
    if (stopped) return;
    if (!body || typeof body !== "object") {
      reportError(new Error("files sidecar message must be an object"));
      return;
    }
    if (Object.hasOwn(body, "changed")) {
      emitEvent("debug", "plugin.files.tree.changed", { path: String(body.changed) });
      request("snapshot").catch(reportError);
      return;
    }
    const call = pending.get(body.id);
    if (!call) {
      reportError(new Error(`files sidecar replied to unknown request ${body.id}`));
      return;
    }
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
  // Reads the stored bookmarks again. A failed read shows the notice, and the change that asked for the read is refused.
  const loadBookmarks = async () => {
    try {
      const stored = await page.data.get(BOOKMARKS_KEY);
      if (!Array.isArray(stored) || stored.some((item) => typeof item !== "string")) {
        throw new Error("the stored bookmarks are not a list of paths");
      }
      bookmarks = stored;
      bookmarksFailed = false;
    } catch (error) {
      bookmarksFailed = true;
      notifyBookmarks();
      throw error;
    }
  };
  const refreshBookmarks = async () => {
    await loadBookmarks();
    notifyBookmarks();
  };
  const addBookmark = async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new Error("files.bookmarks.add requires a path");
    if (!hasProject) return null;
    await refreshBookmarks();
    if (bookmarks.includes(path)) return null;
    const next = [...bookmarks, path];
    await page.data.set(BOOKMARKS_KEY, next);
    bookmarks = next;
    notifyBookmarks();
    return null;
  };
  const removeBookmark = async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new Error("files.bookmarks.remove requires a path");
    if (!hasProject) return null;
    await refreshBookmarks();
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
      emitEvent("warn", "plugin.files.command", { name, ok: false, micros: micros(started), error: `-32000: ${errorText(failure)}` });
      throw failure;
    }
  };

  if (hasProject) {
    try {
      await loadBookmarks();
    } catch (error) {
      await reportError(error, "files bookmarks");
    }
  }
  // Each name is written as a literal in its registration: the exposure check of the repository matches the literal names.
  await expose.status("files.tree", read, (fn) => { listeners.add(fn); return () => listeners.delete(fn); });
  await expose.status("files.bookmarks", readBookmarks, (fn) => { bookmarkListeners.add(fn); return () => bookmarkListeners.delete(fn); });
  await expose.command("files.refresh", recorded("files.refresh", runSnapshot, "files tree"));
  await expose.command("files.tree.toggle", recorded("files.tree.toggle", toggle, "files tree"));
  await expose.command("files.select", recorded("files.select", select, "files tree"));
  await expose.command("files.open", recorded("files.open", open, undefined));
  await expose.command("files.bookmarks.add", recorded("files.bookmarks.add", addBookmark, "files bookmarks"));
  await expose.command("files.bookmarks.remove", recorded("files.bookmarks.remove", removeBookmark, "files bookmarks"));
  await expose.command("files.open.failed", recorded("files.open.failed", openFailed, undefined));
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
