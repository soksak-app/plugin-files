// The adapter from the view bridge to the page API of the files host runtime. The runtime takes the sidecar, the error
// report, the core command of a file row, the project data of the bookmarks, the event records, and the declared statuses
// and commands; each one goes through the bridge (docs/spec/plugin-host.md).
import { createEmitter } from "./events.js";

/**
 * Creates the emitter of the plugin events of the host page through the log of the bridge (runtime.log): each record is stored as
 * plugin.files.<event>, as the views store theirs. A refused record reaches the error route of the page (the bridge's log).
 */
export function createHostEmitter(bridge) {
  return createEmitter(bridge.runtime, "files");
}

export async function startFilesHost({ bridge, expose, start, mount } = {}) {
  if (!bridge || typeof bridge !== "object") {
    throw new TypeError("files host entry requires the view bridge");
  }
  if (!expose || typeof expose !== "object") {
    throw new TypeError("files host entry requires the exposure of the view page");
  }
  if (!start || typeof start !== "object") {
    throw new TypeError("files host entry requires the start values of the page");
  }
  if (typeof mount !== "function") {
    throw new TypeError("files host entry requires a mount function");
  }
  const page = {
    project: start.project,
    // The project message of the host carries each change of the shown project, as the theme does (docs/spec/plugin-host.md).
    onProject: (listener) => bridge.runtime.project(listener),
    sidecar: (name) => bridge.runtime.sidecar(name),
    report: ({ level, where, text }) => {
      if (level !== "error") throw new TypeError(`files host reports only errors, got ${level}`);
      return bridge.runtime.error(where, text);
    },
    open: (path) => bridge.runtime.command("core.file.open", { path }),
    data: {
      get: (key) => bridge.calls.request("runtime.data.get", { key }),
      set: (key, value) => bridge.calls.request("runtime.data.set", { key, value }).then(() => undefined),
    },
    emit: createHostEmitter(bridge),
  };
  const adapter = {
    // A declared status is registered through the exposure, and each value of it is pushed as a declared UI snapshot. The
    // pull of the status is answered by the bridge, so the page answers no status request.
    status: async (name, read, subscribe) => {
      await expose.status(name, read, subscribe);
      subscribe((value) => bridge.snapshots.push(name, value));
      bridge.snapshots.push(name, read());
    },
    command: (name, run) => bridge.commands.register(name, run),
  };
  return mount({ page, expose: adapter, project: start.project });
}
