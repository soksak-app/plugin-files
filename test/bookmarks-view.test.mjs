// The bookmarks section view at the consumer boundary: the page runs over a fake view window and reads and writes the declared
// project data key bookmarks through runtime.data.get and runtime.data.change. A remove press is relayed to the page's command.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changedOf, findAll, installViewWindow, registeredEntries, replyOf, sendExposureRequest, settle } from "./fixtures/view-host.mjs";

const PROJECT = { id: "project-1", root: "/project" };
const SURFACE = "left/files.bookmarks";
// The exposes of the plugin manifest are the declarations that the host passes to the page as its start values.
const DECLARATIONS = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugin.json"), "utf8")).exposes;
let caseNumber = 0;

// The value that another view writes after the next read of the key, or null.
let afterRead = null;

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
        const read = structuredClone(store[params.key]);
        // Another view writes the key after this read, once, before the page writes.
        if (afterRead !== null) {
          store[params.key] = afterRead;
          afterRead = null;
        }
        return read;
      }
      if (command === "runtime.data.set") {
        store[params.key] = structuredClone(params.value);
        return null;
      }
      if (command === "runtime.data.replace") {
        if (JSON.stringify(store[params.key]) !== JSON.stringify(params.base)) return false;
        store[params.key] = structuredClone(params.value);
        return true;
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

// A web view shows its default serif text of 16px unless the page states the text of the sidebar.
for (const page of ["tree.html", "bookmarks.html"]) {
  test(`${page} states the text of the sidebar on its body`, { timeout: 1000 }, () => {
    const text = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ui", page), "utf8");
    assert.match(text, /body \{[^}]*font: 12px\/1\.4 var\(--font\)/, `${page} states no font on its body`);
    assert.match(text, /body \{[^}]*color: var\(--fg\)/, `${page} states no text color on its body`);
  });
}

test("the rows and the message of the bookmarks view start at the gutter of the tree title", async () => {
  await startBookmarks({});
  const rules = globalThis.document.adoptedStyleSheets.map((sheet) => sheet.text).join("");
  for (const name of ["row", "message"]) {
    assert.match(rules, new RegExp(`\\.files-bookmarks__${name}\\{[^}]*padding:0 11\\.5px`), `the ${name} has no gutter`);
  }
});

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

test("a remove keeps the path that another view added after its read", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const [remove] = findAll(globalThis.document.body, (element) => element.dataset.command === "files.bookmarks.remove");
  assert.ok(remove, "the remove button of the first row names its path");
  afterRead = ["src/main.go", "readme.md", "added.txt"];
  remove.click();
  await settle();
  assert.deepEqual(view.store.bookmarks, ["readme.md", "added.txt"]);
  assert.deepEqual(rowsOf(globalThis.document.body).length, 2);
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

test("the bookmarks status sends its current value as a changed event with version 1 when a watch starts", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const watch = sendExposureRequest(view.host, SURFACE, "status.watch", { name: "files.bookmarks" });
  await settle();
  assert.deepEqual(replyOf(view.host, watch), { result: null });
  assert.deepEqual(changedOf(view.host, "files.bookmarks"), [{ name: "files.bookmarks", value: ["src/main.go", "readme.md"], version: 1 }]);
});

test("the bookmarks status sends the changed list as a changed event when a remove changes it", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const watch = sendExposureRequest(view.host, SURFACE, "status.watch", { name: "files.bookmarks" });
  await settle();
  assert.deepEqual(replyOf(view.host, watch), { result: null });
  const [remove] = findAll(globalThis.document.body, (element) => element.dataset.params === JSON.stringify({ path: "src/main.go" }));
  remove.click();
  await settle();
  assert.deepEqual(changedOf(view.host, "files.bookmarks").at(-1), { name: "files.bookmarks", value: ["readme.md"], version: 2 });
});

test("the bookmark items and remove buttons are one provider each, which reads the rows drawn now", async () => {
  const view = await startBookmarks({ store: { bookmarks: ["src/main.go", "readme.md"] } });
  const { created } = await import("../build/test/sdk-models/expose.mjs");
  const elements = created.at(-1).elements;
  const registered = registeredEntries(view.host).filter((entry) => entry.kind === "element").map((entry) => entry.name);
  assert.equal(registered.filter((name) => name === "files.bookmarks.item").length, 1, "the item name is registered once");
  assert.equal(registered.filter((name) => name === "files.bookmarks.remove").length, 1, "the remove name is registered once");
  assert.equal(elements.get("files.bookmarks.item").length, 1, "one provider serves the item name");
  assert.equal(elements.get("files.bookmarks.remove").length, 1, "one provider serves the remove name");
  const items = () => elements.get("files.bookmarks.item")[0]();
  assert.deepEqual(items().map((row) => row.dataset.expose), ["files.bookmarks.item", "files.bookmarks.item"]);
  const [remove] = findAll(globalThis.document.body, (element) => element.dataset.params === JSON.stringify({ path: "src/main.go" }));
  assert.equal(remove.dataset.expose, "files.bookmarks.remove", "the remove button of the first row carries its name");
  remove.click();
  await settle();
  assert.equal(items().length, 1, "the removed row is not provided");
  assert.deepEqual(elements.get("files.bookmarks.remove")[0]().map((button) => button.dataset.params), [JSON.stringify({ path: "readme.md" })]);
  assert.equal(elements.get("files.bookmarks.item").length, 1, "a removal registers no provider");
  assert.deepEqual(view.host.errors, []);
});
