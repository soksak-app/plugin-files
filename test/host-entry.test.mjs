import assert from "node:assert/strict";
import test from "node:test";

import { startFilesHost } from "../ui/host-entry.js";

// A view bridge with the methods of the host adapter, and the calls it receives.
function fakeBridge() {
  const calls = [];
  const nativeListeners = new Map();
  const bridge = {
    calls: {
      request: async (command, params) => {
        calls.push({ kind: "request", command, params });
        if (command === "runtime.data.get") return ["a.txt"];
        return null;
      },
    },
    runtime: {
      log: Object.fromEntries(["error", "warn", "info", "debug", "trace"].map((level) => [level, (event, fields) => { calls.push({ kind: "log", level, event, fields }); }])),
      sidecar: (name) => ({ name }),
      native: { on: (name, listener) => {
        calls.push({ kind: "native.on", name });
        nativeListeners.set(name, listener);
        return () => nativeListeners.delete(name);
      } },
      error: async (where, text) => { calls.push({ kind: "error", where, text }); },
      command: async (name, params) => { calls.push({ kind: "core", name, params }); },
    },
    snapshots: { push: (status, value) => { calls.push({ kind: "snapshot", status, value }); } },
    commands: { register: async (name, run) => { calls.push({ kind: "command", name }); return run; } },
  };
  return { bridge, calls, nativeListeners };
}

test("host entry mounts the runtime with the page of the bridge, the status adapter and the page project", async () => {
  const { bridge } = fakeBridge();
  const expose = { status: async () => {} };
  const start = { project: { id: "project-a", root: "/work/a" }, declarations: {} };
  const calls = [];
  const mounted = { dispose() {} };
  const result = await startFilesHost({ bridge, expose, start, mount: async (options) => { calls.push(options); return mounted; } });
  assert.equal(result, mounted);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].project, start.project);
  assert.equal(typeof calls[0].page.sidecar, "function");
  assert.equal(typeof calls[0].page.report, "function");
  assert.equal(typeof calls[0].page.open, "function");
  assert.equal(typeof calls[0].expose.status, "function");
  assert.equal(typeof calls[0].expose.command, "function");
});

test("the page opens a file through the core command, and reports errors through the error route", async () => {
  const { bridge, calls } = fakeBridge();
  let options;
  await startFilesHost({ bridge, expose: { status: async () => {} }, start: { project: null }, mount: async (value) => { options = value; } });
  await options.page.open("readme.md");
  await options.page.report({ level: "error", where: "files tree", text: "listing failed" });
  assert.deepEqual(calls, [
    { kind: "core", name: "core.file.open", params: { path: "readme.md" } },
    { kind: "error", where: "files tree", text: "listing failed" },
  ]);
  assert.throws(() => options.page.report({ level: "warn", where: "files tree", text: "x" }), /reports only errors/);
});

test("the host page subscribes to declared tree expansion through the native event bridge", async () => {
  const { bridge, calls, nativeListeners } = fakeBridge();
  let options;
  await startFilesHost({ bridge, expose: { status: async () => {} }, start: { project: null }, mount: async (value) => { options = value; } });
  const received = [];
  const stop = await options.page.onTreeExpanded((event) => received.push(event));
  const event = { status: "tree", tree: "files", path: ["stable-key"], expanded: true };
  nativeListeners.get("declared-ui.expanded")(event);
  assert.deepEqual(received, [event]);
  assert.deepEqual(calls.filter(({ kind }) => kind === "native.on"), [{ kind: "native.on", name: "declared-ui.expanded" }]);
  stop();
  assert.equal(nativeListeners.has("declared-ui.expanded"), false);
});

test("a declared status is registered, its first value is pushed, and each later value is pushed", async () => {
  const { bridge, calls } = fakeBridge();
  const registered = [];
  const expose = { status: async (name, read, subscribe) => { registered.push(name); subscribe((value) => calls.push({ kind: "watched", value })); } };
  let options;
  await startFilesHost({ bridge, expose, start: { project: null }, mount: async (value) => { options = value; } });
  let current = { n: 1 };
  await options.expose.status("files.tree", () => current, (fn) => { fn; return () => {}; });
  assert.deepEqual(registered, ["files.tree"]);
  assert.deepEqual(calls.filter((call) => call.kind === "snapshot"), [{ kind: "snapshot", status: "tree", value: { n: 1 } }]);
  await options.expose.command("files.refresh", () => null);
  assert.deepEqual(calls.filter((call) => call.kind === "command"), [{ kind: "command", name: "files.refresh" }]);
});

