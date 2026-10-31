// The bookmarks section view at the consumer boundary: the page runs over a fake view window and reads and writes the declared
// project data key bookmarks through runtime.data.get and runtime.data.set. A remove press is relayed to the page's command.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findAll, installViewWindow, registeredEntries, replyOf, sendExposureRequest, settle } from "./fixtures/view-host.mjs";

const PROJECT = { id: "project-1", root: "/project" };
const SURFACE = "left/files.bookmarks";
// The exposes of the plugin manifest are the declarations that the host passes to the page as its start values.
const DECLARATIONS = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugin.json"), "utf8")).exposes;
let caseNumber = 0;

async function startBookmarks({ store = { bookmarks: [] }, dataFault = null }) {
  const start = {
    surface: SURFACE,
    params: null,
    origin: { directory: null },
    project: PROJECT,
    declarations: DECLARATIONS,
    diagnostics: null,
    section: { id: "files.bookmarks", sidebar: "left", card: null },
  };
  const host = installViewWindow({
    start,
    runtime(message) {
      const { command, params } = message;
      if (command === "runtime.data.get") {
        if (dataFault !== null) throw new Error(dataFault);
        return structuredClone(store[params.key]);
      }
      if (command === "runtime.data.set") {
        store[params.key] = structuredClone(params.value);
        return null;
      }
      return null;
    },
  });
  caseNumber += 1;
  await import(`../build/test/ui/bookmarks.js?case=${caseNumber}`);
  await settle();
  return { host, store };
}

const rowsOf = (root) => findAll(root, (element) => element.className === "files-bookmarks__row");

test("the bookmarks view reads the stored bookmarks of the project and draws one row for each", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const reads = view.host.posted.filter((message) => message.command === "runtime.data.get");
  assert.deepEqual(reads.map((message) => message.params), [{ key: "bookmarks" }]);
  const rows = rowsOf(globalThis.document.body);
  assert.deepEqual(rows.map((row) => findAll(row, (element) => element.className === "files-bookmarks__path")[0].textContent), [
    "src/main.go",
    "readme.md",
  ]);
  assert.deepEqual(view.host.errors, []);
});

test("the remove button writes the key without the removed path", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const [remove] = findAll(globalThis.document.body, (element) => element.dataset.command === "files.bookmarks.remove" && element.dataset.params === JSON.stringify({ path: "src/main.go" }));
  assert.ok(remove, "the remove button of the first row names its path");
  remove.click();
  await settle();
  assert.deepEqual(view.store.bookmarks, ["readme.md"]);
  assert.deepEqual(rowsOf(globalThis.document.body).length, 1);
  assert.deepEqual(view.host.errors, []);
});

test("a read that fails is reported to the error line of the view", async () => {
  const view = await startBookmarks({ dataFault: "stored bookmarks are unreadable" });
  assert.deepEqual(view.host.errors.map((error) => error.text), ["stored bookmarks are unreadable"]);
  assert.equal(view.host.errors[0].where, "files bookmarks");
});

test("the bookmarks view re-reads the bookmarks when the project data of the key changes", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go"] } });
  assert.deepEqual(view.host.posted.filter((message) => message.command === "runtime.data.on").length, 1);
  view.store.bookmarks = ["src/main.go", "readme.md"];
  view.host.deliver({ event: "data", data: { key: "bookmarks" } });
  await settle();
  assert.equal(rowsOf(globalThis.document.body).length, 2, "a bookmark that another view stored is drawn");
  assert.deepEqual(view.host.errors, []);
});

test("a change of another project data key does not re-read the bookmarks", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go"] } });
  const readsBefore = view.host.posted.filter((message) => message.command === "runtime.data.get").length;
  view.host.deliver({ event: "data", data: { key: "other" } });
  await settle();
  const readsAfter = view.host.posted.filter((message) => message.command === "runtime.data.get").length;
  assert.equal(readsAfter, readsBefore);
});

test("the bookmarks status reports the bookmark paths in stored order", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const id = sendExposureRequest(view.host, SURFACE, "status.get", { name: "files.bookmarks" });
  await settle();
  assert.deepEqual(replyOf(view.host, id), { result: ["src/main.go", "readme.md"] });
  assert.ok(registeredEntries(view.host).some((entry) => entry.kind === "status" && entry.name === "files.bookmarks"));
});

test("the bookmarks status notifies its watcher when a remove changes the list", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const watch = sendExposureRequest(view.host, SURFACE, "status.watch", { name: "files.bookmarks" });
  await settle();
  assert.deepEqual(replyOf(view.host, watch), { result: null });
  const next = sendExposureRequest(view.host, SURFACE, "status.next", { name: "files.bookmarks", version: 1 });
  await settle();
  const [remove] = findAll(globalThis.document.body, (element) => element.dataset.params === JSON.stringify({ path: "src/main.go" }));
  remove.click();
  await settle();
  assert.deepEqual(replyOf(view.host, next)?.result, { version: 2, value: ["readme.md"] });
});

test("each bookmark item and its remove button carry the declared dom names", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const named = (name) => findAll(globalThis.document.body, (element) => element.dataset.expose === name);
  assert.equal(named("files.bookmarks.item").length, 2, "one item of each bookmark carries files.bookmarks.item");
  assert.equal(named("files.bookmarks.remove").length, 2, "one remove button of each bookmark carries files.bookmarks.remove");
  const registered = registeredEntries(view.host).filter((entry) => entry.kind === "dom").map((entry) => entry.name);
  assert.ok(registered.includes("files.bookmarks.item"));
  assert.ok(registered.includes("files.bookmarks.remove"));
});
