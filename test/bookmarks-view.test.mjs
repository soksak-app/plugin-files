// The bookmarks section view at the consumer boundary: the real page module ui/bookmarks.js runs in a view of the SDK test host. The page
// reads and writes the declared project data key bookmarks through runtime.data.get and runtime.data.change, and the other views of the
// project are the writes of the test host (change.data, and onDataRead for a write between a read and its replace). A remove press is
// relayed to the page's own command.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openView } from "@soksak/plugin-api/testing";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURFACE = "left/files.bookmarks";
const PROJECT = { id: "project-1", root: "/project" };
const PAGE = new URL("../ui/bookmarks.js", import.meta.url);
const plugin = JSON.parse(readFileSync(path.join(ROOT, "plugin.json"), "utf8"));

/**
 * Opens the bookmarks view in the host of the test and loads its page module. `stored` is the value of the key that the host serves
 * before any write (the declared default of the key); `onDataRead` runs after each read of the key by the view, and `faults` names the
 * routes that the host refuses with a message.
 */
async function openBookmarks(t, { stored = [], onDataRead = undefined, faults = undefined } = {}) {
  let view = null;
  // The plugin commands run through the page's own registrations, as the host relays them.
  const commands = Object.fromEntries(plugin.exposes.commands.map(({ name }) => [name, (params) => view.request(name, params)]));
  view = await openView("files", {
    host: {
      surface: SURFACE,
      declarations: plugin.exposes,
      project: PROJECT,
      commands,
      native: { exposureReply: () => null },
      data: {
        bookmarks: { schema: plugin.data.bookmarks.schema, default: stored },
        // Another key of the project: a change of it reaches the view and the page reads nothing.
        other: { schema: {}, default: null },
      },
      onDataRead,
      faults,
    },
    start: { surface: SURFACE, params: null, origin: { directory: null }, project: PROJECT, declarations: plugin.exposes, diagnostics: null,
      section: { id: "files.bookmarks", sidebar: "left", card: null } },
    declarations: plugin.exposes,
  });
  t.after(() => view.close());
  await view.load(PAGE);
  return view;
}

const rowsOf = (view) => view.window.document.querySelectorAll(".files-bookmarks__row");
const rowPaths = (view) => [...rowsOf(view)].map((row) => row.querySelector(".files-bookmarks__path").textContent);
const removeOf = (view, path) => view.window.document.querySelector(`[data-params='${JSON.stringify({ path })}']`);
const readsOf = (view) => view.calls.filter((call) => call.command === "runtime.data.get");
const countOf = (view, name) => view.registered("element").filter((entry) => entry === name).length;

let exposureRequests = 0;
/** One exposure request of the surface: the answer of the page is the payload of its exposureReply call, returned as {result} or {error}. */
async function exposure(view, method, params) {
  const id = `probe-${++exposureRequests}`;
  view.push("exposure-request", { id, surface: SURFACE, method, params });
  await view.settled();
  const reply = view.calls.findLast((call) => call.command === "runtime.native.call" && call.params.name === "exposureReply" && call.params.payload.id === id);
  assert.ok(reply, `the page did not answer ${method} ${id}`);
  const { id: _id, ...answer } = reply.params.payload;
  return answer;
}
// The payloads {name, value, version} of the changed calls of the page for the status name, in order.
const changedOf = (view, name) => view.calls
  .filter((call) => call.command === "runtime.native.call" && call.params.name === "changed" && call.params.payload.name === name)
  .map((call) => call.params.payload);
// The style of the first rule of the adopted sheets whose selector is `selector`.
const styleOf = (view, selector) => {
  for (const sheet of view.window.document.adoptedStyleSheets) {
    for (const rule of sheet.cssRules) if (rule.selectorText === selector) return rule.style;
  }
  return null;
};

// A web view shows its default serif text of 16px unless the page states the text of the sidebar.
for (const page of ["tree.html", "bookmarks.html"]) {
  test(`${page} states the text of the sidebar on its body`, () => {
    const text = readFileSync(path.join(ROOT, "ui", page), "utf8");
    assert.match(text, /body \{[^}]*font: 12px\/1\.4 var\(--font\)/, `${page} states no font on its body`);
    assert.match(text, /body \{[^}]*color: var\(--fg\)/, `${page} states no text color on its body`);
  });
}

test("the rows and the message of the bookmarks view start at the gutter of the tree title", async (t) => {
  const view = await openBookmarks(t);
  for (const name of ["row", "message"]) {
    // The style of the sheet serializes the length 0 as 0px, which is the declared padding 0 11.5px.
    assert.equal(styleOf(view, `.files-bookmarks__${name}`).getPropertyValue("padding"), "0px 11.5px", `the ${name} has no gutter`);
  }
});

test("the bookmarks view reads the stored bookmarks of the project and draws one row for each", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go", "readme.md"] });
  assert.deepEqual(readsOf(view).map((call) => call.params), [{ key: "bookmarks" }]);
  assert.deepEqual(rowPaths(view), ["src/main.go", "readme.md"]);
  assert.deepEqual(view.observed.errors, []);
});

