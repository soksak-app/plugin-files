// Replays the copied contract cases of test/fixtures/contract against the models of test/sdk-models. Each step of a
// replayed case is run and its output is asserted. EXCLUDED_CASES lists every case that the models do not replay, with
// the reason, and the test fails when a listed case is absent from the copies. REPLAYED_COUNTS fixes how many cases of each
// copied file replay, so a case that stops replaying is a failure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createExpose } from "./expose.mjs";
import { createSnapshotSender, SNAPSHOT_ACK_EVENT, SNAPSHOT_REQUEST_COMMAND } from "./snapshots.mjs";
import { createViewBridge } from "./view.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/contract/${name}.json`, import.meta.url), "utf8")).cases;
const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const errorText = (error) => (error instanceof Error ? error.message : String(error?.message ?? error));
const clone = (value) => JSON.parse(JSON.stringify(value));

const NOT_CALLED_BY_PAGE = "the plugin host page does not call";
const EXCLUDED_CASES = {
  "expose.dom.act-rect-and-refusals": `${NOT_CALLED_BY_PAGE} expose.dom; the page registers no dom name`,
  "expose.dispose.removes-bindings": `${NOT_CALLED_BY_PAGE} expose.bind; the model has no binding`,
  "expose.bind.function-params-are-read-at-each-run": `${NOT_CALLED_BY_PAGE} expose.bind; the model has no binding`,
  "snapshot.receiver.acknowledges-then-delivers": "the page receives no snapshot message; the receiver is the workbench side",
  "view.bridge.events-delivered-in-order": `${NOT_CALLED_BY_PAGE} a theme subscription; the theme reaches the page through the document-start script`,
  "view.bridge.refuses-malformed-host-message": "the view channel refuses a message without the marker before the bridge receives it",
  "view.bridge.tab-state-read-write": `${NOT_CALLED_BY_PAGE} tab.state; the plugin host has no tab state`,
};
const REPLAYED_COUNTS = {
  expose: 5,
  "declared-ui-snapshot": 6,
  "view-snapshot-pull": 5,
  "view-native": 4,
  "view-commands": 3,
  "view-bridge": 5,
};
const CASES_OF = ["expose", "declared-ui-snapshot", "view-snapshot-pull", "view-native", "view-commands", "view-bridge"];

/** The cases of a copied file that replay: every case except the excluded ones. */
function replayable(name) {
  return fixture(name).filter((entry) => !EXCLUDED_CASES[entry.id]);
}

// A window for a view page of the given url: the channel attaches its host message listener to window.sokView.
function viewWindow(url = "sok://probe/") {
  const location = new URL(url);
  globalThis.window = { location: { host: location.host, href: url }, sokView: { attach() {} } };
}

test("every excluded case is a case of a copied file, and each file replays the counted cases", () => {
  const ids = new Set(CASES_OF.flatMap((name) => fixture(name).map((entry) => entry.id)));
  for (const id of Object.keys(EXCLUDED_CASES)) assert.ok(ids.has(id), `excluded case ${id} is not in the copied fixtures`);
  for (const name of CASES_OF) {
    assert.equal(replayable(name).length, REPLAYED_COUNTS[name], `${name} replays a different number of cases`);
  }
});

test("expose cases replay against the exposure model", async () => {
  for (const testCase of replayable("expose")) {
    const registered = [];
    const replies = [];
    const subscribers = new Set();
    let handle = null;
    let value = testCase.initial;
    const expose = createExpose({
      register: async (kind, name) => { registered.push({ kind, name }); },
      unregister: async () => { registered.push({ kind: "unregister" }); },
      onRequest: (answer) => { handle = answer; },
      reply: (id, payload) => { replies.push({ id, payload }); },
    }, () => testCase.declarations);
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = { registered: registered.length, replies: replies.length };
      let throws = null;
      try {
        if (step.status) await expose.status(step.status.name, () => value, (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); });
        else if (step.request) handle(step.request);
        else if (step.set !== undefined) {
          value = step.set;
          for (const fn of [...subscribers]) fn(value);
        } else if (step.dispose) await expose.dispose();
        else if (step.race) {
          const disposing = expose.dispose();
          try {
            await expose.status(step.race.name, () => value, () => () => {});
          } catch (failure) {
            throws = errorText(failure);
          }
          await disposing;
        } else throw new Error(`unknown expose step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      const output = { registered: registered.slice(before.registered), replies: replies.slice(before.replies), effects: [], result: null, throws };
      assert.deepEqual(output, step.output, label);
    }
  }
});

test("declared UI snapshot sender cases replay against the snapshot sender model", async () => {
  for (const testCase of replayable("declared-ui-snapshot")) {
    const sent = [];
    const reports = [];
    let acknowledge = null;
    const sender = createSnapshotSender({
      plugin: "demo",
      send: (message) => sent.push(clone(message)),
      onMessage: (listener) => { acknowledge = listener; },
      report: (event) => reports.push(clone(event)),
    });
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const sentBefore = sent.length;
      const reportsBefore = reports.length;
      let result = null;
      let throws = null;
      try {
        if (step.push) sender.push(step.push.status, step.push.value);
        else if (step.ack) acknowledge({ event: SNAPSHOT_ACK_EVENT, plugin: "demo", status: step.ack.status, seq: step.ack.seq });
        else if (step.peerLost !== undefined) sender.peerLost(step.peerLost);
        else if (step.pull) result = sender.pull(step.pull.status);
        else throw new Error(`unknown snapshot step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      const output = { sent: sent.slice(sentBefore), reports: reports.slice(reportsBefore), delivered: [], result, throws };
      assert.deepEqual(output, step.output, label);
    }
  }
});

