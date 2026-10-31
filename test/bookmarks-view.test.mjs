// The bookmarks section view at the consumer boundary: the page runs over a fake view window and reads and writes the declared
// project data key bookmarks through runtime.data.get and runtime.data.set. A remove press is relayed to the page's command.
import assert from "node:assert/strict";
import test from "node:test";
import { findAll, installViewWindow, settle } from "./fixtures/view-host.mjs";

const PROJECT = { id: "project-1", root: "/project" };
let caseNumber = 0;

async function startBookmarks({ store = { bookmarks: [] }, dataFault = null }) {
  const start = {
    surface: "left/files.bookmarks",
    params: null,
    origin: { directory: null },
    project: PROJECT,
    declarations: {},
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