test("the remove button writes the key without the removed path", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go", "readme.md"] });
  const remove = removeOf(view, "src/main.go");
  assert.ok(remove, "the remove button of the first row names its path");
  remove.click();
  await view.settled();
  assert.deepEqual(view.observed.data.at(-1), { key: "bookmarks", value: ["readme.md"] });
  assert.deepEqual(rowPaths(view), ["readme.md"]);
  assert.deepEqual(view.observed.errors, []);
});

test("a remove keeps the path that another view added after its read", async (t) => {
  // The second read is the read of the remove. The other view writes the key after it, so the replace of the page finds another value.
  const view = await openBookmarks(t, { stored: ["src/main.go", "readme.md"], onDataRead: (key, reads, write) => {
    if (key === "bookmarks" && reads === 2) write(["src/main.go", "readme.md", "added.txt"]);
  } });
  removeOf(view, "src/main.go").click();
  await view.settled();
  assert.deepEqual(view.observed.data.at(-1), { key: "bookmarks", value: ["readme.md", "added.txt"] });
  assert.deepEqual(rowPaths(view), ["readme.md", "added.txt"]);
  assert.deepEqual(view.observed.errors, []);
});

test("a read that fails is reported to the error line of the view", async (t) => {
  const view = await openBookmarks(t, { faults: { "command.runtime.data.get": "stored bookmarks are unreadable" } });
  assert.deepEqual(view.observed.errors, [`surface ${SURFACE} files bookmarks: stored bookmarks are unreadable`]);
  assert.deepEqual(rowPaths(view), [], "the list is not drawn from a failed read");
});

test("a read of a stored value that is not a list of paths is reported to the error line of the view", async (t) => {
  const view = await openBookmarks(t, { stored: "unreadable" });
  assert.deepEqual(view.observed.errors, [`surface ${SURFACE} files bookmarks: the stored bookmarks are not a list of paths`]);
  assert.deepEqual(rowPaths(view), [], "the list is not drawn from the stored value");
});

test("the bookmarks view re-reads the bookmarks when the project data of the key changes", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go"] });
  assert.deepEqual(view.calls.filter((call) => call.command === "runtime.data.on").length, 1);
  view.change.data("bookmarks", ["src/main.go", "readme.md"]);
  await view.settled();
  // The page reads the key again and draws it, so a bookmark that another view stored is drawn.
  assert.equal(readsOf(view).length, 2);
  assert.deepEqual(rowPaths(view), ["src/main.go", "readme.md"]);
  assert.deepEqual(view.observed.errors, []);
});

test("a change of another project data key does not re-read the bookmarks", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go"] });
  const readsBefore = readsOf(view).length;
  view.change.data("other", "changed");
  await view.settled();
  assert.equal(readsOf(view).length, readsBefore);
});

test("the bookmarks status reports the bookmark paths in stored order", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go", "readme.md"] });
  assert.deepEqual(await exposure(view, "status.get", { name: "files.bookmarks" }), { result: ["src/main.go", "readme.md"] });
  assert.ok(view.registered("status").includes("files.bookmarks"));
});

test("the bookmarks status sends its current value as a changed event with version 1 when a watch starts", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go", "readme.md"] });
  assert.deepEqual(await exposure(view, "status.watch", { name: "files.bookmarks" }), { result: null });
  assert.deepEqual(changedOf(view, "files.bookmarks"), [{ name: "files.bookmarks", value: ["src/main.go", "readme.md"], version: 1 }]);
});

test("the bookmarks status sends the changed list as a changed event when a remove changes it", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go", "readme.md"] });
  assert.deepEqual(await exposure(view, "status.watch", { name: "files.bookmarks" }), { result: null });
  removeOf(view, "src/main.go").click();
  await view.settled();
  assert.deepEqual(changedOf(view, "files.bookmarks").at(-1), { name: "files.bookmarks", value: ["readme.md"], version: 2 });
});

test("the bookmark items and remove buttons are one provider each, which reads the rows drawn now", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go", "readme.md"] });
  assert.equal(countOf(view, "files.bookmarks.item"), 1, "the item name is registered once");
  assert.equal(countOf(view, "files.bookmarks.remove"), 1, "the remove name is registered once");
  assert.deepEqual([...rowsOf(view)].map((row) => row.dataset.expose), ["files.bookmarks.item", "files.bookmarks.item"]);
  // The providers answer the rows drawn now: each index answers, and the index after the last row has no element.
  for (const name of ["files.bookmarks.item", "files.bookmarks.remove"]) {
    for (const index of [0, 1]) assert.equal((await exposure(view, "element.rect", { name, index })).error, undefined, `${name} ${index}`);
    assert.equal((await exposure(view, "element.rect", { name, index: 2 })).error?.message, `element ${name} has no element at index 2`);
  }
  const remove = removeOf(view, "src/main.go");
  assert.equal(remove.dataset.expose, "files.bookmarks.remove", "the remove button of the first row carries its name");
  remove.click();
  await view.settled();
  assert.equal(rowsOf(view).length, 1, "the removed row is not drawn");
  assert.equal((await exposure(view, "element.rect", { name: "files.bookmarks.item", index: 1 })).error?.message,
    "element files.bookmarks.item has no element at index 1", "the removed row is not provided");
  assert.equal(removeOf(view, "readme.md").dataset.expose, "files.bookmarks.remove");
  assert.equal(countOf(view, "files.bookmarks.item"), 1, "a removal registers no provider");
  assert.deepEqual(view.observed.errors, []);
});
