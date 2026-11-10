// The occurrences of a test (docs/spec/calls.md, tests): a fake host records each occurrence that the code under test causes,
// and a test waits for the state that it asserts. until(holds, what) resolves in the turn of the first occurrence after which
// holds() is true, or at once when it already is; it checks holds() only when an occurrence is recorded, so it starts no timer,
// counts no turns and polls nothing.
//
// The end of the event loop is the event after which no occurrence can come: the process emits beforeExit when nothing is left to
// run, and each wait that is still open then is rejected with the state that it waits for, so the test fails by that event.

const open = new Set();
process.on("beforeExit", () => {
  for (const waiter of [...open]) {
    open.delete(waiter);
    waiter.reject(new Error(`the event loop ended before ${waiter.what}`));
  }
});

/** Creates the occurrences of one fake host: occurred() records one, until(holds, what) waits, list() makes a recording list. */
export function createOccurrences() {
  const waiters = new Set();
  const occurred = () => {
    for (const waiter of [...waiters]) {
      if (waiter.holds()) {
        waiters.delete(waiter);
        open.delete(waiter);
        waiter.resolve();
      }
    }
  };
  const until = (holds, what = `the state of ${holds}`) => (holds() ? Promise.resolve() : new Promise((resolve, reject) => {
    const waiter = { holds, what, resolve, reject };
    waiters.add(waiter);
    open.add(waiter);
  }));
  // A list whose push records an occurrence after the items are in the list.
  const list = (items = []) => {
    const recorded = [...items];
    const push = recorded.push.bind(recorded);
    // The push is not enumerable, so the list compares equal to an array of the same items.
    Object.defineProperty(recorded, "push", {
      value: (...values) => {
        const length = push(...values);
        occurred();
        return length;
      },
    });
    return recorded;
  };
  return { occurred, until, list };
}