test("plugin host snapshots use plugin-local status names", async () => {
  const { bridge, calls } = fakeBridge();
  const registered = [];
  const expose = { status: async (name) => { registered.push(name); } };
  const listeners = new Map();
  let options;
  await startFilesHost({ bridge, expose, start: { project: null }, mount: async (value) => { options = value; } });

  for (const [name, local] of [["files.tree", "tree"], ["files.bookmarks", "bookmarks"]]) {
    let current = { name, revision: 1 };
    await options.expose.status(name, () => current, (listener) => {
      listeners.set(name, listener);
      return () => listeners.delete(name);
    });
    current = { name, revision: 2 };
    listeners.get(name)(current);
    assert.deepEqual(calls.filter((call) => call.kind === "snapshot" && call.value.name === name), [
      { kind: "snapshot", status: local, value: { name, revision: 1 } },
      { kind: "snapshot", status: local, value: { name, revision: 2 } },
    ]);
  }
  assert.deepEqual(registered, ["files.tree", "files.bookmarks"]);
});

test("host entry rejects missing or invalid bridge, exposure, start values and mount function", async () => {
  const mount = async () => assert.fail("mount must not run");
  const start = { project: null };
  const bridge = fakeBridge().bridge;
  for (const [input, message] of [
    [{ expose: {}, start, mount }, /requires the view bridge/],
    [{ bridge: null, expose: {}, start, mount }, /requires the view bridge/],
    [{ bridge, start, mount }, /requires the exposure/],
    [{ bridge, expose: null, start, mount }, /requires the exposure/],
    [{ bridge, expose: {}, mount }, /requires the start values/],
    [{ bridge, expose: {}, start, mount: null }, /requires a mount function/],
  ]) {
    await assert.rejects(startFilesHost(input), message);
  }
});

test("the page reads and writes the bookmarks through the project data calls, and records its events through runtime.log", async () => {
  const { bridge, calls } = fakeBridge();
  let options;
  await startFilesHost({ bridge, expose: { status: async () => {} }, start: { project: null }, mount: async (value) => { options = value; } });
  assert.deepEqual(await options.page.data.get("bookmarks"), ["a.txt"]);
  await options.page.data.set("bookmarks", ["b.txt"]);
  options.page.emit("warn", "plugin.files.open.failed", { error: "no plugin opens a.txt" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.filter((call) => call.kind === "request"), [
    { kind: "request", command: "runtime.data.get", params: { key: "bookmarks" } },
    { kind: "request", command: "runtime.data.set", params: { key: "bookmarks", value: ["b.txt"] } },
  ]);
  // The records go through the log of the bridge, which stores them as plugin.files.<event>, as the views do.
  assert.deepEqual(calls.filter((call) => call.kind === "log"), [{ kind: "log", level: "warn", event: "open.failed", fields: { error: "no plugin opens a.txt" } }]);
});

test("the page passes the project message to the runtime through runtime.project, not as a native event", async () => {
  const { bridge, calls } = fakeBridge();
  const projects = [];
  bridge.runtime.project = (listener) => { projects.push(listener); return { ready: Promise.resolve(), dispose: Promise.resolve(() => {}) }; };
  let options;
  await startFilesHost({ bridge, expose: { status: async () => {} }, start: { project: null }, mount: async (value) => { options = value; } });
  options.page.onProject((project) => calls.push({ kind: "project", project }));
  assert.equal(projects.length, 1, "the project message is not subscribed through runtime.project");
  projects[0]({ id: "project-b", root: "/work/b" });
  assert.deepEqual(calls.at(-1), { kind: "project", project: { id: "project-b", root: "/work/b" } });
});
