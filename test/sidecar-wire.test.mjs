// The plugin host consumer against the declared wire contract of the files sidecar (test/fixtures/sidecar-files/tree-wire.json).
// No test runs the sidecar: the fake sidecar answers each request with the reply line of the fixture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mountFilesHost } from "../ui/host-runtime.js";

const wire = JSON.parse(readFileSync(new URL("./fixtures/sidecar-files/tree-wire.json", import.meta.url), "utf8"));

/** A fake sidecar session that answers each request with the reply of the fixture for its operation. */
function wireHost(replyFor, { projectReady = true } = {}) {
  const requests = [];
  let onMessage = null;
  const statuses = new Map();
  const commands = new Map();
  const reports = [];
  const expandedListeners = [];
  let projectListener = null;
  let projectDelivery = Promise.resolve();
  let resolveSnapshot;
  const snapshotReady = new Promise((resolve) => { resolveSnapshot = resolve; });
  const sidecar = {
    async on(session, fn) { onMessage = fn; },
    async onFailure() {},
    async send(session, body) {
      const { id, ...rest } = body;
      requests.push(rest);
      const reply = replyFor(rest);
      queueMicrotask(() => {
        onMessage(reply.changed !== undefined ? reply : { id, ...reply });
        if (rest.operation === "snapshot") resolveSnapshot();
      });
    },
  };
  const page = {
    project: { id: "project-a", root: "/work/project" },
    sidecar: () => sidecar,
    async report(record) { reports.push(record); },
    async open() {},
    data: { async get() { return []; }, async set() { return null; } },
    emit() {},
    onProject(listener) {
      projectListener = listener;
      if (projectReady) projectDelivery = listener(page.project);
    },
    onTreeExpanded(listener) { expandedListeners.push(listener); return () => expandedListeners.splice(expandedListeners.indexOf(listener), 1); },
  };
  const expose = {
    async status(name, read) { statuses.set(name, read); },
    async command(name, run) { commands.set(name, run); },
  };
  // A line from the sidecar that carries no request id, such as a change line of a watched directory.
  const push = (line) => onMessage(line);
  const expand = async (event) => { for (const listener of expandedListeners) await listener(event); };
  return {
    page, expose, requests, statuses, commands, reports, push, expand,
    ready: () => projectDelivery,
    snapshotReady,
  };
}

const treeOf = (value) => value.elements.find((element) => element.kind === "tree");

test("each request the host sends has the body of the declared wire contract", async () => {
  const f = wireHost((request) => ({ tree: wire.replies[request.operation === "snapshot" ? "snapshot" : "select"].tree }));
  const host = await mountFilesHost(f);
  await f.ready();
  await f.snapshotReady;
  assert.deepEqual(f.requests[0], wire.requests.snapshot);
  await f.commands.get("files.select")({ path: "src/main.go" });
  assert.deepEqual(f.requests[1], wire.requests.select);
  host.dispose();
});

test("the snapshot reply becomes the declared tree with each directory detail and the selected row", async () => {
  const f = wireHost(() => ({ tree: wire.replies.snapshot.tree }));
  const host = await mountFilesHost(f);
  await f.ready();
  await f.snapshotReady;
  const tree = treeOf(f.statuses.get("files.tree")());
  assert.deepEqual(tree.nodes.map((node) => [node.label, node.detail ?? null]), [["src", "deleted"], ["readme.md", null]]);
  assert.deepEqual(tree.nodes[0].children.map((node) => [node.label, node.detail]), [["main.go", "modified"], ["old.go", "deleted"]]);
  host.dispose();
});

test("the select reply marks the selected row of the declared tree", async () => {
  const f = wireHost((request) => ({ tree: wire.replies[request.operation === "snapshot" ? "snapshot" : "select"].tree }));
  const host = await mountFilesHost(f);
  await f.ready();
  await f.snapshotReady;
  await f.commands.get("files.select")({ path: "src/main.go" });
  const tree = treeOf(f.statuses.get("files.tree")());
  assert.equal(tree.nodes[0].children[0].selected, true);
  host.dispose();
});

test("a failed declared expansion is reported as an error, not as a success", async () => {
  let fail = false;
  // The snapshot expands src, and the event explicitly requests collapse; the failure is set for that operation.
  const f = wireHost((request) => (fail && request.operation === "collapse"
    ? wire.replies.expandFailed
    : { tree: wire.replies.snapshot.tree }));
  const host = await mountFilesHost(f);
  await f.ready();
  await f.snapshotReady;
  fail = true;
  const src = treeOf(f.statuses.get("files.tree")()).nodes[0];
  await f.expand({ status: "tree", tree: "files", path: [src.key], expanded: false });
  assert.deepEqual(f.reports.at(-1), { level: "error", where: "files tree", text: wire.replies.expandFailed.error });
  assert.deepEqual(f.requests.at(-1), { ...wire.requests.expand, operation: "collapse" });
  host.dispose();
});

test("a stale generation reply is an error, not a value", async () => {
  const f = wireHost((request) => (request.operation === "select" ? wire.replies.staleGeneration : { tree: wire.replies.snapshot.tree }));
  const host = await mountFilesHost(f);
  await f.ready();
  await f.snapshotReady;
  await assert.rejects(f.commands.get("files.select")({ path: "src/main.go" }), /stale tree generation/);
  host.dispose();
});

test("a change line from the sidecar requests a new snapshot", async () => {
  const f = wireHost(() => ({ tree: wire.replies.snapshot.tree }));
  const host = await mountFilesHost(f);
  await f.ready();
  await f.snapshotReady;
  assert.equal(f.requests.length, 1);
  f.push(wire.change);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(f.requests.slice(1), [wire.requests.snapshot]);
  host.dispose();
});

test("project-bound operations are refused before ready-time project delivery", async () => {
  const f = wireHost(() => ({ tree: wire.replies.snapshot.tree }), { projectReady: false });
  const host = await mountFilesHost(f);
  await assert.rejects(f.commands.get("files.select")({ path: "src/main.go" }), /requires a ready-time project delivery/);
  assert.deepEqual(f.requests, []);
  host.dispose();
});
