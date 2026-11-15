// The bookmarks section view at the plugin boundary: the real page module ui/bookmarks.js runs in a window of the test process
// (test/fixtures/page.mjs), and its calls to the plugin API are recorded by the fixture of test/fixtures/plugin-api. The page reads and
// writes the declared project data key bookmarks through runtime.data.get and runtime.data.change, and the other views of the project are
// the writes of the test (change.data, and the answer of runtime.data.change for a write between the read and the change). A remove press runs the page's own command.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openPage } from "./fixtures/page.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURFACE = "left/files.bookmarks";
const PROJECT = { id: "project-1", root: "/project" };
const PAGE = new URL("../ui/bookmarks.js", import.meta.url);
const plugin = JSON.parse(readFileSync(path.join(ROOT, "plugin.json"), "utf8"));

/**
 * Opens the bookmarks view and loads its page module. `stored` is the value of the key before any write (the declared default of the key);
 * `faults` maps a plugin API call to the error that the test answers it with.
 */
async function openBookmarks(t, { stored = [], faults = {} } = {}) {
  const view = await openPage(PAGE, {
    start: { surface: SURFACE, params: null, origin: { directory: null }, project: PROJECT, declarations: plugin.exposes, diagnostics: null,
      section: { id: "files.bookmarks", sidebar: "left", card: null } },
    // Another key of the project: a change of it reaches the view and the page reads nothing.
    store: { bookmarks: stored, other: null },
    answers: faults,
  });
  t.after(() => view.close());
  assert.equal(view.failure, null, String(view.failure?.message));
  return view;
}

const rowsOf = (view) => view.window.document.querySelectorAll(".files-bookmarks__row");
const rowPaths = (view) => [...rowsOf(view)].map((row) => row.querySelector(".files-bookmarks__path").textContent);
const removeOf = (view, path) => view.window.document.querySelector(`[data-params='${JSON.stringify({ path })}']`);
const readsOf = (view) => view.calls.filter((call) => call.method === "runtime.data.get");
const countOf = (view, name) => view.registered("element").filter((entry) => entry === name).length;
// The errors that the page reported through its error call, as {where, text}.
const errorsOf = (view) => view.calls.filter((call) => call.method === "runtime.error").map((call) => call.args);

let exposureRequests = 0;
/** One exposure request of the surface: the answer of the page is the payload of its exposure.reply call, returned as {result} or {error}. */
async function exposure(view, method, params) {
  const id = `probe-${++exposureRequests}`;
  view.push("exposure-request", { id, surface: SURFACE, method, params });
  await view.settled();
  const reply = view.calls.findLast((call) => call.method === "exposure.reply" && call.args.id === id);
  assert.ok(reply, `the page did not answer ${method} ${id}`);
  const { id: _id, ...answer } = reply.args;
  return answer;
}
// The payloads {name, value, version} of the changed calls of the page for the status name, in order.
const changedOf = (view, name) => view.calls
  .filter((call) => call.method === "exposure.changed" && call.args.name === name)
  .map((call) => call.args);
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
  assert.deepEqual(readsOf(view).map((call) => call.args), [{ key: "bookmarks" }]);
  assert.deepEqual(rowPaths(view), ["src/main.go", "readme.md"]);
  assert.deepEqual(errorsOf(view), []);
});

test("the remove button writes the key without the removed path", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go", "readme.md"] });
  const remove = removeOf(view, "src/main.go");
  assert.ok(remove, "the remove button of the first row names its path");
  remove.click();
  await view.settled();
  assert.deepEqual(view.calls.findLast((call) => call.method === "runtime.data.change").args.key, "bookmarks");
  assert.deepEqual(view.stored("bookmarks"), ["readme.md"]);
  assert.deepEqual(rowPaths(view), ["readme.md"]);
  assert.deepEqual(errorsOf(view), []);
});

