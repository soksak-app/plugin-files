// The file tree section view at the plugin boundary: the real page module ui/tree.js runs in a window of the test process
// (test/fixtures/page.mjs), with the real tree library (ui/vendor/trees.js) drawing its rows. Its calls to the plugin API are recorded by the
// fixture of test/fixtures/plugin-api. The files sidecar is the fixture of test/fixtures/files-sidecar.mjs, which answers the operations of
// the declared wire contract: the page's sidecar.send is answered by it, and its replies reach the page through the sidecar listeners. The test
// plays the user's presses on the rows and the header buttons, and it reads the state of the view through the exposure requests that the
// test pushes to the page.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { openPage } from "./fixtures/page.mjs";
import { filesSidecar, SIDECAR } from "./fixtures/files-sidecar.mjs";

const SURFACE = "left/files.tree";
const PROJECT = { id: "project-1", root: "/project" };
const PAGE = new URL("../ui/tree.js", import.meta.url);
const plugin = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const INITIAL = {
  generation: 1,
  selected: null,
  entries: [
    { path: "src", name: "src", directory: true, depth: 0, expanded: true, selected: false },
    { path: "src/main.go", name: "main.go", directory: false, depth: 1, expanded: false, selected: false, detail: "modified" },
    { path: "readme.md", name: "readme.md", directory: false, depth: 0, expanded: false, selected: false },
  ],
};
const ROW_PATHS = ["src/", "src/main.go", "readme.md"];

/**
 * Opens the tree view and loads its page module. The sidecar sends are answered by the files sidecar fixture; core.file.open is the one
 * command of core that the page runs, and the test answers it with null.
 */
async function openTree(t, { files = filesSidecar(INITIAL), answers = {} } = {}) {
  const view = await openPage(PAGE, {
    beforeLoad: (target) => files.attach(target, SURFACE),
    start: { surface: SURFACE, params: null, origin: { directory: null }, project: PROJECT, declarations: plugin.exposes, diagnostics: null,
      section: { id: "files.tree", sidebar: "left", card: null } },
    store: { bookmarks: plugin.data.bookmarks.default },
    answers: {
      "runtime.sidecar.send": ({ body }) => files.route(body),
      "runtime.command": ({ name }) => {
        if (name !== "core.file.open") throw new Error(`command ${name} is not a command of core in this test`);
        return null;
      },
      ...answers,
    },
  });
  t.after(() => view.close());
  assert.equal(view.failure, null, String(view.failure?.message));
  return view;
}

const treeRoot = (view) => view.window.document.querySelector("file-tree-container").shadowRoot;
const rowsOf = (view) => [...treeRoot(view).querySelectorAll("[data-item-path]")];
const rowPaths = (view) => rowsOf(view).map((row) => row.dataset.itemPath);
const rowOf = (view, path) => treeRoot(view).querySelector(`[data-item-path="${path}"]`);
const pointer = (view, element, type) => element.dispatchEvent(new view.window.MouseEvent(type, { bubbles: true, composed: true, cancelable: true, button: 0, detail: 1 }));
// A press of the pointer on a row, as the user makes it: the tree library selects the row and opens or closes a folder on it.
const press = (view, element) => {
  for (const type of ["mousedown", "mouseup", "click"]) pointer(view, element, type);
};
const doubleClick = (view, element) => element.dispatchEvent(new view.window.MouseEvent("dblclick", { bubbles: true, composed: true }));
const requestsOf = (files, operation) => files.requests.filter((body) => body.operation === operation);
// The paths that the page opened through core.file.open.
const opened = (view) => view.calls.filter((call) => call.method === "runtime.command" && call.args.name === "core.file.open").map((call) => call.args.params.path);
// The errors that the page reported through its error call, as {where, text}.
const errorsOf = (view) => view.calls.filter((call) => call.method === "runtime.error").map((call) => call.args);
const countOf = (view, name) => view.registered("element").filter((entry) => entry === name).length;

let exposureRequests = 0;
/**
 * One exposure request of the surface: the test pushes it to the page, and the answer of the page is the payload of its exposure.reply call,
 * which the test returns as {result} or {error}.
 */
