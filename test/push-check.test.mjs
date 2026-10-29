// The pre-push hook checks only the commit messages that a push publishes, because a published commit message is kept;
// CI runs the tests and checks on the pushed commits (F274-files).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");

test("make push-check runs only the commit message check of the pushed range (F274-files)", () => {
  const target = /^push-check:([^\n]*)\n((?:\t[^\n]*\n)+)/m.exec(makefile);
  assert.ok(target, "the Makefile has no push-check target");
  assert.equal(target[1].trim(), "", `push-check depends on ${target[1].trim()}`);
  assert.deepEqual(target[2].trim().split("\n").map((line) => line.trim()), ['pnpm exec soksak-commits "$(or $(RANGE),origin/main..HEAD)"']);
});
