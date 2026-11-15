// The fixture of the root entry of the plugin API (the entry that the page imports). It exports the two helpers that the pages of this plugin use:
// createBinder (core docs/spec/exposure.md, binder) and createExpose (core docs/spec/exposure.md, exposure). Each helper does what the
// declared interface states; the calls of the page are recorded by recorder.mjs.
import { track } from "./recorder.mjs";

/**
 * The binder of a page. `run(name, params)` is the function that runs a command (the page passes its view bridge), and `check(name)`
 * refuses a name that the page does not declare for itself. bind(element, name, params, {failed}) names the command on the element with
 * data-command and data-params and runs it on a click; params may be a function, which is read at each run. mark(element, name, params)
 * names the command without a listener, and delegate(root, {failed}) runs the command of the element that a click reaches under root.
 */
export function createBinder(run, { check = () => {} } = {}) {
  // A press runs its command at once, as the page's listener receives it; a failure of the command goes to `failed`, or is the result of the run.
  const dispatch = (name, params, failed) => {
    check(name);
    let result;
    try {
      result = Promise.resolve(run(name, params));
    } catch (error) {
      result = Promise.reject(error);
    }
    return track(result.catch((error) => {
      if (failed === undefined) throw error;
      failed(error);
    }));
  };
  const paramsOf = (params) => (typeof params === "function" ? params() : params);
  const name = (element, command, params) => {
    element.dataset.command = command;
    element.dataset.params = JSON.stringify(paramsOf(params));
  };
  return {
    run(command, params) {
      check(command);
      return run(command, params);
    },
    bind(element, command, params, { failed } = {}) {
      check(command);
      name(element, command, params);
      element.addEventListener("click", () => {
        dispatch(command, paramsOf(params), failed);
      });
    },
    mark(element, command, params) {
      check(command);
      name(element, command, params);
    },
    delegate(root, { failed } = {}) {
      root.addEventListener("click", (event) => {
        const element = event.composedPath().find((item) => item.dataset?.command !== undefined);
        if (element === undefined) return;
        dispatch(element.dataset.command, JSON.parse(element.dataset.params), failed);
      });
    },
  };
}

/**
 * The exposure of a page. `bridge` is the exposure of the view bridge: register(kind, name), reply(payload), changed(payload) and the
 * requests of the page arrive through onRequest(answer), which the page subscribes to the exposure-request event. `declarationsOf()`
 * returns the declarations of the surface; a name of a kind that the declarations do not state is refused.
 */
export function createExpose({ register, onRequest, reply, changed }, declarationsOf) {
  const statuses = new Map();
  const elements = new Map();
  const KIND_LISTS = { status: "status", element: "element" };
  const declare = (kind, name) => {
    const list = declarationsOf()?.[KIND_LISTS[kind]] ?? [];
    if (!list.some((entry) => entry.name === name)) throw new Error(`exposure ${kind} ${name} is not declared by this plugin`);
  };
  const versions = new Map();
  const status = (name, read, subscribeTo) => {
    declare("status", name);
    register("status", name);
    statuses.set(name, { read, subscribeTo });
    return Promise.resolve(null);
  };
  // An element of the page is named by its data-expose attribute; a provider function lists the elements that it answers for.
  const element = (name, provider) => {
    declare("element", name);
    register("element", name);
    if (typeof provider === "function") elements.set(name, provider);
    else provider.dataset.expose = name;
    return Promise.resolve(null);
  };
  const watch = (name) => {
    const { read, subscribeTo } = statuses.get(name);
    versions.set(name, { value: undefined, version: 0 });
    const notify = (value) => {
      const state = versions.get(name);
      if (state.version > 0 && JSON.stringify(state.value) === JSON.stringify(value)) return;
      state.value = value;
      state.version += 1;
      changed({ name, value, version: state.version });
    };
    notify(read());
    subscribeTo(notify);
  };
  const answer = ({ id, method, params }) => {
    try {
      if (method === "status.get") {
        const entry = statuses.get(params.name);
        if (entry === undefined) throw new Error(`status ${params.name} is not registered`);
        reply({ id, result: entry.read() });
      } else if (method === "status.watch") {
        if (!statuses.has(params.name)) throw new Error(`status ${params.name} is not registered`);
        watch(params.name);
        reply({ id, result: null });
      } else if (method === "element.elements") {
        // The fixture's name for the list that a provider answers; it is not a method of core, and the tests send it as their request.
        const provider = elements.get(params.name);
        if (provider === undefined) throw new Error(`element ${params.name} is not registered`);
        reply({ id, result: provider() });
      } else {
        throw new Error(`exposure method ${method} is not served`);
      }
    } catch (error) {
      reply({ id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } });
    }
  };
  onRequest(answer);
  return { status, element };
}
