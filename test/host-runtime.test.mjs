import assert from "node:assert/strict";
import test from "node:test";

import { mountFilesHost } from "../ui/host-runtime.js";

function fakeHost({ treeSnapshots, project = { id: "project-a", root: "/work/project" }, stored = {} } = {}) {
  const calls = [];
  const emitted = [];
  const data = {
    store: stored,
    async get(key) { calls.push({ kind: "data.get", key }); return structuredClone(this.store[key] ?? []); },
    async set(key, value) { calls.push({ kind: "data.set", key, value: structuredClone(value) }); this.store[key] = structuredClone(value); return null; },
  };
  const statuses = new Map();
  const commands = new Map();
  const errors = [];
  const opened = [];
  let message;
  let failure;
  let index = 0;
  const sidecar = {
    async on(session, fn) { calls.push({ kind: "on", session }); message = fn; },
    async onFailure(session, fn) { calls.push({ kind: "onFailure", session }); failure = fn; },
    async send(session, body, cids) {
      calls.push({ kind: "send", session, body, cids });
      const tree = treeSnapshots[index++];
      queueMicrotask(() => message({ id: body.id, ...(tree instanceof Error ? { error: tree.message } : { tree }) }));
    },
  };
  const page = {
    project,
    sidecar(name) { calls.push({ kind: "sidecar", name }); return sidecar; },
    async report(record) { errors.push(record); },
    async open(path) { opened.push(path); },
    data,
    emit(level, name, fields) { emitted.push({ level, name, fields }); },
  };
  const expose = {
    async status(name, read, subscribe) { statuses.set(name, { read, subscribe }); },
    async command(name, run) { commands.set(name, run); },
  };
  return { page, expose, calls, statuses, commands, errors, opened, emitted, data, message: () => message, failure: () => failure };
}

const snapshot = (entries, selected = null, generation = 1) => ({ generation, entries, selected });

test("host page subscribes before snapshot and registers the declared tree status and commands", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([
    { path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false },
    { path: "readme.md", name: "readme.md", directory: false, depth: 0, expanded: false, selected: false },
  ])] });
  const host = await mountFilesHost(f);
  const sidecarCalls = f.calls.filter(({ kind }) => !kind.startsWith("data."));
  assert.deepEqual(sidecarCalls.slice(0, 2).map(({ kind }) => kind), ["sidecar", "on"]);
  assert.ok(sidecarCalls.findIndex(({ kind }) => kind === "onFailure") < sidecarCalls.findIndex(({ kind }) => kind === "send"));
  const send = f.calls.find(({ kind }) => kind === "send");
  assert.equal(send.session, "plugin:files:project-a:@soksak/sidecar-files");
  assert.equal(send.body.operation, "snapshot");
  assert.equal(f.statuses.has("files.tree"), true);
  assert.deepEqual([...f.commands.keys()], ["files.refresh", "files.tree.toggle", "files.select", "files.open", "files.bookmarks.add", "files.bookmarks.remove", "files.open.failed"]);
  const value = f.statuses.get("files.tree").read();
  assert.equal(value.elements.find((element) => element.kind === "status-line").text, "/work/project");
  assert.deepEqual(value.elements.find((element) => element.kind === "tree").nodes.map((node) => node.label), ["src", "readme.md"]);
  host.dispose();
});

test("tree commands send sidecar operations with generation and publish each full snapshot", async () => {
  const f = fakeHost({ treeSnapshots: [
    snapshot([{ path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false }]),
    snapshot([
      { path: "src", name: "src", directory: true, depth: 0, expanded: true, selected: false },
      { path: "src/main.go", name: "main.go", directory: false, depth: 1, expanded: false, selected: false, detail: "modified" },
    ]),
    snapshot([
      { path: "src", name: "src", directory: true, depth: 0, expanded: true, selected: false },
      { path: "src/main.go", name: "main.go", directory: false, depth: 1, expanded: false, selected: true, detail: "modified" },
    ], "src/main.go"),
  ] });
  const host = await mountFilesHost(f);
  await f.commands.get("files.tree.toggle")({ path: "src" });
  await f.commands.get("files.select")({ path: "src/main.go" });
  const operations = f.calls.filter(({ kind }) => kind === "send").map(({ body }) => body);
  assert.deepEqual(operations.map(({ operation }) => operation), ["snapshot", "expand", "select"]);
  assert.deepEqual(operations[1], { operation: "expand", id: operations[1].id, generation: 1, path: "src" });
  assert.deepEqual(operations[2], { operation: "select", id: operations[2].id, generation: 1, path: "src/main.go" });
  const tree = f.statuses.get("files.tree").read().elements.find((element) => element.kind === "tree");
  assert.equal(tree.nodes[0].children[0].selected, true);
  assert.equal(tree.nodes[0].children[0].detail, "modified");
  host.dispose();
});

test("host reports sidecar reply errors without publishing an empty-tree success", async () => {
  const f = fakeHost({ treeSnapshots: [new Error("permission denied")] });
  const host = await mountFilesHost(f);
  assert.equal(f.errors[0].level, "error");
  assert.match(f.errors[0].text, /permission denied/);
  assert.equal(f.statuses.get("files.tree").read().elements.find((element) => element.kind === "tree").empty, "");
  host.dispose();
});

