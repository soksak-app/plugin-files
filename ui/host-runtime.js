// The DOM-free plugin-host consumer of the files sidecar snapshot protocol, of the bookmarks in the project data, and of the
// records of its commands and tree requests.
import { bookmarkValue, treeValue } from "./declared-data.js";

const SIDECAR = "@soksak/sidecar-files";
const BOOKMARKS_KEY = "bookmarks";
// A file row opens its file through the plugin command files.open, which the page runs with core.file.open (docs/spec/declared-ui.md, Tree keys).
const TREE_OPTIONS = {
  openCommand: "files.open",
  declaredCommands: ["files.refresh", "files.select", "files.open"],
};

// The text of a thrown value: the message of an Error, and the value itself for any other thrown value.
const errorText = (error) => error instanceof Error ? error.message : String(error);
/** The time since a monotonic start, in microseconds, as a non-negative integer. */
const micros = (started) => Math.round((performance.now() - started) * 1000);
// The project of the start value or of a project event: null, or an object with a non-empty id and root; another value is refused.
function parseProject(project) {
  if (project === null) return null;
  if (typeof project !== "object" || typeof project.id !== "string" || project.id === "" ||
      typeof project.root !== "string" || project.root === "") {
    throw new TypeError("files host requires project to be null or an object with id and root");
  }
  return { id: project.id, root: project.root };
}
const rootOf = (project) => (project === null || project === undefined ? null : project.root);

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
  if (typeof page.onProject !== "function") {
    throw new TypeError("files host requires page.onProject");
  }
  if (typeof page.onTreeExpanded !== "function") {
    throw new TypeError("files host requires page.onTreeExpanded");
  }
  if (!expose || typeof expose.status !== "function" || typeof expose.command !== "function") {
    throw new TypeError("files host requires exposure status and command registration");
  }
  const emitEvent = page.emit;
  // The start value seeds the tree; current stays unknown until the ready-time project delivery.
  const startProject = parseProject(project);
  let current;
  let value = treeValue({ root: rootOf(startProject), entries: [], ...TREE_OPTIONS });
  const listeners = new Set();
  const bookmarkListeners = new Set();
  const pending = new Map();
  // The ids of the requests of a previous project: their replies are dropped when they arrive.
  const abandoned = new Set();
  const subscribed = new Set();
  let stopped = false;
  let nextRequest = 0;
  let generation = null;
  let treeEntries = [];
  let selectedPath = null;
  let bookmarks = [];
  // Set while the stored bookmarks cannot be read; a change waits until a read succeeds, so no stored list is overwritten.
  let bookmarksFailed = false;
  const sessionOf = (shown) => "plugin:files:" + shown.id + ":" + SIDECAR;
  const read = () => value;
  const readBookmarks = () => bookmarkValue(bookmarks, rootOf(current), bookmarksFailed);
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
    treeEntries = tree.entries.map((entry) => {
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
    selectedPath = tree.selected;
    notify(treeValue({ root: rootOf(current), entries: treeEntries, selected: selectedPath, ...TREE_OPTIONS }));
  };
  const rejectPending = (error) => {
    for (const [id, call] of pending) {
      pending.delete(id);
      call.reject(error);
    }
  };
  // A request of a previous project resolves with no tree: its reply belongs to a project that the plugin host no longer shows.
  const abandonPending = () => {
    for (const [id, call] of pending) {
      pending.delete(id);
      abandoned.add(id);
      call.resolve(null);
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
    // A message with an error and no id is a watch failure of the session, which answers no request.
    if (!Object.hasOwn(body, "id") && typeof body.error === "string") {
      reportError(new Error(`files sidecar watch failed: ${body.error}`));
      return;
    }
    // A change and a watch failure are the declared messages without an id. Any other message without an id is reported with its
    // event and keys, so the record names the message, such as a connection notice of a persistent sidecar, which this standard
    // input and output sidecar does not send.
    if (!Object.hasOwn(body, "id")) {
      const kind = typeof body.event === "string" ? `event ${body.event}` : "no event";
      const keys = Object.keys(body).sort();
      reportError(new Error(`files sidecar sent an undeclared message without id: ${kind}; keys ${keys.length > 0 ? keys.join(", ") : "none"}`));
      return;
    }
    if (abandoned.delete(body.id)) return;
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
  const sidecar = page.sidecar(SIDECAR);
  // Subscribes the messages and failures of a session once. A message of a session that the plugin host no longer shows is dropped.
  const subscribe = async (session) => {
    if (subscribed.has(session)) return;
    subscribed.add(session);
    await Promise.all([sidecar.on(session, (body) => {
      if (current !== null && session === sessionOf(current)) onMessage(body);
    }), sidecar.onFailure(session, (reason) => {
      if (current === null || session !== sessionOf(current)) return;
      const error = new Error(errorText(reason));
      emitEvent("warn", "plugin.files.tree.failed", { error: error.message });
      // A waiting request is rejected to its caller, which reports the error with the request context (operation and project).
      // The callback has no request context, so it reports the failure only when no request waits; otherwise the error would be reported twice.
      const waiting = pending.size > 0;
      rejectPending(error);
      if (!waiting) reportError(error);
    })]);
  };
  const send = async (operation, params, shown) => {
    const body = { operation, id: "files-" + (++nextRequest), ...params };
    const response = new Promise((resolve, reject) => pending.set(body.id, { resolve, reject }));
    const deliver = async () => {
      try {
        await sidecar.send(sessionOf(shown), body, []);
      } catch (error) {
        pending.delete(body.id);
        throw error;
      }
    };
    // Both promises are observed: a session failure can reject the response while the send waits, and the send can fail after it.
    const [result] = await Promise.all([response, deliver()]);
    return result;
  };
  /** A tree request, with its result recorded as an event. */
  const request = async (operation, params = {}) => {
    const owner = current;
    if (stopped) throw new Error("files host is disposed");
    if (owner === undefined) throw new Error("files host requires a ready-time project delivery");
    if (owner === null) return null;
    const started = performance.now();
    try {
      const result = await send(operation, params, owner);
      emitEvent("debug", "plugin.files.tree.request", { operation, ok: true, micros: micros(started) });
      return result;
    } catch (error) {
      if (owner !== current) return null;
      emitEvent("warn", "plugin.files.tree.request", { operation, ok: false, micros: micros(started), error: errorText(error) });
      throw error;
    }
  };
  const runSnapshot = () => request("snapshot");
  const onTreeExpanded = async (event) => {
    try {
      if (current === undefined) throw new Error("declared tree expansion requires a ready-time project delivery");
      if (current === null) throw new Error("declared tree expansion requires a shown project");
      if (!event || typeof event !== "object" || Array.isArray(event)) throw new TypeError("declared tree expansion event must be an object");
      if (event.status !== "tree") throw new TypeError("declared tree expansion status must be tree");
      if (event.tree !== "files") throw new TypeError("declared tree expansion tree must be files");
      if (!Array.isArray(event.path) || event.path.length === 0 || event.path.some((key) => typeof key !== "string" || key === "")) {
        throw new TypeError("declared tree expansion path must be a non-empty array of node keys");
      }
      if (typeof event.expanded !== "boolean") throw new TypeError("declared tree expansion expanded must be a boolean");
      const tree = value.elements.find((element) => element.kind === "tree" && element.key === "files");
      let nodes = tree?.nodes;
      let node;
      for (const key of event.path) {
        node = Array.isArray(nodes) ? nodes.find((candidate) => candidate.key === key) : undefined;
        if (!node) throw new Error("declared tree expansion path does not match the current tree");
        nodes = node.children;
      }
      if (node.branch !== true || typeof node.params?.path !== "string" || node.params.path === "") {
        throw new Error("declared tree expansion path does not name a current branch");
      }
      await request(event.expanded ? "expand" : "collapse", { generation, path: node.params.path });
    } catch (error) {
      await reportError(error, "files tree");
    }
  };
  const select = async ({ path } = {}) => {
    if (current === undefined) throw new Error("files host requires a ready-time project delivery");
    if (current === null) return null;
    if (path === undefined) throw new Error("files.select requires path, a string or null");
    selectedPath = null;
    return request("select", { generation, path: path ?? "" });
  };
  const open = async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new Error("files.open requires a path");
    const owner = current;
    try {
      return await page.open(path);
    } catch (error) {
      const message = errorText(error);
      if (error?.code !== -32000 || message !== `no plugin opens ${path}`) throw error;
      emitEvent("warn", "plugin.files.open.failed", { error: message });
      if (owner !== undefined && owner === current && selectedPath === path) {
        const entries = treeEntries.map((entry) => {
          if (entry.path !== path) return entry;
          const detail = [entry.detail, `열 수 없음: ${message}`].filter(Boolean).join(" · ");
          return { ...entry, detail };
        });
        notify(treeValue({ root: rootOf(current), entries, selected: selectedPath, ...TREE_OPTIONS }));
      }
      return null;
    }
  };
  // Reads the stored bookmarks again. A failed read shows the notice, and the change that asked for the read is refused.
  // A read of the bookmarks of a project that the plugin host no longer shows changes nothing.
  const loadBookmarks = async () => {
    const owner = current;
    try {
      const stored = await page.data.get(BOOKMARKS_KEY);
      if (!Array.isArray(stored) || stored.some((item) => typeof item !== "string")) {
        throw new Error("the stored bookmarks are not a list of paths");
      }
      if (owner !== current) return;
      bookmarks = stored;
      bookmarksFailed = false;
    } catch (error) {
      if (owner !== current) return;
      bookmarksFailed = true;
      notifyBookmarks();
      throw error;
    }
  };
  // Writes the list. A write is canceled only when the project captured by the command has changed.
  const storeBookmarks = async (next, owner) => {
    try {
      await page.data.set(BOOKMARKS_KEY, next);
      return owner === current;
    } catch (error) {
      if (owner !== current) return false;
      throw error;
    }
  };
  const refreshBookmarks = async () => {
    await loadBookmarks();
    notifyBookmarks();
  };
  const addBookmark = async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new Error("files.bookmarks.add requires a path");
    if (current === undefined) throw new Error("files host requires a ready-time project delivery");
    if (current === null) return null;
    const owner = current;
    await refreshBookmarks();
    // The list and the write belong to the project of the call: a project change during the read ends the call.
    if (owner !== current) return null;
    if (bookmarks.includes(path)) return null;
    const next = [...bookmarks, path];
    if (!(await storeBookmarks(next, owner))) return null;
    bookmarks = next;
    notifyBookmarks();
    return null;
  };
  const removeBookmark = async ({ path } = {}) => {
    if (typeof path !== "string" || path === "") throw new Error("files.bookmarks.remove requires a path");
    if (current === undefined) throw new Error("files host requires a ready-time project delivery");
    if (current === null) return null;
    const owner = current;
    await refreshBookmarks();
    if (owner !== current) return null;
    if (!bookmarks.includes(path)) throw new Error(`${path} is not bookmarked`);
    const next = bookmarks.filter((item) => item !== path);
    if (!(await storeBookmarks(next, owner))) return null;
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

  // A change of the shown project: the tree, the bookmarks and the sidecar session follow it, and its requests of the previous project are dropped.
  const changeProject = async (data) => {
    if (stopped) return;
    const next = parseProject(data);
    const unchanged = current !== undefined && (current === null ? next === null : next !== null && current.id === next.id && current.root === next.root);
    if (unchanged) return;
    current = next;
    generation = null;
    treeEntries = [];
    selectedPath = null;
    abandonPending();
    bookmarks = [];
    bookmarksFailed = false;
    emitEvent("debug", "plugin.files.project", { shown: next !== null });
    notify(treeValue({ root: rootOf(next), entries: [], ...TREE_OPTIONS }));
    notifyBookmarks();
    if (next === null) return;
    await subscribe(sessionOf(next));
    if (current !== next) return;
    try {
      await loadBookmarks();
    } catch (error) {
      await reportError(error, "files bookmarks");
    }
    notifyBookmarks();
    // The listing of the project runs in the background, so the project message is not held by a slow sidecar reply.
    runSnapshot().catch(async (error) => {
      if (current === null) return;
      notify(treeValue({ root: rootOf(current), entries: [], listingFailed: true, ...TREE_OPTIONS }));
      await reportError(error);
    });
  };
  const onProjectEvent = async (data) => {
    try {
      await changeProject(data);
    } catch (error) {
      await reportError(error, "files tree");
    }
  };
  page.onProject(onProjectEvent);
  const stopTreeExpanded = await page.onTreeExpanded(onTreeExpanded);
  // Each name is written as a literal in its registration: the exposure check of the repository matches the literal names.
  await expose.status("files.tree", read, (fn) => { listeners.add(fn); return () => listeners.delete(fn); });
  await expose.status("files.bookmarks", readBookmarks, (fn) => { bookmarkListeners.add(fn); return () => bookmarkListeners.delete(fn); });
  await expose.command("files.refresh", recorded("files.refresh", runSnapshot, "files tree"));
  await expose.command("files.select", recorded("files.select", select, "files tree"));
  await expose.command("files.open", recorded("files.open", open, undefined));
  await expose.command("files.bookmarks.add", recorded("files.bookmarks.add", addBookmark, "files bookmarks"));
  await expose.command("files.bookmarks.remove", recorded("files.bookmarks.remove", removeBookmark, "files bookmarks"));
  await expose.command("files.open.failed", recorded("files.open.failed", openFailed, undefined));
  return {
    dispose() {
      stopped = true;
      if (typeof stopTreeExpanded === "function") stopTreeExpanded();
      rejectPending(new Error("files host is disposed"));
      listeners.clear();
      bookmarkListeners.clear();
    },
  };
}
