// The state module of files: the bookmarks status and its commands, and the record of a failure to open a file.
// The tree is served by the plugin host page (test/host-runtime.test.mjs).
import assert from "node:assert/strict";
import test from "node:test";

/** A fake context of the state module. */
function fakeContext() {
  const statuses = new Map();
  const commands = new Map();
  const stored = {};
  const logged = [];
  // The context holds the declared sidecar of the plugin, which the state module does not use; its replies are empty.
  let reply = null;
  const sidecar = {
    on: async (fn) => { reply = fn; },
    send: async (body) => { queueMicrotask(() => reply({ id: body.id, entries: [] })); },
  };
  const log = Object.fromEntries(["error", "warn", "info", "debug", "trace"].map((level) => [level, (event, fields) => logged.push({ level, event, fields })]));
  const context = {
    runtime: { log },
    sidecar,
    project: { id: "p1", root: "/work/p1" },
    exposure: {
      status: (name, read, subscribe) => statuses.set(name, { read, subscribe }),
      command: (name, run) => commands.set(name, run),
    },
    data: {
      get: (key) => structuredClone(stored[key] ?? []),
      set: async (key, value) => { stored[key] = value; },
    },
  };
  return { context, statuses, commands, stored, logged };
}

function bookmarkPaths(value) {
  return value.elements.find((element) => element.kind === "list").items.map((item) => item.params.path);
}

test("the state module declares the bookmarks status and no tree status or tree command", async () => {
  const f = fakeContext();
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  assert.deepEqual([...f.statuses.keys()], ["files.bookmarks"]);
  assert.deepEqual([...f.commands.keys()], ["files.open.failed", "files.bookmarks.add", "files.bookmarks.remove"]);
});

test("bookmarks are stored as project data, kept unique, and removed", async () => {
  const f = fakeContext();
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  const bookmarks = () => f.statuses.get("files.bookmarks").read();
  assert.deepEqual(bookmarkPaths(bookmarks()), []);
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  await f.commands.get("files.bookmarks.add")({ path: "src" });
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  assert.deepEqual(bookmarkPaths(bookmarks()), ["a.txt", "src"]);
  assert.deepEqual(f.stored.bookmarks, ["a.txt", "src"]);
  await f.commands.get("files.bookmarks.remove")({ path: "a.txt" });
  assert.deepEqual(bookmarkPaths(bookmarks()), ["src"]);
  await assert.rejects(f.commands.get("files.bookmarks.remove")({ path: "none" }), /none is not bookmarked/);
});

test("the failure to open a file is a warning event, and an empty error is refused", async () => {
  const f = fakeContext();
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  await f.commands.get("files.open.failed")({ error: "no plugin opens a.txt" });
  assert.deepEqual(f.logged.find((entry) => entry.event === "open.failed"), { level: "warn", event: "open.failed", fields: { error: "no plugin opens a.txt" } });
  await assert.rejects(f.commands.get("files.open.failed")({ error: "" }), /requires error, a non-empty string/);
  await assert.rejects(f.commands.get("files.open.failed")({}), /requires error, a non-empty string/);
});

test("the result of a command is an event with its time and, when it failed, its error", async () => {
  const f = fakeContext();
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  await assert.rejects(f.commands.get("files.bookmarks.remove")({ path: "b.txt" }), /b.txt is not bookmarked/);
  const results = f.logged.filter((entry) => entry.event === "command");
  assert.deepEqual(results.map((entry) => [entry.level, entry.fields.name, entry.fields.ok]),
    [["debug", "files.bookmarks.add", true], ["warn", "files.bookmarks.remove", false]]);
  assert.ok(results.every((entry) => Number.isInteger(entry.fields.micros) && entry.fields.micros >= 0));
  assert.equal(results[1].fields.error, "-32000: b.txt is not bookmarked");
  assert.equal(results[0].fields.error, undefined);
});