async function exposure(view, method, params) {
  const id = `probe-${++exposureRequests}`;
  view.push("exposure-request", { id, surface: SURFACE, method, params });
  await view.settled();
  const reply = view.calls.findLast((call) => call.method === "exposure.reply" && call.args.id === id);
  assert.ok(reply, `the page did not answer ${method} ${id}`);
  const { id: _id, ...answer } = reply.args;
  return answer;
}
const statusOf = async (view) => {
  const answer = await exposure(view, "status.get", { name: "files.tree" });
  assert.equal(answer.error, undefined, answer.error?.message);
  return answer.result;
};
// The payloads {name, value, version} of the changed calls of the page for the status name, in order.
const changedOf = (view, name) => view.calls
  .filter((call) => call.method === "exposure.changed" && call.args.name === name)
  .map((call) => call.args);

test("the tree view asks the sidecar for the project root and draws its rows", async (t) => {
  const files = filesSidecar(INITIAL);
  const view = await openTree(t, { files });
  assert.deepEqual(files.requests.map((body) => body.operation), ["snapshot"]);
  const sends = view.calls.filter((call) => call.method === "runtime.sidecar.send");
  assert.equal(sends.length, 1);
  assert.equal(sends[0].args.sidecar, SIDECAR);
  assert.equal(sends[0].args.id, SURFACE, "the sidecar session is the surface of the view");
  assert.deepEqual(rowPaths(view), ROW_PATHS);
  assert.deepEqual(errorsOf(view), []);
});

test("collapsing and expanding a folder sends collapse and expand with the generation and the path", async (t) => {
  const files = filesSidecar(INITIAL);
  const view = await openTree(t, { files });
  press(view, rowOf(view, "src/"));
  await view.settled();
  const collapse = requestsOf(files, "collapse");
  assert.deepEqual(collapse.map(({ generation, path }) => ({ generation, path })), [{ generation: collapse[0].generation, path: "src" }]);
  assert.equal((await statusOf(view)).rows[0].expanded, false, "the tree shows the folder as the sidecar reply states it");
  press(view, rowOf(view, "src/"));
  await view.settled();
  const expand = requestsOf(files, "expand");
  assert.deepEqual(expand.map(({ generation, path }) => ({ generation, path })), [{ generation: expand[0].generation, path: "src" }]);
  assert.equal((await statusOf(view)).rows[0].expanded, true);
  assert.deepEqual(errorsOf(view), []);
});

test("selecting a file sends select with the generation and the path, and the reply marks the row", async (t) => {
  const files = filesSidecar(INITIAL);
  const view = await openTree(t, { files });
  press(view, rowOf(view, "readme.md"));
  await view.settled();
  assert.deepEqual(requestsOf(files, "select").map(({ generation, path }) => ({ generation, path })), [{ generation: 1, path: "readme.md" }]);
  assert.equal((await statusOf(view)).rows.find((row) => row.path === "readme.md").selected, true);
});

test("a reply to a request of an earlier document of the surface is not an error, and an unknown reply of this document is", async (t) => {
  const files = filesSidecar(INITIAL);
  const view = await openTree(t, { files });
  view.sidecarMessage(SIDECAR, SURFACE, { body: { id: "files-earlier-document-1", tree: INITIAL } });
  // The page records the reply of an earlier document as its debug event, which ends its handling.
  assert.equal((await view.logged("tree.reply.earlier")).event, "tree.reply.earlier");
  assert.deepEqual(errorsOf(view), [], "the reply of an earlier document reported an error");
  const [{ id }] = requestsOf(files, "snapshot");
  view.sidecarMessage(SIDECAR, SURFACE, { body: { id: `${id}0`, tree: INITIAL } });
  await view.settled();
  assert.deepEqual(errorsOf(view), [{ where: "files tree", text: `files sidecar replied to unknown request ${id}0` }]);
});

test("a failed snapshot is reported to the error call of the view with its text", async (t) => {
  const text = "cannot list expanded directory src: permission denied";
  const view = await openTree(t, { files: filesSidecar(INITIAL, { failSnapshot: text }) });
  assert.deepEqual(errorsOf(view), [{ where: "files tree", text }]);
  assert.equal(rowPaths(view).length, 0, "no row is drawn from a failed listing");
});

