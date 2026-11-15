// Runs a page module of this plugin in a jsdom window of the test process. The page imports the plugin API names, which the resolve hook of
// test/fixtures/plugin-api maps to the fixture modules; its calls are recorded there, and the test answers them. The window is the global
// object of the process while a page runs, so the page reads document, window and the document constructors as it does in the view.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { deliver, recorder, reset, settled } from "./plugin-api/recorder.mjs";

let loads = 0;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PLUGIN = JSON.parse(readFileSync(path.join(ROOT, "plugin.json"), "utf8")).id;

// The names that the surface document declares for the view bridge of every surface (native-surfaces.md, view exposure).
const CORE_DECLARATIONS = {
  status: ["core.surface.document", "core.surface.input"],
  commands: ["core.surface.hit", "core.surface.clock"],
};
// The browser globals that a page reads: the constructors of the document and the functions that read it. The names of the
// window that match BROWSER_GLOBAL are copied to the process globals while a page runs.
const BROWSER_GLOBAL = /^(HTML|SVG|CSS|Mutation|Element|Node|Document|Shadow|Event|Custom|Keyboard|Mouse|Pointer|Focus|Text|Comment|Range|Selection|Resize|Intersection|Visual|Attr|Named|DocumentFragment)|^(customElements|getComputedStyle|getSelection)$/;

/**
 * Loads the page `url` of the plugin in a window. `start` are the surface start values (window.sokSurface, without the core declarations,
 * which the window adds); `theme` sets the scheme and the tokens of the root; `answers` maps each plugin API call to its answer before the
 * page runs, and `store` holds the project data values of the page's keys. Resolves with the view, and with `failure` set to the error of a
 * page whose start rejects. `beforeLoad(view)` runs before the page module, so a fixture that answers the page during its start (a sidecar
 * reply, for example) is attached to the view first.
 */
export async function openPage(url, { start, theme = {}, answers = {}, store = {}, beforeLoad = () => {} }) {
  reset();
  const declared = {
    status: [...(start.declarations?.status ?? []), ...CORE_DECLARATIONS.status.map((name) => ({ name }))],
    element: start.declarations?.element ?? [],
    commands: [...(start.declarations?.commands ?? []), ...CORE_DECLARATIONS.commands.map((name) => ({ name }))],
  };
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: `soksak://${PLUGIN}/index.html`,
    pretendToBeVisual: true,
  });
  const window = dom.window;
  const { document } = window;
  for (const [token, value] of Object.entries(theme.tokens ?? {})) document.documentElement.style.setProperty(token, value);
  document.documentElement.dataset.mode = theme.scheme ?? "dark";
  window.sokSurface = Object.freeze({ ...structuredClone(start), declarations: declared });
  window.webkit = { messageHandlers: { "sok-view": { postMessage() {} } } };
  // The adopted sheets are the list of the document, which the page sets and the tests read; jsdom does not apply them.
  document.adoptedStyleSheets = [];
  window.visualViewport = Object.assign(new window.EventTarget(), { width: window.innerWidth, height: window.innerHeight, scale: 1, offsetLeft: 0, offsetTop: 0 });
  // The observers of the page record their targets, and the test gives each notification.
  const observers = [];
  class PageResizeObserver {
    constructor(callback) {
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
    notify(entries) {
      this.callback(entries, this);
    }
  }
  window.ResizeObserver = PageResizeObserver;
  // The animation frames of the window wait for the test: flushFrames() runs the frames queued so far.
  let frames = [];
  let nextFrame = 0;
  window.requestAnimationFrame = (callback) => {
    frames.push({ id: ++nextFrame, callback });
    return nextFrame;
  };
  window.cancelAnimationFrame = (id) => {
    frames = frames.filter((frame) => frame.id !== id);
  };
  for (const name of Object.getOwnPropertyNames(window)) if (BROWSER_GLOBAL.test(name)) globalThis[name] = window[name];
  globalThis.window = window;
  globalThis.document = document;

  // The data store of the project: a read answers the stored value, and a change is answered by the test with the updater applied to it.
  const data = new Map(Object.entries(structuredClone(store)));
  const view = {
    window,
    document,
    observers,
    calls: recorder.calls,
    failure: null,
    registered: (kind) => recorder.registrations.filter((entry) => entry.kind === kind).map((entry) => entry.name),
    settled,
    flushFrames() {
      while (frames.length > 0) {
        const queued = frames;
        frames = [];
        for (const frame of queued) frame.callback(0);
      }
    },
    // The page's listener of a native event (exposure-request, sidecar-failure, ...) receives the payload.
    push(type, payload) {
      for (const listener of recorder.listeners.get(`native:${type}`) ?? []) listener(payload);
    },
    sidecarMessage(sidecar, session, { body }) {
      for (const listener of recorder.listeners.get(`sidecar.message:${sidecar}:${session}`) ?? []) listener(structuredClone(body));
    },
    sidecarFailure(sidecar, session, reason) {
      for (const listener of recorder.listeners.get(`sidecar.failure:${sidecar}:${session}`) ?? []) listener(reason);
    },
    // A command that the page registered, run as the host runs it: resolves with its result or rejects with its error.
    request(name, params) {
      const handler = recorder.commands.get(name);
      if (handler === undefined) return Promise.reject(new Error(`command ${name} is not registered`));
      try {
        return Promise.resolve(handler(params));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    // Another writer of the project changes a value, and the page is told of the change.
    change: {
      data(key, value) {
        data.set(key, structuredClone(value));
        deliver("data", { key });
      },
    },
    // The record of the page's log event `event` (the name without the plugin prefix), once it has been logged.
    logged(event) {
      const found = recorder.calls.find((entry) => entry.method === "runtime.log" && entry.args.event === event);
      return found === undefined ? Promise.reject(new Error(`the page did not log ${event}`)) : Promise.resolve(found.args);
    },
    // The stored value of a project data key, as the store holds it now.
    stored(key) {
      return structuredClone(data.get(key) ?? null);
    },
    close() {
      window.close();
    },
  };
  // The answers of the project data: a read answers the stored value, a change applies the page's updater, and a test's answer replaces either.
  recorder.answers.set("runtime.data.get", ({ key }) => structuredClone(data.get(key) ?? null));
  // A change applies the page's updater to the stored value, and stores the value that the updater returns, or keeps the stored value.
  recorder.answers.set("runtime.data.change", ({ key, update }) => {
    const next = update(structuredClone(data.get(key) ?? null));
    if (next !== undefined) data.set(key, structuredClone(next));
    return structuredClone(data.get(key) ?? null);
  });
  recorder.answers.set("runtime.data.set", ({ key, value }) => {
    data.set(key, structuredClone(value));
    return null;
  });
  for (const [method, answer] of Object.entries(answers)) recorder.answers.set(method, answer);
  try {
    beforeLoad(view);
    await import(`${url.href}?case=${++loads}`);
    await settled();
  } catch (error) {
    view.failure = error;
  }
  return view;
}