test("a remove keeps the path that another view added after its read", async (t) => {
  // The page's change of the key is answered by the test: another view writes the key before the change applies its updater, so the
  // updater applies to the value of that write, and the change stores the value of the updater.
  let view = null;
  const answers = { "runtime.data.change": ({ key, update }) => {
    view.change.data(key, ["src/main.go", "readme.md", "added.txt"]);
    const next = update(view.stored(key));
    view.change.data(key, next);
    return next;
  } };
  view = await openPage(PAGE, {
    start: { surface: SURFACE, params: null, origin: { directory: null }, project: PROJECT, declarations: plugin.exposes, diagnostics: null,
      section: { id: "files.bookmarks", sidebar: "left", card: null } },
    store: { bookmarks: ["src/main.go", "readme.md"], other: null },
    answers,
  });
  t.after(() => view.close());
  assert.equal(view.failure, null, String(view.failure?.message));
  removeOf(view, "src/main.go").click();
  await view.settled();
  assert.deepEqual(view.stored("bookmarks"), ["readme.md", "added.txt"]);
  assert.deepEqual(rowPaths(view), ["readme.md", "added.txt"]);
  assert.deepEqual(errorsOf(view), []);
});

test("a read that fails is reported to the error call of the view", async (t) => {
  const view = await openBookmarks(t, { faults: { "runtime.data.get": new Error("stored bookmarks are unreadable") } });
  assert.deepEqual(errorsOf(view), [{ where: "files bookmarks", text: "stored bookmarks are unreadable" }]);
  assert.deepEqual(rowPaths(view), [], "the list is not drawn from a failed read");
});

test("a read of a stored value that is not a list of paths is reported to the error call of the view", async (t) => {
  const view = await openBookmarks(t, { stored: "unreadable" });
  assert.deepEqual(errorsOf(view), [{ where: "files bookmarks", text: "the stored bookmarks are not a list of paths" }]);
  assert.deepEqual(rowPaths(view), [], "the list is not drawn from the stored value");
});

test("a read that draws an empty list after a failed read shows the empty text, and the error line is not kept", async (t) => {
  const view = await openBookmarks(t, { stored: "unreadable" });
  const message = view.window.document.querySelector(".files-bookmarks__message");
  const error = { where: "files bookmarks", text: "the stored bookmarks are not a list of paths" };
  assert.deepEqual(errorsOf(view), [error]);
  // The stored value becomes an empty list, which the next read draws: the message line states the empty list, not the error of the earlier read.
  view.change.data("bookmarks", []);
  await view.settled();
  assert.deepEqual(rowPaths(view), []);
  assert.equal(message.textContent, "북마크 없음");
  assert.equal(message.hidden, false);
  assert.deepEqual(errorsOf(view), [error]);
});

test("the bookmarks view re-reads the bookmarks when the project data of the key changes", async (t) => {
  const view = await openBookmarks(t, { stored: ["src/main.go"] });
  assert.deepEqual(view.calls.filter((call) => call.method === "runtime.data.on").length, 1);
  view.change.data("bookmarks", ["src/main.go", "readme.md"]);
  await view.settled();
  // The page reads the key again and draws it, so a bookmark that another view stored is drawn.
  assert.equal(readsOf(view).length, 2);
  assert.deepEqual(rowPaths(view), ["src/main.go", "readme.md"]);
  assert.deepEqual(errorsOf(view), []);
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
  // The providers answer the rows drawn now: each provider lists one element per drawn row.
  for (const name of ["files.bookmarks.item", "files.bookmarks.remove"]) {
    assert.equal((await exposure(view, "element.elements", { name })).result.length, 2, name);
  }
  const remove = removeOf(view, "src/main.go");
  assert.equal(remove.dataset.expose, "files.bookmarks.remove", "the remove button of the first row carries its name");
  remove.click();
  await view.settled();
  assert.equal(rowsOf(view).length, 1, "the removed row is not drawn");
  assert.equal((await exposure(view, "element.elements", { name: "files.bookmarks.item" })).result.length, 1, "the removed row is not provided");
  assert.equal(removeOf(view, "readme.md").dataset.expose, "files.bookmarks.remove");
  assert.equal(countOf(view, "files.bookmarks.item"), 1, "a removal registers no provider");
  assert.deepEqual(errorsOf(view), []);
});
