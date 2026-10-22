// Replays the copied contract cases of test/fixtures/contract against the models of test/sdk-models. Each step of a
// replayed case is run and its output is asserted. EXCLUDED_CASES lists every case that the models do not replay, with
// the reason; a case of a copied file that is neither replayed nor listed fails the test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createExpose } from "./expose.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/contract/${name}.json`, import.meta.url), "utf8")).cases;
const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const errorText = (error) => (error instanceof Error ? error.message : String(error?.message ?? error));

const NOT_CALLED_BY_PAGE = "the plugin host page does not call";
const EXCLUDED_CASES = {
  "expose.dom.act-rect-and-refusals": `${NOT_CALLED_BY_PAGE} expose.dom; the page registers no dom name`,
  "expose.dispose.removes-bindings": `${NOT_CALLED_BY_PAGE} expose.bind; the model has no binding`,
  "expose.bind.function-params-are-read-at-each-run": `${NOT_CALLED_BY_PAGE} expose.bind; the model has no binding`,
  "snapshot.push.sends-first-value-and-releases-on-ack": `${NOT_CALLED_BY_PAGE} createSnapshotSender; the SDK sends the value of an exposed status`,
  "snapshot.push.counts-values-overwritten-in-transit": `${NOT_CALLED_BY_PAGE} createSnapshotSender; the SDK sends the value of an exposed status`,
  "snapshot.ack.refuses-a-seq-that-is-not-in-transit": `${NOT_CALLED_BY_PAGE} createSnapshotSender; the SDK sends the value of an exposed status`,
  "snapshot.peer-lost.reports-the-transit-and-the-dirty-value": `${NOT_CALLED_BY_PAGE} createSnapshotSender; the SDK sends the value of an exposed status`,
  "snapshot.peer-lost.refuses-an-unknown-reason": `${NOT_CALLED_BY_PAGE} createSnapshotSender; the SDK sends the value of an exposed status`,
  "snapshot.pull.returns-the-latest-value-and-refuses-a-missing-one": `${NOT_CALLED_BY_PAGE} createSnapshotSender; the SDK answers the pull of an exposed status`,
  "snapshot.receiver.acknowledges-then-delivers": `${NOT_CALLED_BY_PAGE} the snapshot receiver; the page receives no snapshot message`,
  "view.snapshot.pull-without-a-pushed-value-replies-null": `${NOT_CALLED_BY_PAGE} the view bridge snapshot pull; the host page answers no pull`,
  "view.snapshot.pull-replies-the-pushed-value": `${NOT_CALLED_BY_PAGE} the view bridge snapshot pull; the host page answers no pull`,
  "view.snapshot.pull-replies-the-last-pushed-value": `${NOT_CALLED_BY_PAGE} the view bridge snapshot pull; the host page answers no pull`,
  "view.snapshot.pull-refuses-a-missing-status": `${NOT_CALLED_BY_PAGE} the view bridge snapshot pull; the host page answers no pull`,
};

test("every case of a copied file is replayed or listed with its reason", () => {
  const listed = new Set(Object.keys(EXCLUDED_CASES));
  const replayable = new Set(fixture("expose").map((entry) => entry.id).filter((id) => !listed.has(id)));
  const ids = ["expose", "declared-ui-snapshot", "view-snapshot-pull"].flatMap((name) => fixture(name).map((entry) => entry.id));
  for (const id of listed) assert.ok(ids.includes(id), `listed case ${id} is not in the copied fixtures`);
  for (const id of ids) assert.ok(listed.has(id) || replayable.has(id), `case ${id} is neither replayed nor listed`);
});

test("expose cases replay against the exposure model", async () => {
  const replayed = fixture("expose").filter((entry) => !EXCLUDED_CASES[entry.id]);
  assert.ok(replayed.length > 0);
  for (const testCase of replayed) {
    const registered = [];
    const replies = [];
    const subscribers = new Set();
    let handle = null;
    let value = testCase.initial;
    const expose = createExpose({
      register: async (kind, name) => { registered.push({ kind, name }); },
      // The traces record the unregister of the port at dispose.
      unregister: async () => { registered.push({ kind: "unregister" }); },
      onRequest: (answer) => { handle = answer; },
      reply: (id, payload) => { replies.push({ id, payload }); },
    }, testCase.declarations);
    for (const [index, step] of testCase.steps.entries()) {
      const label = `${testCase.id}#${index}`;
      const before = { registered: registered.length, replies: replies.length };
      let throws = null;
      try {
        if (step.status) await expose.status(step.status.name, () => value, (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); });
        else if (step.request) handle(step.request);
        else if (step.set !== undefined) {
          value = step.set;
          for (const fn of [...subscribers]) fn(value);
        } else if (step.dispose) await expose.dispose();
        else if (step.race) {
          // The race of a registration with the dispose: the dispose has begun when the registration is made.
          const disposing = expose.dispose();
          try {
            await expose.status(step.race.name, () => value, () => () => {});
          } catch (failure) {
            throws = errorText(failure);
          }
          await disposing;
        } else throw new Error(`unknown expose step in ${label}`);
      } catch (failure) {
        throws = errorText(failure);
      }
      await settle();
      const output = {
        registered: registered.slice(before.registered),
        replies: replies.slice(before.replies),
        effects: [],
        result: null,
        throws,
      };
      assert.deepEqual(output, step.output, label);
    }
  }
});
