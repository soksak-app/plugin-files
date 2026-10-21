// The DOM-free plugin-host consumer of the files sidecar snapshot protocol.
import { treeValue } from "./declared-data.js";

const SIDECAR = "@soksak/sidecar-files";
const TREE_STATUS = "files.tree";

const errorText = (error) => error instanceof Error ? error.message : String(error);

/** Register the tree snapshot and its commands in the plugin-host page runtime. */
export async function mountFilesHost({ page, expose, project = page?.project } = {}) {
  if (!page || typeof page.sidecar !== "function" || typeof page.report !== "function") {
    throw new TypeError("files host requires page.sidecar and page.report");
  }
  if (!expose || typeof expose.status !== "function" || typeof expose.command !== "function") {
    throw new TypeError("files host requires exposure status and command registration");
  }
  const hasProject = project !== null && typeof project === "object" &&
    typeof project.id === "string" && project.id !== "" && typeof project.root === "string" && project.root !== "";
  let value = treeValue({ root: hasProject ? project.root : null, entries: [] });
  const listeners = new Set();
  const pending = new Map();
  let stopped = false;
  let nextRequest = 0;
  let generation = null;
  const session = hasProject ? "plugin:files:" + project.id + ":" + SIDECAR : null;
  const read = () => value;
  const notify = (next) => {
    value = next;
    for (const fn of listeners) fn(value);
  };
  const reportError = async (error) => {
    try {
      await page.report({ level: "error", where: "files tree", text: errorText(error) });
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
    notify(treeValue({ root: project.root, entries, selected: tree.selected }));
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
  const request = async (operation, params = {}) => {
    if (!hasProject) return null;
    if (stopped) throw new Error("files host is disposed");
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

  await expose.status(TREE_STATUS, read, (fn) => { listeners.add(fn); return () => listeners.delete(fn); });
  for (const [name, run] of [
    ["files.refresh", runSnapshot],
    ["files.tree.toggle", toggle],
    ["files.select", select],
  ]) await expose.command(name, run);
  if (hasProject) {
    // Subscribe to messages and failures before the first request; the sidecar may answer immediately.
    await Promise.all([sidecar.on(session, onMessage), sidecar.onFailure(session, (reason) => {
      const error = new Error(errorText(reason));
      rejectPending(error);
      reportError(error);
    })]);
    try {
      await runSnapshot();
    } catch (error) {
      notify(treeValue({ root: project.root, entries: [], listingFailed: true }));
      await reportError(error);
    }
  }
  return {
    dispose() {
      stopped = true;
      rejectPending(new Error("files host is disposed"));
      listeners.clear();
    },
  };
}
