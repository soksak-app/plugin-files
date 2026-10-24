import assert from "node:assert/strict";
import test from "node:test";

import { mountFilesHost } from "../ui/host-runtime.js";

function fakeHost({ treeSnapshots, project = { id: "project-a", root: "/work/project" }, stored = {} } = {}) {
  const calls = [];
  const emitted = [];
  const data = {
    store: stored,
    failGet: null,
    failSet: null,
    async get(key) {
      calls.push({ kind: "data.get", key });
      if (this.failGet !== null) throw new Error(this.failGet);
      return structuredClone(this.store[key] ?? []);
    },
    async set(key, value) {
      calls.push({ kind: "data.set", key, value: structuredClone(value) });
      if (this.failSet !== null) throw new Error(this.failSet);
      this.store[key] = structuredClone(value);
      return null;
    },
  };
  const failures = { send: null, report: [] };
  const statuses = new Map();
  const commands = new Map();
  const errors = [];
  const opened = [];
  const messages = new Map();
  const sessionFailures = new Map();
  let message;
  let failure;
  let index = 0;
  const state = { hold: false, held: [] };
  const projectListeners = [];
  const sidecar = {
    async on(session, fn) { calls.push({ kind: "on", session }); messages.set(session, fn); message = fn; },
    async onFailure(session, fn) { calls.push({ kind: "onFailure", session }); sessionFailures.set(session, fn); failure = fn; },
    async send(session, body, cids) {
      calls.push({ kind: "send", session, body, cids });
      if (failures.send !== null) throw failures.send;
      const tree = treeSnapshots[index++];
      const reply = () => messages.get(session)?.({ id: body.id, ...(tree instanceof Error ? { error: tree.message } : { tree }) });
      if (state.hold) state.held.push(reply); else queueMicrotask(reply);
    },
  };
  const page = {
    project,
    sidecar(name) { calls.push({ kind: "sidecar", name }); return sidecar; },
    async report(record) {
      if (failures.report.length > 0) throw failures.report.shift();
      errors.push(record);
    },
    async open(path) { opened.push(path); },
    data,
    emit(level, name, fields) { emitted.push({ level, name, fields }); },
    onProject(listener) { projectListeners.push(listener); return () => {}; },
  };
  const expose = {
    async status(name, read, subscribe) { statuses.set(name, { read, subscribe }); },
    async command(name, run) { commands.set(name, run); },
  };
  // Delivers a project event to each subscribed listener, as the main page posts the event project to the plugin host.
  const emitProject = async (value) => {
    assert.ok(projectListeners.length > 0, "page.onProject is not subscribed");
    for (const listener of projectListeners) await listener(value);
  };
  return { page, expose, calls, statuses, commands, errors, opened, emitted, data, failures, state, emitProject,
    message: (session) => session === undefined ? message : messages.get(session),
    failure: (session) => session === undefined ? failure : sessionFailures.get(session) };
}

const snapshot = (entries, selected = null, generation = 1) => ({ generation, entries, selected });
// Waits until the replies that are already queued have run.
const settle = () => new Promise((resolve) => setImmediate(resolve));

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
  // The declared params do not mark path required, so the handler refuses a call without a string path.
  await assert.rejects(f.commands.get("files.open")({}), /files.open requires a path/);
  await assert.rejects(f.commands.get("files.open")({ path: 3 }), /files.open requires a path/);
  assert.deepEqual(f.opened, ["readme.md"], "a call without a string path opens nothing");
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

test("a bookmark list that cannot be read shows a notice beside an empty list, and a change does not overwrite the stored list", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])], stored: { bookmarks: ["src"] } });
  f.data.failGet = "data read failed";
  const host = await mountFilesHost(f);
  const value = f.statuses.get("files.bookmarks").read();
  assert.deepEqual(value.elements.map((element) => [element.kind, element.key]), [["status-line", "bookmarks-error"], ["list", "bookmarks"]]);
  assert.equal(value.elements[0].text, "북마크를 읽지 못했습니다.");
  assert.equal(value.elements[1].empty, "", "an unreadable list must not read as an empty list");
  await assert.rejects(f.commands.get("files.bookmarks.add")({ path: "a.txt" }), /data read failed/);
  assert.deepEqual(f.data.store.bookmarks, ["src"], "the stored list was changed while it could not be read");
  f.data.failGet = null;
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  assert.deepEqual(f.data.store.bookmarks, ["src", "a.txt"]);
  const recovered = f.statuses.get("files.bookmarks").read();
  assert.equal(recovered.elements.some((element) => element.kind === "status-line"), false);
  host.dispose();
});

