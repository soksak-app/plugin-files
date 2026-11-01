// The window of a view page at the consumer boundary: a fake DOM with the document globals that a view reads, the view
// channel of window.sokSurface, window.sokView and the sok-view handler, and the host side of the calls. A call of the page
// to a runtime name is answered by the test's runtime function. A call to a plugin command is relayed as the host relays it
// (a command request to the page, whose reply goes back to the caller). The fake does not model layout or styles.

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
    this.key = init.key;
    this.target = null;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parent = null;
    this.listeners = new Map();
    this.dataset = {};
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    this.className = "";
    this.textContent = "";
    this.title = "";
    this.hidden = false;
    this.disabled = false;
    this.type = "";
    this.innerHTML = "";
  }
  // An element that already has a parent moves to this one, as in the DOM.
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  appendChild(node) {
    this.append(node);
    return node;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event) {
    event.target = this;
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    return true;
  }
  click() {
    return this.dispatchEvent(new FakeEvent("click"));
  }
}

/** The elements under root (root included) for which the predicate holds, in document order. */
export function findAll(root, predicate) {
  const found = predicate(root) ? [root] : [];
  for (const child of root.children) found.push(...findAll(child, predicate));
  return found;
}

/** Installs the DOM globals of a view page and returns the document. */
export function installFakeDom() {
  // Each MutationObserver of the page is kept with its target, so a fake DOM change of a target notifies its observers.
  globalThis.mutationObservers = [];
  const document = {
    documentElement: new FakeElement("html", null),
    body: null,
    adoptedStyleSheets: [],
    createElement: (tagName) => new FakeElement(tagName, document),
  };
  document.documentElement.dataset = { mode: "dark" };
  document.body = document.createElement("body");
  document.documentElement.append(document.body);
  globalThis.document = document;
  globalThis.CustomEvent = class CustomEvent extends FakeEvent {};
  globalThis.CSSStyleSheet = class CSSStyleSheet {
    replaceSync(text) {
      this.text = text;
    }
  };
  globalThis.MutationObserver = class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
    }
    observe(target) {
      this.target = target;
      globalThis.mutationObservers.push(this);
    }
    disconnect() {
      globalThis.mutationObservers = globalThis.mutationObservers.filter((observer) => observer !== this);
    }
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  return document;
}

/** Waits until the pending promise callbacks of the page have run. */
export async function settle() {
  for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Starts a view page in the fake window. start is window.sokSurface. runtime(message) answers a call to a runtime name with its
 * result or throws its error; sidecar is not called here, because the runtime function answers runtime.sidecar.send itself.
 * Returns the posted calls, the errors and log records of the page, and deliver(message), which stands for window.sokView.attach.
 */
export function installViewWindow({ start, plugin = "files", runtime }) {
  installFakeDom();
  const posted = [];
  const relays = new Map();
  const errors = [];
  const logs = [];
  let deliver = null;
  let relayId = 90000;
  const host = {
    posted,
    errors,
    logs,
    deliver: (message) => deliver(message),
    // Relays a command request to the page as the host does, and resolves with the page's reply.
    relay: (command, params) => new Promise((resolve) => {
      const id = ++relayId;
      relays.set(id, resolve);
      queueMicrotask(() => deliver({ id, command, params }));
    }),
  };
  globalThis.location = { host: plugin, href: `soksak://${plugin}/ui/page.html` };
  globalThis.window = globalThis;
  globalThis.sokSurface = start;
  globalThis.sokView = {
    page: "page-1",
    timeOrigin: 0,
    attach(receiver) {
      deliver = receiver;
    },
  };
  globalThis.webkit = {
    messageHandlers: {
      "sok-view": {
        postMessage(message) {
          posted.push(message);
          if (message.reply !== undefined) {
            const resolve = relays.get(message.reply);
            relays.delete(message.reply);
            if (resolve) resolve(message);
            return;
          }
          const name = message.command;
          if (typeof name === "string" && name.startsWith("runtime.")) {
            if (name === "runtime.error") errors.push(message.params);
            if (name === "runtime.log") logs.push(message.params);
            Promise.resolve().then(() => runtime(message, host)).then(
              (result) => deliver({ id: message.id, result: result ?? null }),
              (error) => deliver({ id: message.id, error: { code: -32000, message: String(error?.message ?? error) } }),
            );
            return;
          }
          // A plugin command of the page: the host relays it to the page's own registration and answers the caller with the reply.
          host.relay(name, message.params).then((reply) => {
            if (reply.error !== undefined) deliver({ id: message.id, error: reply.error });
            else deliver({ id: message.id, result: reply.result ?? null });
          });
        },
      },
    },
  };
  return host;
}

let exposureRequestId = 0;

/**
 * Sends one exposure request of the surface to the page, as the host forwards it, and returns its id. The page answers through
 * the exposureReply call; replyOf finds that reply.
 */
export function sendExposureRequest(host, surface, method, params) {
  const id = `probe-${++exposureRequestId}`;
  host.deliver({ event: "exposure-request", data: { id, surface, method, params } });
  return id;
}

/** The payloads {name, value, version} of the changed calls of the page for a status name, in the order the page sent them. */
export function changedOf(host, name) {
  return host.posted
    .filter((message) => message.command === "runtime.native.call" && message.params?.name === "changed" && message.params.payload.name === name)
    .map((message) => message.params.payload);
}

/** The answer of the page to a request id, {result} or {error}, or undefined while the page has not replied. */
export function replyOf(host, id) {
  const replies = host.posted.filter((message) => message.command === "runtime.native.call" && message.params?.name === "exposureReply" && message.params.payload.id === id);
  if (replies.length === 0) return undefined;
  const { id: _id, ...answer } = replies[0].params.payload;
  return answer;
}

/** The exposure entries that the page registered, as {kind, name} in registration order. */
export function registeredEntries(host) {
  return host.posted.filter((message) => message.command === "runtime.native.call" && message.params?.name === "registered").map((message) => message.params.payload);
}
