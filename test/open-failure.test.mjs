import assert from "node:assert/strict";
import test from "node:test";

import { openFailure } from "../ui/sections/open-failure.js";

test("open failure text is the message of the Error", () => {
  assert.equal(openFailure(new Error("no plugin opens test.txt")), "no plugin opens test.txt");
  assert.throws(() => openFailure("text"), /open failure must be an Error with a message, found "text"/);
  assert.throws(() => openFailure(new Error("")), /open failure must be an Error with a message/);
});
