// A consumer-side model of createViewBridge of the plugin API view entry, for the cases of test/fixtures/contract that the
// view page of the files host uses: the call layer (calls.request), runtime.native.on and the exposure messages,
// commands.register with the host requests of its commands, runtime.sidecar, and the answer to the declared UI snapshot
// pull. The host messages arrive through the deliver function, which stands for window.sokView.attach.
import { createSnapshotSender, SNAPSHOT_ACK_EVENT, SNAPSHOT_REQUEST_COMMAND } from "./snapshots.mjs";

const UNREGISTERED_COMMAND = 1002;
const FAILED_COMMAND = -32000;
const INVALID_PARAMS = -32602;

const PLUGIN = /^[a-z][a-z0-9-]*$/;

/** Creates the bridge of one view page. The plugin is the host of window.location, which must be a sok://<plugin id> page. */
export function createViewBridge({ handler, report }) {
  const plugin = globalThis.window.location.host;
  if (!PLUGIN.test(plugin)) throw new Error(`view channel requires a view page on sok://<plugin id>, got ${globalThis.window.location.href}`);
  const listeners = new Map();
  const subscriptions = new Map();
  const handlers = new Map();
  const calls = new Map();
  let sequence = 0;
  // The last project message of the host; undefined until the host sends one (runtime.project replays it).
  let lastProject;
  let acknowledgement = null;
  const post = (message) => handler.postMessage(message);

  const snapshots = createSnapshotSender({
    plugin,
    send: post,
    onMessage: (listener) => { acknowledgement = listener; return () => { acknowledgement = null; }; },
    report,
  });

  function request(command, params) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      calls.set(id, { resolve, reject });
      post({ sok: 1, id, command, params });
    });
  }

  // A subscription is requested by its first listener. A refused subscription is forgotten with its listener.
  function listen(key, call, listener) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(listener);
    if (!subscriptions.has(key)) {
      const pending = call();
      subscriptions.set(key, pending);
      pending.catch(() => subscriptions.delete(key));
    }
    return subscriptions.get(key).then(() => () => {
      listeners.get(key)?.delete(listener);
    }, (error) => {
      listeners.get(key)?.delete(listener);
      throw error;
    });
  }

  // The snapshot store of the view. A fault makes every later read fail with its message.
  let storeFault = null;
  const answerSnapshotRequest = ({ id, params }) => {
    const status = params?.status;
    if (typeof status !== "string" || status === "") {
      post({ sok: 1, reply: id, error: { code: INVALID_PARAMS, message: "declared-ui.snapshot.request requires a status name" } });
      return;
    }
    if (!snapshots.has(status)) {
      post({ sok: 1, reply: id, result: { seq: 0, value: null } });
      return;
    }
    // A read that fails answers the request with its error and reports it; it never answers an empty value.
    try {
      if (storeFault !== null) throw new Error(storeFault);
      post({ sok: 1, reply: id, result: snapshots.pull(status) });
    } catch (error) {
      const text = String(error?.message ?? error);
      report({ where: `declared-ui.snapshot.request ${status}`, text });
      post({ sok: 1, reply: id, error: { code: FAILED_COMMAND, message: text } });
    }
  };

  async function runCommand({ id, command, params, cids }) {
    const run = handlers.get(command);
    if (run === undefined) {
      post({ sok: 1, reply: id, error: { code: UNREGISTERED_COMMAND, message: `view command ${command} is not registered` } });
      return;
    }
    try {
      // The handler receives the cids of the cause of the request, and an empty context when the request has none (core view.js).
      post({ sok: 1, reply: id, result: (await run(params, cids === undefined ? {} : { cids })) ?? null });
    } catch (error) {
      post({ sok: 1, reply: id, error: { code: FAILED_COMMAND, message: String(error?.message ?? error) } });
    }
  }

  // The host messages: acknowledgements, events, replies to calls, snapshot pulls and command requests.
  function deliver(message) {
    if (message.event === "project") {
      lastProject = message.data;
      for (const listener of [...(listeners.get("project") ?? [])]) listener(message.data);
      return;
    }
    if (message.event === SNAPSHOT_ACK_EVENT) {
      acknowledgement({ event: message.event, ...message.data });
      return;
    }
    if (message.event !== undefined) {
      const key = message.event === "sidecar.message" ? `sidecar.message:${message.data.id}`
        : message.event === "sidecar.failure" ? `sidecar.failure:${message.data.id}`
          : `native:${message.event}`;
      for (const listener of [...(listeners.get(key) ?? [])]) listener(message.data);
      return;
    }
    if (message.command === SNAPSHOT_REQUEST_COMMAND) {
      answerSnapshotRequest(message);
      return;
    }
    if (message.command !== undefined) {
      runCommand(message);
      return;
    }
    const call = calls.get(message.id);
    if (call === undefined) return;
    calls.delete(message.id);
    if (message.error !== undefined) {
      const error = new Error(message.error.message);
      error.code = message.error.code;
      call.reject(error);
    } else {
      call.resolve(message.result ?? null);
    }
  }

  globalThis.window.sokView.attach(deliver);

  const native = {
    on(name, listener) {
      if (typeof name !== "string" || name === "") return Promise.reject(new TypeError("runtime.native.on requires a non-empty name"));
      return listen(`native:${name}`, () => request("runtime.native.on", { name }), listener);
    },
  };

  const runtime = {
    native,
    sidecar(name) {
      return {
        send: (id, body, cids = []) => request("runtime.sidecar.send", { id, sidecar: name, body, cids }),
        on: (id, listener) => listen(`sidecar.message:${id}`, () => request("runtime.sidecar.on", { id, sidecar: name }), (data) => listener(data.body)),
        onFailure: (id, listener) => listen(`sidecar.failure:${id}`, () => request("runtime.sidecar.onFailure", { id, sidecar: name }), (data) => listener(data.reason)),
      };
    },
    // The project of the window, as the host sends it with no call (the theme path).
    project(listener) {
      if (typeof listener !== "function") throw new TypeError("runtime.project requires a listener");
      if (!listeners.has("project")) listeners.set("project", new Set());
      listeners.get("project").add(listener);
      if (lastProject !== undefined) listener(lastProject);
      return { ready: Promise.resolve(), dispose: Promise.resolve(() => listeners.get("project")?.delete(listener)) };
    },
    error: (where, text) => request("runtime.error", { where, text }).then(() => undefined),
    // The command of core or of the plugin host, run with its params (docs/spec/native-surfaces.md#view-surfaces).
    command: (name, params = null) => {
      if (typeof name !== "string" || name === "") throw new TypeError("runtime.command requires a non-empty name");
      return request(name, params);
    },
    // The records of the page: each level writes runtime.log with the event and the fields, and no level query precedes it
    // (docs/spec/plugin-host.md, Log call). A fields function runs for each record, since the model stores every record.
    log: Object.fromEntries(["error", "warn", "info", "debug", "trace"].map((level) => [level, (event, fields, cids) => {
      const body = typeof fields === "function" ? fields() : fields;
      return request("runtime.log", { level, event, fields: body, ...(cids === undefined ? {} : { cids }) }).then(() => undefined);
    }])),
  };

  const commands = {
    register(name, run) {
      if (typeof name !== "string" || name === "") throw new TypeError("commands.register requires a non-empty name");
      if (typeof run !== "function") throw new TypeError(`commands.register requires a function for ${name}`);
      handlers.set(name, run);
      return request("runtime.command.register", { name }).then(() => undefined, (error) => {
        handlers.delete(name);
        throw error;
      });
    },
  };

  const exposure = {
    register: (kind, name) => request("runtime.native.call", { name: "registered", payload: { kind, name } }).then(() => undefined),
    reply: (id, payload) => request("runtime.native.call", { name: "exposureReply", payload: { id, ...payload } }).then(() => undefined),
  };

  // Makes the snapshot store fail every later read with the message.
  const fault = (text) => { storeFault = text; };

  return { calls: { request }, runtime, commands, exposure, snapshots, deliver, fault };
}
