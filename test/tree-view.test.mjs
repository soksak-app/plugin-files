// The file tree section view at the consumer boundary: the page runs over a fake view window, its sidecar is a fake files sidecar
// that answers the operations of the declared wire contract (test/fixtures/sidecar-files/tree-wire.json), and the tree library is
// the consumer model of test/sdk-models/trees.mjs. The test plays the user's expansion, selection and star press through them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findAll, installViewWindow, registeredEntries, replyOf, sendExposureRequest, settle } from "./fixtures/view-host.mjs";

const SIDECAR = "@soksak/sidecar-files";
const SURFACE = "left/files.tree";
const PROJECT = { id: "project-1", root: "/project" };
// The exposes of the plugin manifest are the declarations that the host passes to the page as its start values.
const DECLARATIONS = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugin.json"), "utf8")).exposes;
let caseNumber = 0;

/** A fake files sidecar that holds one tree and answers each operation with its reply, or with the error of the given reply. */
function filesSidecar(initial, { failSnapshot = null } = {}) {
  let tree = structuredClone(initial);
  const setDirectory = (path, expanded) => {
    const row = tree.entries.find((item) => item.path === path);
    if (!row || !row.directory) return { error: `no directory ${path}` };
    row.expanded = expanded;
    tree = { ...tree, generation: tree.generation + 1 };
    return { tree };
  };
  return (body) => {
    if (body.operation === "snapshot") return failSnapshot !== null ? { error: failSnapshot } : { tree };
    if (body.generation !== tree.generation) return { error: `stale tree generation ${body.generation}; current generation is ${tree.generation}` };
    if (body.operation === "expand") return setDirectory(body.path, true);
    if (body.operation === "collapse") return setDirectory(body.path, false);
    if (body.operation === "select") {
      tree = {
        ...tree,
        generation: tree.generation + 1,
        selected: body.path === "" ? null : body.path,
        entries: tree.entries.map((item) => ({ ...item, selected: item.path === body.path })),
      };
      return { tree };
    }
    return { error: `unknown operation ${body.operation}` };
  };
}

const INITIAL = {
  generation: 1,
  selected: null,
  entries: [
    { path: "src", name: "src", directory: true, depth: 0, expanded: true, selected: false },
    { path: "src/main.go", name: "main.go", directory: false, depth: 1, expanded: false, selected: false, detail: "modified" },
    { path: "readme.md", name: "readme.md", directory: false, depth: 0, expanded: false, selected: false },
  ],
};

/** Starts the tree view with a fresh module instance. The store holds the stored project data of the page. */
async function startTree({ sidecar, store = { bookmarks: [] } }) {
  const start = {
    surface: SURFACE,
    params: null,
    origin: { directory: null },
    project: PROJECT,
    declarations: DECLARATIONS,
    diagnostics: null,
    section: { id: "files.tree", sidebar: "left", card: null },
  };
  const sent = [];
  const host = installViewWindow({
    start,
    runtime(message, view) {
      const { command, params } = message;
      if (command === "runtime.sidecar.send") {
        sent.push(params.body);
        const reply = sidecar(params.body);
        queueMicrotask(() => view.deliver({ event: "sidecar.message", data: { id: params.id, body: { id: params.body.id, ...reply } } }));
        return null;
      }
      if (command === "runtime.data.get") return structuredClone(store[params.key]);
      if (command === "runtime.data.set") {
        store[params.key] = structuredClone(params.value);
        return null;
      }
      return null;
    },
  });
  const before = (await import("../build/test/sdk-models/trees.mjs")).trees.length;
  caseNumber += 1;
  await import(`../build/test/ui/tree.js?case=${caseNumber}`);
  await settle();
  const { trees } = await import("../build/test/sdk-models/trees.mjs");
  assert.equal(trees.length, before + 1, "the page created one tree");
  return { host, sent, store, tree: trees.at(-1), sendsOf: (operation) => sent.filter((body) => body.operation === operation) };
}

test("the tree view asks the sidecar for the project root and draws its rows", async () => {
  const view = await startTree({ sidecar: filesSidecar(INITIAL) });
  assert.deepEqual(view.sent.map((body) => body.operation), ["snapshot"]);
  const calls = view.host.posted.filter((message) => message.command === "runtime.sidecar.send");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.sidecar, SIDECAR);
  assert.equal(calls[0].params.id, SURFACE, "the sidecar session is the surface of the view");
  assert.deepEqual([...view.tree.paths.keys()], ["src/", "src/main.go", "readme.md"]);
  assert.equal(view.host.errors.length, 0);
});

test("collapsing and expanding a folder sends collapse and expand with the generation and the path", async () => {
  const view = await startTree({ sidecar: filesSidecar(INITIAL) });
  view.tree.getItem("src").collapse();
  await settle();
  assert.deepEqual(view.sendsOf("collapse").map(({ generation, path }) => ({ generation, path })), [{ generation: 1, path: "src" }]);
  assert.equal(view.tree.getItem("src").isExpanded(), false, "the library shows the folder as the sidecar reply states it");
  view.tree.getItem("src").expand();
  await settle();
  assert.deepEqual(view.sendsOf("expand").map(({ generation, path }) => ({ generation, path })), [{ generation: 2, path: "src" }]);
  assert.equal(view.tree.getItem("src").isExpanded(), true);
});

