// The occurrences of a test (docs/spec/calls.md, tests): a fake host records each occurrence that the code under test causes,
// and a test waits for the state that it asserts. until(holds) resolves in the turn of the first occurrence after which holds()
// is true, or at once when it already is; it checks holds() only when an occurrence is recorded, so it starts no timer, counts
// no turns and polls nothing. A wait ends only by its occurrence; the limit of the test runner (the test script of package.json)
// fails a test whose occurrence does not come with its name.

/** Creates the occurrences of one fake host: occurred() records one, until(holds) waits, list() makes a recording list. */
export function createOccurrences() {
  const waiters = new Set();
  const occurred = () => {
    for (const waiter of [...waiters]) {
      if (waiter.holds()) {
        waiters.delete(waiter);
        waiter.resolve();
      }
    }
  };
  const until = (holds) => (holds() ? Promise.resolve() : new Promise((resolve) => waiters.add({ holds, resolve })));
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