test("a sidecar failure of the session is reported to the error call of the view", async (t) => {
  const view = await openTree(t);
  view.sidecarFailure(SIDECAR, SURFACE, "restart limit");
  await view.settled();
  assert.deepEqual(errorsOf(view), [{ where: "files tree", text: "restart limit" }]);
});

test("the star button adds the selected file to the stored bookmarks", async (t) => {
  const view = await openTree(t);
  press(view, rowOf(view, "readme.md"));
  await view.settled();
  const star = view.window.document.querySelector('[data-command="files.bookmarks.add"]');
  assert.ok(star, "the star button is bound to files.bookmarks.add");
  assert.equal(star.disabled, false, "the star button is enabled for a selected file");
  star.click();
  await view.settled();
  assert.equal(view.calls.findLast((call) => call.method === "runtime.data.change").args.key, "bookmarks");
  assert.deepEqual(view.stored("bookmarks"), ["readme.md"]);
  assert.deepEqual(errorsOf(view), []);
});

test("two adds at the same moment keep both paths", async (t) => {
  const view = await openTree(t);
  await Promise.all([view.request("files.bookmarks.add", { path: "a.txt" }), view.request("files.bookmarks.add", { path: "b.txt" })]);
  assert.deepEqual([...view.stored("bookmarks")].sort(), ["a.txt", "b.txt"]);
  assert.deepEqual(errorsOf(view), []);
});

test("a change of the bookmarks that fails shows its failure on the error call of the view", async (t) => {
  const view = await openTree(t, { answers: {
    "runtime.data.change": new Error("runtime.data.change bookmarks: the stored value changed while it was written"),
  } });
  press(view, rowOf(view, "readme.md"));
  await view.settled();
  view.window.document.querySelector('[data-command="files.bookmarks.add"]').click();
  await view.settled();
  assert.deepEqual(errorsOf(view), [{ where: "files tree", text: "runtime.data.change bookmarks: the stored value changed while it was written" }]);
});

test("adding a stored path writes nothing", async (t) => {
  const view = await openTree(t);
  view.change.data("bookmarks", ["a.txt"]);
  await view.request("files.bookmarks.add", { path: "a.txt" });
  // The page's updater returns no value for a stored path, so the change stores nothing and the value stays.
  assert.deepEqual(view.stored("bookmarks"), ["a.txt"]);
  assert.deepEqual(errorsOf(view), []);
});

test("the tree status reports each visible row with its path, kind, depth, expansion and selection", async (t) => {
  const view = await openTree(t);
  assert.deepEqual(await statusOf(view), {
    rows: [
      { path: "src", kind: "directory", depth: 0, expanded: true, selected: false },
      { path: "src/main.go", kind: "file", depth: 1, expanded: false, selected: false },
      { path: "readme.md", kind: "file", depth: 0, expanded: false, selected: false },
    ],
    message: null,
  });
  assert.ok(view.registered("status").includes("files.tree"));
});

test("the tree status sends its current value as a changed event with version 1 when a watch starts", async (t) => {
  const view = await openTree(t);
  assert.deepEqual(await exposure(view, "status.watch", { name: "files.tree" }), { result: null });
  assert.deepEqual(changedOf(view, "files.tree"), [
    {
      name: "files.tree",
      value: {
        rows: [
          { path: "src", kind: "directory", depth: 0, expanded: true, selected: false },
          { path: "src/main.go", kind: "file", depth: 1, expanded: false, selected: false },
          { path: "readme.md", kind: "file", depth: 0, expanded: false, selected: false },
        ],
        message: null,
      },
      version: 1,
    },
  ]);
});

test("the tree status sends each changed selection as a changed event with the next version", async (t) => {
  const view = await openTree(t);
  assert.deepEqual(await exposure(view, "status.watch", { name: "files.tree" }), { result: null });
  press(view, rowOf(view, "readme.md"));
  await view.settled();
  const sent = changedOf(view, "files.tree");
  assert.deepEqual(sent.map((payload) => payload.version), [1, 2]);
  assert.equal(sent[1].value.rows.find((row) => row.path === "readme.md").selected, true);
});

