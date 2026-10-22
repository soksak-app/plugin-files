import assert from "node:assert/strict";
import test from "node:test";

import { mountFilesHost } from "../build/test/ui/host-runtime.js";

function fakeHost({ treeSnapshots, project = { id: "project-a", root: "/work/project" } } = {}) {
  const calls = [];
  const statuses = new Map();
  const commands = new Map();
  const errors = [];
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
  };
  const expose = {
    async status(name, read, subscribe) { statuses.set(name, { read, subscribe }); },
    async command(name, run) { commands.set(name, run); },
  };
  return { page, expose, calls, statuses, commands, errors, message: () => message, failure: () => failure };
}

const snapshot = (entries, selected = null, generation = 1) => ({ generation, entries, selected });

test("host page subscribes before snapshot and registers the declared tree status and commands", async () => {
  const f = fakeHost({ treeSnapshots: [snapshot([
    { path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false },
    { path: "readme.md", name: "readme.md", directory: false, depth: 0, expanded: false, selected: false },
  ])] });
  const host = await mountFilesHost(f);
  assert.deepEqual(f.calls.slice(0, 2).map(({ kind }) => kind), ["sidecar", "on"]);
  assert.ok(f.calls.findIndex(({ kind }) => kind === "onFailure") < f.calls.findIndex(({ kind }) => kind === "send"));
  const send = f.calls.find(({ kind }) => kind === "send");
  assert.equal(send.session, "plugin:files:project-a:@soksak/sidecar-files");
  assert.equal(send.body.operation, "snapshot");
  assert.equal(f.statuses.has("files.tree"), true);
  assert.deepEqual([...f.commands.keys()], ["files.refresh", "files.tree.toggle", "files.select"]);
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
