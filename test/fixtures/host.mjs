// The view host of this repository's tests. It runs a page module of this plugin in a jsdom window and answers the page as the host
// of the view answers it, by the view contract of core docs/spec/native-surfaces.md#view-surfaces:
//   - the start values are the window property sokSurface, the theme is sokTheme, and the document-start script of the view
//     channel (CHANNEL_SCRIPT below, which the application injects) runs before the page;
//   - the page posts its calls through the handler sok-view, and the host answers each call with {sok: 1, id, result} or
//     {sok: 1, id, error: {code, message}};
//   - the host posts each message to the page as a message event of the window with sok: 1 (a call request, a reply to a call of the
//     host, a native event, a sidecar message or a failure, a project data change);
//   - the host keeps the page's registrations, subscriptions, project data and log records, and refuses a call it does not serve
//     with the message that the contract states for it.
// The page modules are bundled with their library imports and run without a change of their source, except the one dynamic import of
// the diagnostic module, which the bundle routes to the module loader of this process (LOADER below).
//
// The fixture reads only the plugin manifest, for the plugin id. It names no path of core and no module of the library's testing entry.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PLUGIN = JSON.parse(readFileSync(path.join(ROOT, "plugin.json"), "utf8")).id;

// The names that the view bridge of the library registers on each surface document (native-surfaces.md, view exposure). They are
// declared in the start values of every surface document beside the plugin exposes.
const CORE_DECLARATIONS = {
  status: ["core.surface.document", "core.surface.input"],
  commands: ["core.surface.hit", "core.surface.clock"],
};
// The kind of each registration of the page, and the declaration list that holds its names.
const KIND_LISTS = { status: "status", element: "element", command: "commands" };
// The default policy of the logging contract (docs/spec/logging.md#policy): every class at error.
const DEFAULT_LEVELS = { lifecycle: "error", input: "error", call: "error", io: "error", frame: "error" };
// Messages posted to the page are plain JSON, as the host serializes them.
const wire = (value) => JSON.parse(JSON.stringify(value ?? null));

/** A refusal of the host that the page receives as the error of its call. */
class Refusal extends Error {
  constructor(message, code = -32000) {
    super(message);
    this.code = code;
  }
}