test("selecting a file sends select with the generation and the path, and the reply marks the row", async () => {
  const view = await startTree({ sidecar: filesSidecar(INITIAL) });
  view.tree.options.onSelectionChange(["readme.md"]);
  await settle();
  assert.deepEqual(view.sendsOf("select").map(({ generation, path }) => ({ generation, path })), [{ generation: 1, path: "readme.md" }]);
  assert.equal(view.tree.getItem("readme.md").isSelected(), true);
});

test("a failed snapshot is reported to the error line of the view with its text", async () => {
  const text = "cannot list expanded directory src: permission denied";
  const view = await startTree({ sidecar: filesSidecar(INITIAL, { failSnapshot: text }) });
  assert.deepEqual(view.host.errors.map((error) => error.text), [text]);
  assert.equal(view.host.errors[0].where, "files tree");
  assert.equal(view.tree.paths.size, 0, "no row is drawn from a failed listing");
});

test("a sidecar failure of the session is reported to the error line of the view", async () => {
  const view = await startTree({ sidecar: filesSidecar(INITIAL) });
  view.host.deliver({ event: "sidecar.failure", data: { id: SURFACE, reason: "restart limit" } });
  await settle();
  assert.deepEqual(view.host.errors.map((error) => error.text), ["restart limit"]);
});

test("the star button adds the selected file to the stored bookmarks", async () => {
  const view = await startTree({ sidecar: filesSidecar(INITIAL) });
  view.tree.options.onSelectionChange(["readme.md"]);
  await settle();
  const [star] = findAll(globalThis.document.body, (element) => element.dataset.command === "files.bookmarks.add");
  assert.ok(star, "the star button is bound to files.bookmarks.add");
  assert.equal(star.disabled, false, "the star button is enabled for a selected file");
  star.click();
  await settle();
  assert.deepEqual(view.store.bookmarks, ["readme.md"]);
  assert.deepEqual(view.host.errors, []);
});

test("the tree status reports each visible row with its path, kind, depth, expansion and selection", async () => {
  const view = await startTree({ sidecar: filesSidecar(INITIAL) });
  const id = sendExposureRequest(view.host, SURFACE, "status.get", { name: "files.tree" });
  await settle();
  assert.deepEqual(replyOf(view.host, id), {
    result: {
      rows: [
        { path: "src", kind: "directory", depth: 0, expanded: true, selected: false },
        { path: "src/main.go", kind: "file", depth: 1, expanded: false, selected: false },
        { path: "readme.md", kind: "file", depth: 0, expanded: false, selected: false },
      ],
      message: null,
    },
  });
  assert.ok(registeredEntries(view.host).some((entry) => entry.kind === "status" && entry.name === "files.tree"));
});

test("the tree status notifies its watcher when the selection changes", async () => {
  const view = await startTree({ sidecar: filesSidecar(INITIAL) });
  const watch = sendExposureRequest(view.host, SURFACE, "status.watch", { name: "files.tree" });
  await settle();
  assert.deepEqual(replyOf(view.host, watch), { result: null });
  const next = sendExposureRequest(view.host, SURFACE, "status.next", { name: "files.tree", version: 1 });
  await settle();
  assert.equal(replyOf(view.host, next), undefined, "the watcher waits while the selection is unchanged");
  view.tree.options.onSelectionChange(["readme.md"]);
  await settle();
  const changed = replyOf(view.host, next);
  assert.equal(changed?.result?.version, 2);
  assert.equal(changed.result.value.rows.find((row) => row.path === "readme.md").selected, true);
});

test("the message row of the tree status shows the text of a failed listing", async () => {
  const text = "cannot list expanded directory src: permission denied";
  const view = await startTree({ sidecar: filesSidecar(INITIAL, { failSnapshot: text }) });
  const id = sendExposureRequest(view.host, SURFACE, "status.get", { name: "files.tree" });
  await settle();
  assert.deepEqual(replyOf(view.host, id), { result: { rows: [], message: text } });
});

test("the refresh and star buttons carry their declared dom names", async () => {
  const view = await startTree({ sidecar: filesSidecar(INITIAL) });
  const named = (name) => findAll(globalThis.document.body, (element) => element.dataset.expose === name);
  assert.equal(named("files.tree.refresh").length, 1, "the refresh button carries files.tree.refresh");
  assert.equal(named("files.bookmarks.add").length, 1, "the star button carries files.bookmarks.add");
  const registered = registeredEntries(view.host);
  assert.ok(registered.some((entry) => entry.kind === "dom" && entry.name === "files.tree.refresh"));
  assert.ok(registered.some((entry) => entry.kind === "dom" && entry.name === "files.bookmarks.add"));
});
