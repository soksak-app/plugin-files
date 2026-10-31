// A consumer-side model of createExpose of the plugin API, for the replay of test/fixtures/contract/expose.json.
// It covers the status registration and its request methods (status.get, status.watch, status.next, status.unwatch),
// the dom registration (expose.dom with an element, which marks it with its name, or with a provider function, which the
// page marks itself; the dom requests dom.act and dom.rect are not modeled) and the dispose, which the plugin host page
// calls. The conformance test lists the cases of the fixture that the model does not cover.
const CODE_UNKNOWN_STATUS = 1001;
// Each created exposure, with the providers of each dom name: created.at(-1).doms.get(name) lists the provider functions.
export const created = [];
const CODE_METHOD_NOT_FOUND = -32601;

/**
 * Creates the model over a port: register(kind, name), unregister() (optional), onRequest(answer) and reply(id, payload).
 * load() returns the declarations, as createExpose of the plugin API does.
 */
export function createExpose(port, load) {
  const statuses = new Map();
  // The providers of the dom names registered by the page. A name is registered with the port once, and a name that is not
  // declared many accepts one provider, as the SDK does.
  const doms = new Map();
  let disposed = false;
  created.push({ doms });


  const changed = (entry, value) => {
    entry.version += 1;
    entry.value = value;
    for (const pending of entry.pending.splice(0)) {
      if (pending.version < entry.version) port.reply(pending.id, { result: { version: entry.version, value } });
      else entry.pending.push(pending);
    }
  };

  // The fixture has no case with a pending request at unwatch; the model closes such requests, as the watch ends.
  const stopWatching = (entry) => {
    if (!entry.watching) return;
    entry.watching = false;
    entry.unsubscribe();
    entry.unsubscribe = null;
    for (const pending of entry.pending.splice(0)) port.reply(pending.id, { result: { closed: true } });
  };

  const error = (id, code, message) => port.reply(id, { error: { code, message } });

  const handleRequest = ({ id, method, params = {} }) => {
    if (disposed) return;
    const entry = statuses.get(params.name);
    if (method === "status.get") {
      if (!entry) return error(id, CODE_UNKNOWN_STATUS, `unknown status ${params.name}`);
      return port.reply(id, { result: entry.read() });
    }
    if (method === "status.watch") {
      if (!entry) return error(id, CODE_UNKNOWN_STATUS, `unknown status ${params.name}`);
      if (!entry.watching) {
        entry.watching = true;
        entry.unsubscribe = entry.subscribe((value) => changed(entry, value));
      }
      return port.reply(id, { result: null });
    }
    if (method === "status.unwatch") {
      if (!entry) return error(id, CODE_UNKNOWN_STATUS, `unknown status ${params.name}`);
      stopWatching(entry);
      return port.reply(id, { result: null });
    }
    if (method === "status.next") {
      if (!entry) return error(id, CODE_UNKNOWN_STATUS, `unknown status ${params.name}`);
      if (!entry.watching) return port.reply(id, { result: { closed: true } });
      if (params.version < entry.version) return port.reply(id, { result: { version: entry.version, value: entry.value } });
      return entry.pending.push({ id, version: params.version });
    }
    return error(id, CODE_METHOD_NOT_FOUND, `unknown method ${method}`);
  };
  port.onRequest(handleRequest);

  /** Registers a status with its read and subscribe functions. The version starts at 1. */
  async function status(name, read, subscribe) {
    if (disposed) throw new Error("exposure is disposed");
    const declarations = await load();
    if (!(declarations.status ?? []).some((entry) => entry.name === name)) throw new Error(`status ${name} is not declared`);
    if (statuses.has(name)) throw new Error(`status ${name} is already registered`);
    statuses.set(name, { read, subscribe, version: 1, value: read(), watching: false, unsubscribe: null, pending: [] });
    await port.register("status", name);
  }

  /**
   * Registers a dom name. An element is marked with the name and provides itself; a function returns the current elements and
   * marks none, so the page marks each element it draws.
   */
  async function dom(name, target) {
    if (disposed) throw new Error("exposure is disposed");
    const declarations = await load();
    const declared = (declarations.dom ?? []).find((entry) => entry.name === name);
    if (!declared) throw new Error(`dom ${name} is not declared`);
    if (!declared.many && doms.has(name)) throw new Error(`dom ${name} is already registered`);
    let provide;
    if (typeof target === "function") {
      provide = target;
    } else if (typeof target?.dataset === "object") {
      target.dataset.expose = name;
      provide = () => [target];
    } else {
      throw new TypeError(`dom ${name} takes an element or a function that returns the current elements`);
    }
    const first = !doms.has(name);
    doms.set(name, [...(doms.get(name) ?? []), provide]);
    if (first) await port.register("dom", name);
  }

  /**
   * Ends the registration: the watches stop and the port unregisters. The fixture has no case with a pending request at
   * dispose, so the model drops those requests without a reply.
   */
  async function dispose() {
    if (disposed) return;
    disposed = true;
    for (const entry of statuses.values()) {
      if (!entry.watching) continue;
      entry.watching = false;
      entry.unsubscribe();
      entry.pending = [];
    }
    await port.unregister?.();
  }

  return { status, dom, dispose };
}