// The module loader of the view document. A script that runs in a window of the test cannot call import() with a module URL unless the
// process runs with --experimental-vm-modules, so the view's dynamic import of its diagnostic module (ui/diagnostics.js, the only
// dynamic import of the page) is served by the module loader of the test process, which loads the same file by its URL.
const LOADER = "__moduleImport";
const DYNAMIC_IMPORT = /\bimport\((?=new URL\()/g;

// Page bundles are built once per module path, and each view runs the same bundle in its own window.
const bundles = new Map();
function bundleOf(file) {
  if (!bundles.has(file)) {
    bundles.set(file, esbuild.build({
      entryPoints: [file],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      logLevel: "silent",
      // The page reads its own module URL for the diagnostic module, which the view document resolves on its origin.
      define: { "import.meta.url": JSON.stringify(new URL(`file://${file}`).href) },
    }).then((result) => {
      const text = result.outputFiles[0].text;
      const dynamic = text.match(DYNAMIC_IMPORT) ?? [];
      if (dynamic.length !== 1) throw new Error(`the page ${file} holds ${dynamic.length} dynamic imports of a module URL, expected 1`);
      return text.replace(DYNAMIC_IMPORT, `${LOADER}(`);
    }));
  }
  return bundles.get(file);
}

// The document-start script of the view channel (docs/spec/native-surfaces.md#view-surfaces, view channel, items 1 to 4). It posts the
// ready message, keeps each host message with sok: 1 in a queue of at most 256 until the page attaches, passes the messages to the one
// listener in order, and reports each refusal through the handler as view.error. The plugin is the host of the page origin.
const CHANNEL_SCRIPT = `(() => {
  const QUEUE_LIMIT = 256;
  const plugin = window.location.host;
  const handler = window.webkit.messageHandlers["sok-view"];
  const queue = [];
  let listener = null;
  const refuse = (reason) => handler.postMessage({ event: "view.error", plugin, reason: reason + " for " + plugin });
  const pass = (next, message) => {
    try {
      next(message);
    } catch (error) {
      refuse("message failed: " + (typeof error?.message === "string" ? error.message : String(error)));
    }
  };
  const deliver = (message) => {
    if (listener) {
      pass(listener, message);
      return;
    }
    if (queue.length >= QUEUE_LIMIT) {
      refuse("queue full");
      return;
    }
    queue.push(message);
  };
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      refuse("message from another source");
      return;
    }
    const data = event.data;
    if (typeof data !== "object" || data === null || data.sok !== 1) {
      refuse("message without the sok marker");
      return;
    }
    deliver(data);
  });
  window.addEventListener("error", (event) => {
    handler.postMessage({ event: "view.error", plugin, reason: "uncaught error: " + event.message });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    handler.postMessage({ event: "view.error", plugin, reason: "unhandled rejection: " + (reason instanceof Error ? reason.message : String(reason)) });
  });
  const page = crypto.randomUUID();
  const timeOrigin = performance.timeOrigin;
  handler.postMessage({ event: "view.ready", plugin, document: page, time_origin: timeOrigin });
  window.sokView = Object.freeze({
    page,
    timeOrigin,
    attach(next) {
      if (typeof next !== "function") throw new TypeError("attach requires a listener function");
      if (listener) throw new Error("view channel for " + plugin + " already has a message listener");
      listener = next;
      while (queue.length > 0 && listener === next) pass(next, queue.shift());
    },
  });
})();`;

/**
 * Opens a view of the plugin in a window of the test. `start` is the surface start values (window.sokSurface without the core
 * declarations, which the host adds to `declarations`); `theme` is the theme of the view (the scheme and the tokens that the host
 * sets on the root); `sidecars` maps each sidecar the plugin declares to its handler of a request body; `commands` maps each host
 * command that the view may run to its handler; `data` maps each declared project data key to its stored value, which a read or a
 * replace uses; `onDataRead(key, reads, write)` runs after each read of a key, with the count of reads of that key and a write that
 * another writer of the project makes; `faults` maps a call name to the message that the host refuses it with.
 *
 * Returns the view. `view.load(url)` runs the page module, and `view.close()` ends the view.
 */
export function openSurfaceView({ start, theme = {}, sidecars = {}, commands = {}, data = {}, onDataRead = undefined, faults = {} }) {
  if (typeof start?.surface !== "string" || start.surface === "") throw new TypeError("openSurfaceView requires start.surface");
  const startDeclarations = {
    status: start.declarations?.status ?? [],
    element: start.declarations?.element ?? [],
    commands: start.declarations?.commands ?? [],
  };
  // The declarations of the surface document: the plugin exposes and the core declarations that the view bridge registers.
  const declared = {
    status: [...startDeclarations.status, ...CORE_DECLARATIONS.status.map((name) => ({ name }))],
    element: startDeclarations.element,
    commands: [...startDeclarations.commands, ...CORE_DECLARATIONS.commands.map((name) => ({ name }))],
  };
  const surfaceStart = { ...start, declarations: declared, levels: DEFAULT_LEVELS };
  const isDeclared = (kind, name) => declared[KIND_LISTS[kind]].some((entry) => entry.name === name);

  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: `soksak://${PLUGIN}/index.html`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    // Document errors reach the page through its error listener, which the view channel reports; the console gets no copy.
    virtualConsole: new VirtualConsole(),
  });
  const window = dom.window;
  const context = dom.getInternalVMContext();

  // Browser objects that the page uses and that jsdom does not provide. The adopted style sheets are the list of the document, which
  // the page sets and the tests read; jsdom does not apply them. The ResizeObserver records its targets, and the test gives each notification.
  const observers = [];
  class ViewResizeObserver {
    constructor(callback) {
      if (typeof callback !== "function") throw new TypeError("ResizeObserver requires a callback");
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(target) {
      if (!this.targets.includes(target)) this.targets.push(target);
    }
    unobserve(target) {
      this.targets = this.targets.filter((item) => item !== target);
    }
    disconnect() {
      this.disconnected = true;
      this.targets = [];
    }
    // Delivers entries to the callback as the engine delivers them to an observer that observes the element of an entry.
    notify(entries) {
      this.callback(entries, this);
    }
  }
  window.ResizeObserver = ViewResizeObserver;
  window.document.adoptedStyleSheets = [];
  // The structured clone of the view, which the page uses for the value of a change (jsdom has none).
  window.structuredClone = structuredClone;
  // The visual viewport of the view, which the surface document observes (jsdom has none): its size is the size of the window.
  window.visualViewport = Object.assign(new window.EventTarget(), {
    width: window.innerWidth, height: window.innerHeight, scale: 1, offsetLeft: 0, offsetTop: 0,
  });

  // The host state of the view.
  let closed = false;
  let ready = null;
  const calls = [];
  const observed = { commands: [], errors: [], data: [] };
  const logs = [];
  const logWaiters = [];
  const subscriptions = new Set();
  const registrations = [];
  const commandsOfView = new Set();
  const store = new Map(Object.entries(data).map(([key, value]) => [key, wire(value)]));
  const reads = new Map();
  const pending = new Map();
  let active = 0;
  let nextRequest = 0;

  // Posts a message to the page: a message event of the window, whose source is the window, as the host posts it. The page runs
  // in the dispatch, so the page has handled a request of the host when the post returns.
  const post = (message) => {
    if (closed) return;
    const event = new window.Event("message");
    Object.defineProperty(event, "data", { value: wire(message) });
    Object.defineProperty(event, "source", { value: window });
    window.dispatchEvent(event);
  };
  // A message for a subscription of the page. Nothing is posted to a key without a subscription.
  const deliver = (key, message) => {
    if (subscriptions.has(key)) post(message);
  };
  const writeData = (key, value) => {
    store.set(key, wire(value));
    deliver("data", { sok: 1, event: "data", data: { key } });
  };

  // The commands that the view runs on the host. A name the view registered runs its own handler through the host, as the owner
  // check of exposure allows; any other name is refused.
  const runCommand = async (name, params) => {
    if (commandsOfView.has(name)) return request(name, params);
    if (Object.hasOwn(commands, name)) {
      observed.commands.push({ name, params: wire(params) });
      return commands[name](wire(params));
    }
    throw new Refusal(`command ${name} is not registered`);
  };

  const sidecarNamed = (name) => {
    if (!Object.hasOwn(sidecars, name)) throw new Refusal(`view call names sidecar ${name}, which ${PLUGIN} does not declare`);
    return sidecars[name];
  };

  // The calls of the view that the host serves. A name that is not in this table is refused with the contract's message.
  async function serve(command, params) {
    const fault = faults[command];
    if (fault !== undefined) throw new Refusal(fault);
    switch (command) {
      case "runtime.native.on": {
        if (typeof params?.name !== "string" || params.name === "") throw new Refusal("runtime.native.on requires a non-empty name");
        subscriptions.add(`native:${params.name}`);
        return null;
      }
      case "runtime.native.call": {
        const payload = params?.payload;
        if (params?.name === "registered") {
          const { kind, name } = payload ?? {};
          if (!Object.hasOwn(KIND_LISTS, kind) || !isDeclared(kind, name)) throw new Refusal(`exposure ${kind} ${name} is not declared by ${PLUGIN}`);
          registrations.push({ kind, name });
          return null;
        }
        // The host answers the status values and the exposure replies that the page sends; the tests read them from the recorded calls.
        if (params?.name === "changed" || params?.name === "exposureReply") return null;
        throw new Refusal(`view call runtime.native.call ${params?.name} is not served`);
      }
      case "runtime.sidecar.on": {
        sidecarNamed(params?.sidecar);
        subscriptions.add(`sidecar.message:${params.sidecar}:${params.id}`);
        return null;
      }
      case "runtime.sidecar.onFailure": {
        sidecarNamed(params?.sidecar);
        subscriptions.add(`sidecar.failure:${params.sidecar}:${params.id}`);
        return null;
      }
      case "runtime.sidecar.send": {
        const handler = sidecarNamed(params?.sidecar);
        await handler(wire(params.body));
        return null;
      }
      case "runtime.data.get": {
        const key = params?.key;
        if (!store.has(key)) throw new Refusal(`view call runtime.data.get ${key} is not a data key of ${PLUGIN}`);
        const count = (reads.get(key) ?? 0) + 1;
        reads.set(key, count);
        // The reply carries the value that the store held at the read; another writer's change after the read is seen by the next read.
        const value = wire(store.get(key));
        if (onDataRead !== undefined) onDataRead(key, count, (next) => writeData(key, next));
        return value;
      }
      case "runtime.data.set": {
        const key = params?.key;
        if (!store.has(key)) throw new Refusal(`view call runtime.data.set ${key} is not a data key of ${PLUGIN}`);
        writeData(key, params.value);
        observed.data.push({ key, value: wire(params.value) });
        return null;
      }
      case "runtime.data.replace": {
        const key = params?.key;
        if (!store.has(key)) throw new Refusal(`view call runtime.data.replace ${key} is not a data key of ${PLUGIN}`);
        if (!Object.hasOwn(params ?? {}, "base")) throw new Refusal("view call runtime.data.replace requires base");
        if (JSON.stringify(store.get(key)) !== JSON.stringify(wire(params.base))) return false;
        writeData(key, params.value);
        observed.data.push({ key, value: wire(params.value) });
        return true;
      }
      case "runtime.data.on": {
        subscriptions.add("data");
        return null;
      }
      case "runtime.command.register": {
        const name = params?.name;
        if (!isDeclared("command", name)) throw new Refusal(`command ${name} is not declared by ${PLUGIN}`);
        if (commandsOfView.has(name)) throw new Refusal(`command ${name} is already registered in this view`);
        commandsOfView.add(name);
        registrations.push({ kind: "command", name });
        return null;
      }
      case "runtime.command.run":
        return runCommand(params?.name, params?.params);
      case "runtime.error": {
        observed.errors.push(`surface ${start.surface} ${params?.where}: ${params?.text}`);
        return null;
      }
      case "runtime.log": {
        if (params?.action === "clock") {
          return { ts_us: Date.now() * 1000, mono_ns: Number(process.hrtime.bigint()) };
        }
        if (params?.action !== "batch" || !Array.isArray(params.events)) throw new Refusal(`log action ${params?.action} is not served`);
        for (const event of params.events) {
          logs.push(event);
          for (const waiter of logWaiters.filter((item) => item.event === event.event)) {
            logWaiters.splice(logWaiters.indexOf(waiter), 1);
            waiter.resolve(event);
          }
        }
        return null;
      }
      case "tab.focus":
        return null;
      default:
        if (command.startsWith("runtime.") || command.startsWith("composition.") || command.startsWith("document.")) {
          throw new Refusal(`view call ${command} is not served`);
        }
        return runCommand(command, params);
    }
  }

  // Answers one call of the page: its reply goes through the post path, as the host answers the call.
  const answer = (message) => {
    active += 1;
    // The call runs at once: a command of the view that the host relays reaches the page before the call returns.
    serve(message.command, message.params)
      .then(
        (result) => post({ sok: 1, id: message.id, result: result ?? null }),
        (error) => post({ sok: 1, id: message.id, error: { code: error?.code ?? -32000, message: String(error?.message ?? error) } }),
      )
      .finally(() => {
        active -= 1;
      });
  };

  // A request of the host to the page: the page answers it with a reply of the same id.
  function request(command, params) {
    if (ready === null) return Promise.reject(new Refusal(`${start.surface} has no ready document`));
    const id = ++nextRequest;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      post({ sok: 1, id, command, params: params === undefined ? null : params });
    });
  }

  // Receives each message that the page posts to the handler sok-view.
  const receive = (raw) => {
    if (closed) return;
    const message = wire(raw);
    if (message?.event === "view.ready") {
      ready = { document: message.document, time_origin: message.time_origin };
      return;
    }
    if (message?.event === "view.error") {
      observed.errors.push(`view channel: ${message.reason}`);
      return;
    }
    if (message?.sok !== 1) {
      observed.errors.push("view channel: message without sok 1");
      return;
    }
    if (Object.hasOwn(message, "reply")) {
      const waiting = pending.get(message.reply);
      if (waiting === undefined) return;
      pending.delete(message.reply);
      if (Object.hasOwn(message, "error")) waiting.reject(new Refusal(message.error.message, message.error.code));
      else waiting.resolve(message.result);
      return;
    }
    if (message.cancel === true) {
      // The page ends its wait for a call it cancels. A reply that the host still sends is a late reply, which the page discards.
      return;
    }
    if (!Number.isInteger(message.id) || typeof message.command !== "string") {
      observed.errors.push("view channel: call request needs an integer id and a command");
      return;
    }
    calls.push({ command: message.command, params: message.params, ...(message.cids === undefined ? {} : { cids: message.cids }) });
    answer(message);
  };

  // The handler of the view channel, as the application installs it before the page runs.
  Object.defineProperty(window, LOADER, { value: (specifier) => import(specifier) });
  window.webkit = { messageHandlers: { "sok-view": { postMessage: (message) => receive(message) } } };
  // The start values and the theme are set on the window before the document-start script runs.
  window.sokSurface = Object.freeze(wire(surfaceStart));
  window.sokTheme = Object.freeze({ scheme: theme.scheme ?? "dark", tokens: { ...theme.tokens } });
  // The document-start script of the view channel, which the page reads through window.sokView.
  new vm.Script(CHANNEL_SCRIPT, { filename: "view-channel.js" }).runInContext(context);
  const view = {
    window,
    calls,
    observers,
    observed,
    // Each registration of the page of the kind (status, element or command), in order.
    registered(kind) {
      return registrations.filter((entry) => entry.kind === kind).map((entry) => entry.name);
    },
    // Resolves with the first record that the page sent with the event name, and waits for it if it has not arrived.
    logged(event) {
      const found = logs.find((entry) => entry.event === event);
      if (found !== undefined) return Promise.resolve(found);
      return new Promise((resolve) => logWaiters.push({ event, resolve }));
    },
    // Calls a command of the view, as the host runs a command the page registered; resolves with its result or rejects with its error.
    request(command, params) {
      return request(command, params);
    },
    // Posts a host event to the page: a native event, or the failure of a sidecar session (sidecar-failure), which reaches the page
    // when the page subscribed to it.
    push(type, payload) {
      if (type === "sidecar-failure") {
        deliver(`sidecar.failure:${payload.sidecar}:${payload.surface}`, { sok: 1, event: "sidecar.failure", data: { id: payload.surface, reason: payload.reason } });
        return;
      }
      deliver(`native:${type}`, { sok: 1, event: type, data: payload });
    },
    // Posts a sidecar message of a session to the page, which receives it when it subscribed to the session.
    sidecarMessage(sidecar, session, { body }) {
      deliver(`sidecar.message:${sidecar}:${session}`, { sok: 1, event: "sidecar.message", data: { id: session, body } });
    },
    // Changes a project data value as another writer of the project does, and tells the page of the change.
    change: {
      data(key, value) {
        writeData(key, value);
      },
    },
    // Waits until each call of the page that is in flight has its reply posted.
    async settled() {
      do {
        await new Promise((resolve) => setImmediate(resolve));
      } while (!closed && active > 0);
    },
    // Loads a page module of the plugin in the window and resolves when its start has ended. A failure of the start rejects.
    async load(url) {
      const text = await bundleOf(fileURLToPath(url));
      const script = new vm.Script(`(async () => {\n${text}\n})();`, { filename: fileURLToPath(url) });
      await script.runInContext(context);
      await view.settled();
    },
    // Ends the view as the host does: the page receives pagehide, its messages stop and the window closes.
    close() {
      if (closed) return;
      window.dispatchEvent(new window.Event("pagehide"));
      closed = true;
      window.close();
    },
  };
  return view;
}
