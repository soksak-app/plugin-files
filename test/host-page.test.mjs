// The files host page at the consumer boundary (F238-c-13): ui/host.js, built by scripts/build-test.mjs with each SDK
// import rewritten to its model in test/sdk-models, runs over a fake view channel. The test checks the wiring of the page:
// each declared status is registered, each status value is pushed as a declared UI snapshot, each declared command is
// registered, and the files sidecar is called with the sidecar that the manifest declares.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const SIDECAR = "@soksak/sidecar-files";
const PROJECT = { id: "project-1", root: "/project" };
const TREE = { generation: 1, entries: [], selected: null };
const posted = [];
let deliver = null;
let resolveFirstSidecarSend;
const firstSidecarSend = new Promise((resolve) => { resolveFirstSidecarSend = resolve; });

// Answers a call of the page with its reply. A snapshot call is answered by the sidecar message that carries its tree.
function respond(message) {
  if (message.command === undefined || message.id === undefined) return;
  if (message.command === "runtime.sidecar.send" && message.params.body.operation === "snapshot") resolveFirstSidecarSend();
  queueMicrotask(() => {
    if (message.command === "runtime.sidecar.send") {
      deliver({ event: "sidecar.message", data: { id: message.params.id, body: { id: message.params.body.id, tree: TREE } } });
    }
    deliver({ id: message.id, result: message.command === "runtime.data.get" ? [] : null });
  });
}

// The view channel of the page: the bridge attaches its message receiver, and the page posts its calls to the handler.
globalThis.window = {
  location: { host: "files", href: "sok://files/ui/host.html" },
  sokHost: { project: PROJECT, declarations: manifest.exposes },
  sokView: { attach: (receiver) => { deliver = receiver; } },
  webkit: {
    messageHandlers: {
      "sok-view": {
        postMessage(message) {
          posted.push(message);
          respond(message);
        },
      },
    },
  },
};

// The page starts when its module loads: the top-level await of ui/host.js completes after each status and command is registered.
await import("../build/test/ui/host.js");
// The document start value is not the project I/O authorization. The host delivers the current project through runtime.project after
// the plugin page has installed its listener, as it does for a ready page in the application.
deliver({ event: "project", data: PROJECT });
await firstSidecarSend;

const callsNamed = (command) => posted.filter((message) => message.command === command);
const registrations = (kind) => posted
  .filter((message) => message.command === "runtime.native.call" && message.params.name === "registered" && message.params.payload.kind === kind)
  .map((message) => message.params.payload.name);

test("the page registers each declared status", () => {
  assert.deepEqual(registrations("status").sort(), manifest.exposes.status.map((entry) => entry.name).sort());
});

test("the page pushes the value of each status as a declared UI snapshot", () => {
  const pushed = posted.filter((message) => message.event === "declared-ui.snapshot").map((message) => message.status);
  for (const entry of manifest.exposes.status) {
    const localName = entry.name.slice("files.".length);
    assert.ok(pushed.includes(localName), `no declared UI snapshot was pushed for ${entry.name}`);
  }
});

test("the page registers each declared command it runs", () => {
  const registered = callsNamed("runtime.command.register").map((message) => message.params.name);
  assert.deepEqual(registered.sort(), manifest.exposes.commands.map((entry) => entry.name).sort());
});

test("the page calls the files sidecar that the manifest declares", () => {
  assert.ok(Object.keys(manifest.dependencies).includes(SIDECAR), `${SIDECAR} is not a declared dependency`);
  const sent = callsNamed("runtime.sidecar.send");
  assert.ok(sent.length > 0, "the page sent no sidecar call");
  for (const message of sent) assert.equal(message.params.sidecar, SIDECAR);
  assert.ok(sent.some((message) => message.params.body.operation === "snapshot"), "the page sent no snapshot request");
});
