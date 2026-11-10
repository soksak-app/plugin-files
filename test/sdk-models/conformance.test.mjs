// Replays the copied contract cases of test/fixtures/contract against the models of test/sdk-models. Each step of a
// replayed case is run and its output is asserted. EXCLUDED_CASES lists every case that the models do not replay, with
// the reason, and the test fails when a listed case is absent from the copies. REPLAYED_COUNTS fixes how many cases of each
// copied file replay, so a case that stops replaying is a failure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createExpose } from "./expose.mjs";
import { createViewBridge } from "./view.mjs";
import { createOccurrences } from "../fixtures/occurrences.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/contract/${name}.json`, import.meta.url), "utf8")).cases;
// Each step waits for the records that its case expects: the occurrences of the lists below. A step that expects no record of a
// list waits for none of it, and its awaited call is the event that ends its handling (docs/spec/calls.md, tests).
const counts = (lists, expected) => () => Object.entries(lists).every(([key, [list, before]]) => list.length - before >= (expected[key]?.length ?? 0));
const errorText = (error) => (error instanceof Error ? error.message : String(error?.message ?? error));
const clone = (value) => JSON.parse(JSON.stringify(value));

const NOT_CALLED_BY_PAGE = "the plugin host page does not call";
const EXCLUDED_CASES = {
  "expose.element.act-rect-and-refusals": "the model answers no element request (element.act and element.rect); the page registers element names through expose.element, which the view tests replay",
  "expose.dispose.removes-bindings": `${NOT_CALLED_BY_PAGE} expose.bind; the model has no binding`,
  "expose.bind.function-params-are-read-at-each-run": `${NOT_CALLED_BY_PAGE} expose.bind; the model has no binding`,
  "view.bridge.events-delivered-in-order": `${NOT_CALLED_BY_PAGE} a theme subscription; the theme reaches the page through the document-start script`,
  "view.bridge.refuses-malformed-host-message": "the view channel refuses a message without the marker before the bridge receives it",
  "view.bridge.tab-state-read-write": `${NOT_CALLED_BY_PAGE} tab.state; the plugin host has no tab state`,
};
const REPLAYED_COUNTS = {
  expose: 5,
  "view-native": 4,
  "view-commands": 3,
  "view-bridge": 4,
};
const CASES_OF = ["expose", "view-native", "view-commands", "view-bridge"];

/** The cases of a copied file that replay: every case except the excluded ones. */
function replayable(name) {
  return fixture(name).filter((entry) => !EXCLUDED_CASES[entry.id]);
}

// A window for a view page of the given url: the channel attaches its host message listener to window.sokView.
function viewWindow(url = "soksak://probe/") {
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
    const { until, list } = createOccurrences();
    const registered = list();
    const replies = list();
    const changed = list();
    const subscribers = new Set();
    let handle = null;
    let value = testCase.initial;
    const expose = createExpose({
      register: async (kind, name) => { registered.push({ kind, name }); },
      unregister: async () => { registered.push({ kind: "unregister" }); },
      onRequest: (answer) => { handle = answer; },
      reply: (id, payload) => { replies.push({ id, payload }); },
      changed: (name, changedValue, version) => { changed.push(clone({ name, value: changedValue, version })); },
    }, () => testCase.declarations);
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = { registered: registered.length, replies: replies.length, changed: changed.length };
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
      await until(counts({ registered: [registered, before.registered], replies: [replies, before.replies], changed: [changed, before.changed] }, step.output));
      const output = {
        registered: registered.slice(before.registered),
        replies: replies.slice(before.replies),
        changed: changed.slice(before.changed),
        effects: [],
        result: null,
        throws,
      };
      assert.deepEqual(output, step.output, label);
    }
  }
});

test("view native cases replay against the view bridge model", async () => {
  for (const testCase of replayable("view-native")) {
    viewWindow();
    const { until, list } = createOccurrences();
    const posted = list();
    const delivered = list();
    const removers = new Map();
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(clone(message)) } });
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
      await until(counts({ posted: [posted, before], delivered: [delivered, deliveredBefore] }, step.output));
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
    const { until, list } = createOccurrences();
    const posted = list();
    const bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(clone(message)) } });
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
      await until(counts({ posted: [posted, before] }, step.output));
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
          bridge = createViewBridge({ handler: { postMessage: (message) => posted.push(clone(message)) } });
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
      // Each output of a view bridge step is read in the turn of its step or from its awaited call.
      if (step.output === undefined) continue;
      assert.deepEqual(clone(output), step.output, label);
      assert.ok(posted.length >= before, label);
    }
  }
});