test("view snapshot pull cases replay against the view bridge model", async () => {
  for (const testCase of replayable("view-snapshot-pull")) {
    viewWindow();
    const posted = [];
    const reports = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(clone(message)) }, report: (event) => reports.push(clone(event)) });
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const reportsBefore = reports.length;
      let throws = null;
      try {
        if (step.push) bridge.snapshots.push(step.push.status, step.push.value);
        else if (step.fault !== undefined) bridge.fault(step.fault);
        else if (step.request) bridge.deliver({ sok: 1, id: step.request.id, command: SNAPSHOT_REQUEST_COMMAND, params: step.request.params });
        else throw new Error(`unknown pull step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      assert.equal(throws, null, label);
      assert.deepEqual({ posted: posted.slice(before), reports: reports.slice(reportsBefore) }, step.output, label);
    }
  }
});

test("view native cases replay against the view bridge model", async () => {
  for (const testCase of replayable("view-native")) {
    viewWindow();
    const posted = [];
    const delivered = [];
    const removers = new Map();
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(clone(message)) }, report: () => {} });
    const answer = (reply) => bridge.deliver({ sok: 1, id: posted.at(-1).id, ...reply });
    const listenerOf = (label) => (data) => delivered.push({ listener: label, data: clone(data) });
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      const deliveredBefore = delivered.length;
      let result = null;
      let throws = null;
      try {
        if (step.on) {
          const pending = bridge.runtime.native.on(step.on.name, listenerOf(step.on.listener));
          if (step.answer) answer(step.answer);
          const value = await pending;
          if (typeof value === "function") {
            removers.set(step.on.listener, value);
            result = "function";
          }
        } else if (step.off !== undefined) {
          removers.get(step.off)();
        } else if (step.event) {
          bridge.deliver({ event: step.event.event, data: step.event.data });
        } else if (step.exposureRegister) {
          const pending = bridge.exposure.register(step.exposureRegister.kind, step.exposureRegister.name);
          if (step.answer) answer(step.answer);
          await pending;
        } else if (step.exposureReply) {
          const pending = bridge.exposure.reply(step.exposureReply.id, step.exposureReply.payload);
          if (step.answer) answer(step.answer);
          await pending;
        } else throw new Error(`unknown native step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      const output = { posted: posted.slice(before), delivered: delivered.slice(deliveredBefore), result, throws };
      assert.deepEqual(output, step.output, label);
    }
  }
});

test("view command cases replay against the command model", async () => {
  const RUNS = { echo: (params) => params, fail: () => { throw new Error("save failed"); }, none: () => undefined, text: "text",
    context: (params, context) => context };
  for (const testCase of replayable("view-commands")) {
    viewWindow();
    const posted = [];
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(clone(message)) }, report: () => {} });
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      let result = null;
      let throws = null;
      try {
        if (step.register) {
          const pending = bridge.commands.register(step.register.name, RUNS[step.register.run]);
          if (step.answer) bridge.deliver({ sok: 1, id: posted.at(-1).id, ...step.answer });
          result = (await pending) ?? null;
        } else if (step.request) {
          bridge.deliver({ sok: 1, id: step.request.id, command: step.request.command, params: step.request.params,
            ...(step.request.cids === undefined ? {} : { cids: step.request.cids }) });
        } else throw new Error(`unknown command step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      const output = { posted: posted.slice(before), result, throws };
      assert.deepEqual(output, step.output, label);
    }
  }
});

test("view bridge cases replay against the view bridge model", async () => {
  for (const testCase of replayable("view-bridge")) {
    const posted = [];
    const messages = [];
    const failures = [];
    let bridge = null;
    let pendingCall = null;
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = posted.length;
      let output;
      try {
        if (step.action === "create") {
          viewWindow(step.input?.url);
          bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(clone(message)) }, report: () => {} });
          output = step.output?.plugin === undefined ? { ready: true } : { ready: true, plugin: globalThis.window.location.host };
        } else if (step.action === "request") {
          pendingCall = bridge.calls.request(step.input.command, step.input.params);
          output = posted.at(-1);
        } else if (step.action === "host-reply") {
          bridge.deliver(step.input);
          output = step.output === undefined ? undefined : await pendingCall;
        } else if (step.action === "sidecar-send") {
          const { sidecar, id, body, cids } = step.input;
          pendingCall = bridge.runtime.sidecar(sidecar).send(id, body, cids);
          output = posted.at(-1);
        } else if (step.action === "sidecar-subscribe") {
          const { kind, sidecar, id } = step.input;
          const handle = bridge.runtime.sidecar(sidecar);
          if (kind === "message") handle.on(id, (body) => messages.push(body));
          else handle.onFailure(id, (reason) => failures.push(reason));
          output = posted.at(-1);
        } else if (step.action === "log") {
          const { level, event, fields } = step.input;
          bridge.runtime.log[level](event, fields);
          output = posted.slice(before);
        } else if (step.action === "log-builder") {
          // The builder of the fields runs only for a record that the log stores; the model stores every record.
          const { level, event, fields } = step.input;
          let built = false;
          const calls = posted.length;
          bridge.runtime.log[level](event, () => { built = true; return fields; });
          output = { calls: posted.length - calls, built };
        } else if (step.action === "host-event") {
          bridge.deliver(step.input);
          output = { messages: clone(messages), failures: clone(failures) };
        } else throw new Error(`unknown view bridge step in ${label}`);
      } catch (failure) {
        output = { throws: errorText(failure) };
      }
      await settle();
      if (step.output === undefined) continue;
      assert.deepEqual(clone(output), step.output, label);
      assert.ok(posted.length >= before, label);
    }
  }
});
