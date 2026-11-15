// The recorder of the plugin API fixture. Each export of the fixture (`index.mjs`, `view.mjs`, `diagnostic-view-frames.mjs`) records
// its calls here with the arguments that the page passed, and a test arranges the answer of each call: a value, a function of the
// arguments, or an Error that the call rejects with. The fixture does what the declared interface states (core docs/spec/exposure.md
// and docs/spec/plugins.md) and no more: the texts and rules of core's implementation are not reproduced, so a test that needs one
// arranges it as an answer.
export const recorder = {
  // Each call in order: {method, args}.
  calls: [],
  // The arranged answer of each method, by method name.
  answers: new Map(),
  // The listeners of the subscriptions of the page, by key (`native:<name>`, `data`, `sidecar.message:<sidecar>:<id>`, ...).
  listeners: new Map(),
  // The command handlers that the page registered, by name.
  commands: new Map(),
  // The registrations of the page, in order: {kind, name}.
  registrations: [],
  // The promises of the calls in flight; a test waits for them with settled().
  pending: new Set(),
};

/** Clears the recorder for a new page: the calls, the answers, the subscriptions, the handlers and the registrations. */
export function reset() {
  recorder.calls.length = 0;
  recorder.answers.clear();
  recorder.listeners.clear();
  recorder.commands.clear();
  recorder.registrations.length = 0;
  recorder.pending.clear();
}

/** Returns the answer that a test arranged for `method` with `args`: a value, or the result of the function, or a throw of an Error. */
function answerOf(method, args) {
  if (!recorder.answers.has(method)) return null;
  const answer = recorder.answers.get(method);
  if (answer instanceof Error) throw answer;
  return typeof answer === "function" ? answer(args) : answer;
}

/** Records a call and returns the promise of its answer. The promise is tracked until it settles, so a test can wait for it. */
export function call(method, args) {
  recorder.calls.push({ method, args });
  let promise;
  try {
    promise = Promise.resolve(answerOf(method, args));
  } catch (error) {
    promise = Promise.reject(error);
  }
  return track(promise);
}

/** Tracks a promise of the page's work until it settles, so that settled() waits for it. Returns the promise. */
export function track(promise) {
  recorder.pending.add(promise);
  const done = () => recorder.pending.delete(promise);
  promise.then(done, done);
  return promise;
}

/** Subscribes the listener to `key`. A key holds one listener per subscription, in order. */
export function subscribe(key, listener) {
  if (typeof listener !== "function") throw new TypeError(`subscription ${key} requires a listener function`);
  if (!recorder.listeners.has(key)) recorder.listeners.set(key, []);
  recorder.listeners.get(key).push(listener);
}

/** Delivers a message to each listener of `key`, in subscription order. */
export function deliver(key, message) {
  for (const listener of recorder.listeners.get(key) ?? []) listener(message);
}

/**
 * Waits until the page has no call in flight and its continuations have run: each round lets the microtask queue drain (one turn of the
 * event loop, which runs after every promise that is ready), and the wait ends when a round finds no call in flight.
 */
export async function settled() {
  do {
    await new Promise((resolve) => setImmediate(resolve));
  } while (recorder.pending.size > 0);
}