test("a sidecar message that is not an object is reported, not dropped", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  const host = await mountFilesHost(f);
  f.message()("not an object");
  assert.equal(f.errors.at(-1).level, "error");
  assert.match(f.errors.at(-1).text, /sidecar message must be an object/);
  host.dispose();
});

test("a sidecar reply with an unknown request id is reported, not dropped", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  const host = await mountFilesHost(f);
  f.message()({ id: "files-999", tree: snapshot([]) });
  assert.match(f.errors.at(-1).text, /sidecar replied to unknown request files-999/);
  host.dispose();
});

test("a row whose selected or expanded member is not a boolean is refused, not read as false", async () => {
  const selected = fakeHost({ treeSnapshots: [snapshot([
    { path: "a.txt", name: "a.txt", directory: false, depth: 0, selected: "yes" },
  ])] });
  const hostA = await mountFilesHost(selected);
  assert.match(selected.errors[0].text, /invalid tree row/);
  hostA.dispose();
  const expanded = fakeHost({ treeSnapshots: [snapshot([
    { path: "src", name: "src", directory: true, depth: 0, expanded: "no", selected: false },
  ])] });
  const hostB = await mountFilesHost(expanded);
  assert.match(expanded.errors[0].text, /invalid tree row/);
  hostB.dispose();
});

test("a project object without a valid id or root is refused with an error, not treated as no project", async () => {
  await assert.rejects(mountFilesHost(fakeHost({ project: { root: "/work/project" }, treeSnapshots: [] })), /project to be null or an object with id and root/);
  await assert.rejects(mountFilesHost(fakeHost({ project: { id: "project-a" }, treeSnapshots: [] })), /project to be null or an object with id and root/);
});

test("a command failure that is not an Error keeps its text in the event and the error report", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  const host = await mountFilesHost(f);
  f.failures.send = "pipe closed";
  await assert.rejects(f.commands.get("files.refresh")(), (failure) => failure === "pipe closed");
  assert.equal(f.emitted.find((record) => record.name === "plugin.files.command" && record.level === "warn").fields.error, "-32000: pipe closed");
  assert.equal(f.errors.at(-1).text, "pipe closed");
  host.dispose();
});

test("a refused error report is written to the console and reported through the log route of the page", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  const host = await mountFilesHost(f);
  const logged = [];
  const consoleError = console.error;
  console.error = (line) => logged.push(line);
  try {
    f.failures.report.push("error route refused");
    f.failures.send = "pipe closed";
    await assert.rejects(f.commands.get("files.refresh")(), (failure) => failure === "pipe closed");
  } finally {
    console.error = consoleError;
  }
  assert.deepEqual(f.errors.map((record) => [record.where, record.text]), [["log", "error route refused"]]);
  assert.match(logged[0], /files host could not report an error: error route refused/);
  host.dispose();
});

test("a project event moves the tree and the sidecar session to the project that the window shows now", async () => {
  const f = fakeHost({ treeSnapshots: [
    snapshot([{ path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false }]),
    snapshot([{ path: "docs", name: "docs", directory: true, depth: 0, expanded: false, selected: false }]),
  ] });
  const host = await mountFilesHost(f);
  await f.emitProject({ id: "project-b", root: "/work/b" });
  await settle();
  assert.equal(f.statuses.get("files.tree").read().elements[0].text, "/work/b");
  const sends = f.calls.filter(({ kind }) => kind === "send");
  assert.equal(sends[sends.length - 1].session, "plugin:files:project-b:@soksak/sidecar-files");
  const tree = f.statuses.get("files.tree").read().elements.find((element) => element.kind === "tree");
  assert.deepEqual(tree.nodes.map((node) => node.label), ["docs"]);
  host.dispose();
});