test("the message row of the tree status shows the text of a failed listing", async (t) => {
  const text = "cannot list expanded directory src: permission denied";
  const view = await openTree(t, { files: filesSidecar(INITIAL, { failSnapshot: text }) });
  assert.deepEqual(await statusOf(view), { rows: [], message: text });
});

test("the refresh and star buttons carry their declared element names", async (t) => {
  const view = await openTree(t);
  const named = (name) => view.window.document.querySelectorAll(`[data-expose="${name}"]`).length;
  assert.equal(named("files.tree.refresh"), 1, "the refresh button carries files.tree.refresh");
  assert.equal(named("files.bookmarks.add"), 1, "the star button carries files.bookmarks.add");
  assert.ok(view.registered("element").includes("files.tree.refresh"));
  assert.ok(view.registered("element").includes("files.bookmarks.add"));
});

test("the tree rows are one provider that reads the rows the library draws, and each drawn row carries files.tree.row", async (t) => {
  const view = await openTree(t);
  assert.equal(countOf(view, "files.tree.row"), 1, "files.tree.row is registered once");
  assert.deepEqual(rowsOf(view).map((row) => row.dataset.expose), ["files.tree.row", "files.tree.row", "files.tree.row"]);
  // The provider lists each row that the library draws.
  assert.equal((await exposure(view, "element.elements", { name: "files.tree.row" })).result.length, 3);
});

test("each drawn row runs files.select with its path, and a press on it selects once", async (t) => {
  const files = filesSidecar(INITIAL);
  const view = await openTree(t, { files });
  assert.deepEqual(rowsOf(view).map((row) => [row.dataset.command, JSON.parse(row.dataset.params)]),
    [["files.select", { path: "src" }], ["files.select", { path: "src/main.go" }], ["files.select", { path: "readme.md" }]]);
  // A press runs files.select from the selection notice of the library and from the delegated root, and the page answers both from one request.
  press(view, rowOf(view, "readme.md"));
  await view.settled();
  assert.deepEqual(requestsOf(files, "select").map(({ path }) => path), ["readme.md"], "one press sends one select");
  // A press on the selected row runs files.select from the delegated root only, and the path is the selection, so it sends nothing.
  press(view, rowOf(view, "readme.md"));
  await view.settled();
  assert.deepEqual(requestsOf(files, "select").map(({ path }) => path), ["readme.md"], "a press on the selected row sends nothing");
});

test("a double click opens the file of its row without waiting for the reply of the select", async (t) => {
  const files = filesSidecar(INITIAL);
  const view = await openTree(t, { files });
  const readme = rowOf(view, "readme.md");
  // The reply of the sidecar is held, so the select stays in flight until the test releases it.
  files.hold();
  press(view, readme);
  assert.deepEqual(requestsOf(files, "select").map(({ path }) => path), ["readme.md"]);
  // The double click runs at once: the open command of the row is run while the select reply is still held.
  doubleClick(view, readme);
  assert.deepEqual(opened(view), ["readme.md"]);
  files.release();
  await view.settled();
});

test("a double click on a folder and a double click off the rows open nothing", async (t) => {
  const view = await openTree(t);
  doubleClick(view, rowOf(view, "src/"));
  doubleClick(view, view.window.document.querySelector(".files-tree__holder"));
  await view.settled();
  assert.deepEqual(opened(view), [], "a double click that names no file runs no command");
});

test("a row that the library draws later is marked, and a row it removes is not provided", async (t) => {
  const files = filesSidecar(INITIAL);
  const view = await openTree(t, { files });
  // The project changes on disk: the sidecar reports the change, and the page lists the folder again and draws its rows.
  files.set({ ...INITIAL, entries: [...INITIAL.entries.filter((entry) => entry.path !== "readme.md"),
    { path: "notes.txt", name: "notes.txt", directory: false, depth: 0, expanded: false, selected: false }] });
  files.message({ changed: "./" });
  await view.settled();
  assert.deepEqual(rowPaths(view), ["src/", "src/main.go", "notes.txt"]);
  assert.equal(rowOf(view, "notes.txt").dataset.expose, "files.tree.row", "the page marks the row that the library drew");
  assert.equal(rowOf(view, "readme.md"), null, "a removed row is not drawn");
  assert.equal(countOf(view, "files.tree.row"), 1, "the changes register no provider");
});
