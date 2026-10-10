// The message row of a file tree names why the tree shows no files, and why a file did not open (docs/features.md P19).
import assert from "node:assert/strict";
import test from "node:test";

import { openFailure, treeMessage } from "../ui/sections/tree-message.js";

const value = { root: "/p", entries: [], error: null };

test("a tree without a project says so and a failed listing names its error", () => {
  assert.equal(treeMessage(null, undefined, null), "프로젝트 없음");
  assert.equal(treeMessage("main", { ...value, error: "denied" }, null), "오류: denied");
});

test("a failure to open a file is the message of the row, and nothing is shown without a failure", () => {
  assert.equal(treeMessage("main", value, null), null);
  assert.equal(treeMessage("main", value, "no plugin opens test.txt"), "열 수 없음: no plugin opens test.txt");
  assert.equal(treeMessage("main", { ...value, error: "denied" }, "no plugin opens test.txt"), "오류: denied", "the listing error comes first");
});

test("the failure text is the message of the error, and anything else is refused", () => {
  assert.equal(openFailure(new Error("no plugin opens test.txt")), "no plugin opens test.txt");
  assert.throws(() => openFailure("text"), /open failure must be an Error with a message, found "text"/);
  assert.throws(() => openFailure(new Error("")), /open failure must be an Error with a message/);
});