test("a project event null shows no project and sends nothing to the sidecar", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([{ path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false }])] });
  const host = await mountFilesHost(f);
  const sendsBefore = f.calls.filter(({ kind }) => kind === "send").length;
  await f.emitProject(null);
  assert.equal(f.statuses.get("files.tree").read().elements[0].text, "프로젝트 없음");
  assert.equal(await f.commands.get("files.refresh")(), null);
  assert.equal(f.calls.filter(({ kind }) => kind === "send").length, sendsBefore);
  assert.deepEqual(f.errors, []);
  host.dispose();
});

test("previous sidecar callbacks are ignored after the project becomes null", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([{ path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false }])] });
  const host = await mountFilesHost(f);
  const previousSession = "plugin:files:project-a:@soksak/sidecar-files";
  const previousMessage = f.message(previousSession);
  const previousFailure = f.failure(previousSession);
  assert.equal(typeof previousMessage, "function");
  assert.equal(typeof previousFailure, "function");
  await f.emitProject(null);
  assert.doesNotThrow(() => previousMessage({ changed: "src" }));
  assert.doesNotThrow(() => previousFailure(new Error("the closed project watch failed")));
  await settle();
  assert.equal(f.statuses.get("files.tree").read().elements[0].text, "프로젝트 없음");
  assert.deepEqual(f.emitted.filter(({ name }) => name === "plugin.files.tree.changed" || name === "plugin.files.tree.failed"), []);
  assert.deepEqual(f.errors, []);
  host.dispose();
});

test("a reply to a request of the previous project is dropped and does not reach the tree of the current project", async () => {
  const f = fakeHost({ treeSnapshots: [
    snapshot([{ path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false }]),
    snapshot([{ path: "late", name: "late", directory: true, depth: 0, expanded: false, selected: false }]),
    snapshot([{ path: "docs", name: "docs", directory: true, depth: 0, expanded: false, selected: false }]),
  ] });
  const host = await mountFilesHost(f);
  f.state.hold = true;
  const refresh = f.commands.get("files.refresh")();
  await f.emitProject({ id: "project-b", root: "/work/b" });
  assert.equal(await refresh, null);
  f.state.hold = false;
  for (const reply of f.state.held.splice(0)) reply();
  await settle();
  const tree = f.statuses.get("files.tree").read().elements.find((element) => element.kind === "tree");
  assert.deepEqual(tree.nodes.map((node) => node.label), ["docs"], "the listing of the previous project is not shown");
  assert.equal(f.statuses.get("files.tree").read().elements[0].text, "/work/b");
  assert.deepEqual(f.errors, []);
  host.dispose();
});

test("a sidecar refusal after the window showed no project is the reply of no project, not an error", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([{ path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false }])] });
  const host = await mountFilesHost(f);
  f.failures.send = new Error("plugin host files: no project is shown");
  const refresh = f.commands.get("files.refresh")();
  await f.emitProject(null);
  assert.equal(await refresh, null);
  assert.deepEqual(f.errors, []);
  host.dispose();
});

test("an invalid project event is refused with an error and keeps the project shown before it", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  const host = await mountFilesHost(f);
  await f.emitProject({ id: "", root: "/work/b" });
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0].level, "error");
  assert.match(f.errors[0].text, /project to be null or an object with id and root/);
  assert.equal(f.statuses.get("files.tree").read().elements[0].text, "/work/project");
  host.dispose();
});

test("a bookmark read refused because no project is shown is not an error: the project message ends the list", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  f.data.failGet = "plugin host files: no project is shown";
  const host = await mountFilesHost(f);
  assert.deepEqual(f.errors, [], "a refusal for no shown project is reported as no error");
  host.dispose();
});

test("a bookmark write refused because no project is shown changes nothing and is not an error", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  const host = await mountFilesHost(f);
  f.data.failSet = "plugin host files: no project is shown";
  assert.equal(await f.commands.get("files.bookmarks.add")({ path: "a.txt" }), null);
  assert.deepEqual(f.errors, []);
  host.dispose();
});

test("a sidecar request refused because no project is shown resolves as no project, not as an error", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([])] });
  const host = await mountFilesHost(f);
  f.failures.send = new Error("plugin host files: no project is shown");
  assert.equal(await f.commands.get("files.refresh")(), null);
  assert.deepEqual(f.errors, []);
  host.dispose();
});