test("host publishes a snapshot whose label is over the text limit unchanged, without reporting an error", async () => {
  const label = "L".repeat(501);
  const f = fakeHost({ treeSnapshots: [snapshot([{ path: label, name: label, directory: false, depth: 0, expanded: false, selected: false }])] });
  const host = await mountFilesHost(f);
  assert.deepEqual(f.errors, []);
  const tree = f.statuses.get("files.tree").read().elements.find((element) => element.kind === "tree");
  assert.deepEqual(tree.nodes.map((node) => node.label), [label]);
  host.dispose();
});

test("host with no project publishes no-project value and does not contact the sidecar", async () => {
  const f = fakeHost({ project: null, treeSnapshots: [] });
  const host = await mountFilesHost(f);
  assert.equal(f.calls.some(({ kind }) => kind === "send"), false);
  assert.equal(f.statuses.get("files.tree").read().elements[0].text, "프로젝트 없음");
  host.dispose();
});

test("a file row of the tree carries the open command, and the open command opens that file through the page", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([
    { path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false },
    { path: "readme.md", name: "readme.md", directory: false, depth: 0, expanded: false, selected: false },
  ])] });
  const host = await mountFilesHost(f);
  const tree = f.statuses.get("files.tree").read().elements.find((element) => element.kind === "tree");
  const [directory, file] = tree.nodes;
  assert.equal(directory.open, undefined, "a folder row opens nothing");
  assert.equal(file.open, "files.open");
  assert.deepEqual(file.params, { path: "readme.md" });
  assert.equal(f.commands.has("files.open"), true, "files.open is not registered");
  await f.commands.get("files.open")({ path: "readme.md" });
  assert.deepEqual(f.opened, ["readme.md"]);
  host.dispose();
});

test("the bookmarks status is served by the host from the project data, and its commands change the data", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])], stored: { bookmarks: ["src"] } });
  const host = await mountFilesHost(f);
  assert.equal(f.statuses.has("files.bookmarks"), true, "files.bookmarks is not registered by the host");
  const bookmarks = () => f.statuses.get("files.bookmarks").read();
  const paths = (value) => value.elements.find((element) => element.kind === "list").items.map((item) => item.params.path);
  assert.deepEqual(paths(bookmarks()), ["src"]);
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  assert.deepEqual(f.data.store.bookmarks, ["src", "a.txt"]);
  assert.deepEqual(paths(bookmarks()), ["src", "a.txt"]);
  await f.commands.get("files.bookmarks.remove")({ path: "src" });
  assert.deepEqual(paths(bookmarks()), ["a.txt"]);
  await assert.rejects(f.commands.get("files.bookmarks.remove")({ path: "none" }), /none is not bookmarked/);
  assert.deepEqual([...f.commands.keys()].filter((name) => name.startsWith("files.bookmarks")), ["files.bookmarks.add", "files.bookmarks.remove"]);
  host.dispose();
});

test("each tree request, each change line and each failure of the sidecar is an event with its fields", async () => {
  const f = fakeHost({ treeSnapshots: [
    snapshot([{ path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false }]),
    new Error("cannot list expanded directory src: permission denied"),
  ] });
  const host = await mountFilesHost(f);
  const requests = f.emitted.filter((record) => record.name === "plugin.files.tree.request");
  assert.deepEqual(requests.map((record) => [record.level, record.fields.operation, record.fields.ok]), [["debug", "snapshot", true]]);
  assert.equal(Number.isInteger(requests[0].fields.micros) && requests[0].fields.micros >= 0, true);
  await assert.rejects(f.commands.get("files.tree.toggle")({ path: "src" }), /permission denied/);
  const failed = f.emitted.filter((record) => record.name === "plugin.files.tree.request" && record.fields.ok === false);
  assert.equal(failed.length, 1, "a failed tree request is not recorded");
  assert.equal(failed[0].level, "warn");
  assert.equal(typeof failed[0].fields.error, "string");
  f.message()({ changed: "src" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(f.emitted.filter((record) => record.name === "plugin.files.tree.changed").map((record) => [record.level, record.fields]), [["debug", { path: "src" }]]);
  f.failure()(new Error("watch broke"));
  assert.deepEqual(f.emitted.filter((record) => record.name === "plugin.files.tree.failed").map((record) => [record.level, record.fields]), [["warn", { error: "watch broke" }]]);
  host.dispose();
});

test("a command is recorded with its result, and a failure to open a file is recorded as a warning", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  const host = await mountFilesHost(f);
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  await assert.rejects(f.commands.get("files.bookmarks.remove")({ path: "b.txt" }), /b.txt is not bookmarked/);
  const results = f.emitted.filter((record) => record.name === "plugin.files.command");
  assert.deepEqual(results.map((record) => [record.level, record.fields.name, record.fields.ok]),
    [["debug", "files.bookmarks.add", true], ["warn", "files.bookmarks.remove", false]]);
  assert.equal(results[1].fields.error, "-32000: b.txt is not bookmarked");
  await f.commands.get("files.open.failed")({ error: "no plugin opens a.txt" });
  assert.deepEqual(f.emitted.filter((record) => record.name === "plugin.files.open.failed"), [{ level: "warn", name: "plugin.files.open.failed", fields: { error: "no plugin opens a.txt" } }]);
  await assert.rejects(f.commands.get("files.open.failed")({ error: "" }), /requires error, a non-empty string/);
  host.dispose();
});
