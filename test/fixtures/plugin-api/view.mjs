// The fixture of the view entry of the plugin API: createViewBridge, the view bridge of a page (core docs/spec/native-surfaces.md#view-surfaces
// and docs/spec/exposure.md). Each call of the bridge is recorded, and its answer is the one that the test arranged. A command that the
// page registers runs its handler when the test arranges no answer for runtime.command; a name that the page did not register is refused.
import { call, recorder, subscribe } from "./recorder.mjs";

/** Creates the view bridge of a page. The options of the page (`handler`, `report`) are not used by the fixture. */
export function createViewBridge() {
  // A command that the page registered runs its handler, as the host relays a command of the plugin to the view that registered it. Any
  // other name is a command of core: the test answers it through runtime.command, and a name without an answer is refused.
  const runCommand = (name, params) => {
    if (recorder.commands.has(name)) {
      const handler = recorder.commands.get(name);
      recorder.calls.push({ method: "command.run", args: { name, params } });
      try {
        return Promise.resolve(handler(params));
      } catch (error) {
        return Promise.reject(error);
      }
    }
    if (!recorder.answers.has("runtime.command")) return Promise.reject(new Error(`command ${name} is not registered`));
    return call("runtime.command", { name, params });
  };
  const log = (level) => (event, fields) => call("runtime.log", { level, event, fields });
  return {
    runtime: {
      command: runCommand,
      error: (where, text) => call("runtime.error", { where, text }),
      data: {
        get: (key) => call("runtime.data.get", { key }),
        change: (key, update) => call("runtime.data.change", { key, update }),
        on(listener) {
          subscribe("data", listener);
          return call("runtime.data.on", {});
        },
      },
      native: {
        on(name, listener) {
          subscribe(`native:${name}`, listener);
          return call("runtime.native.on", { name });
        },
      },
      sidecar(name) {
        return {
          send: (id, body, cids) => call("runtime.sidecar.send", { sidecar: name, id, body, cids }),
          on(id, listener) {
            subscribe(`sidecar.message:${name}:${id}`, listener);
            return call("runtime.sidecar.on", { sidecar: name, id });
          },
          onFailure(id, listener) {
            subscribe(`sidecar.failure:${name}:${id}`, listener);
            return call("runtime.sidecar.onFailure", { sidecar: name, id });
          },
        };
      },
      log: { error: log("error"), warn: log("warn"), info: log("info"), debug: log("debug"), trace: log("trace") },
    },
    exposure: {
      register(kind, name) {
        recorder.registrations.push({ kind, name });
        return call("exposure.register", { kind, name });
      },
      reply: (payload) => call("exposure.reply", payload),
      changed: (payload) => call("exposure.changed", payload),
    },
    commands: {
      register(name, handler) {
        if (typeof handler !== "function") throw new TypeError(`command ${name} requires a handler function`);
        recorder.commands.set(name, handler);
        recorder.registrations.push({ kind: "command", name });
        return call("commands.register", { name });
      },
    },
  };
}

