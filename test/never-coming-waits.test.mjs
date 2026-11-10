// A probe of two waits whose occurrence never comes (docs/spec/calls.md, tests): the runner fails each test at its limit with its
// name.
import { test } from "node:test";
import { createOccurrences } from "./fixtures/occurrences.mjs";

test("the first wait that never comes fails at the limit of the runner", async () => {
  await createOccurrences().until(() => false, "the first occurrence");
});

test("the second wait that never comes fails at the limit of the runner", async () => {
  await createOccurrences().until(() => false, "the second occurrence");
});
