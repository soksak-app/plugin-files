// The pre-push hook checks the commit messages and the checklist history that a push publishes, because a published commit
// is kept (F274-files, P101); CI runs the tests and checks on the pushed commits and the same push check on the range of its event.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("make check-push runs only the commit message check and the checklist history check of the pushed range (F274-files, P101)", () => {
  const target = /^check-push:([^\n]*)\n((?:\t[^\n]*\n)+)/m.exec(makefile);
  assert.ok(target, "the Makefile has no check-push target");
  assert.equal(target[1].trim(), "", `check-push depends on ${target[1].trim()}`);
  assert.deepEqual(target[2].trim().split("\n").map((line) => line.trim()), [
    'pnpm exec sok-check commits "$(or $(RANGE),origin/main..HEAD)"',
    'pnpm exec sok-check docs --range "$(or $(RANGE),origin/main..HEAD)"',
  ]);
});

test("CI runs make check-push on the range of its event and no kit command of its own (P101)", () => {
  assert.match(ci, /^ {10}fetch-depth: 0$/m, "the checkout of ci.yml must fetch every commit of the pushed range");
  const step = /^ {6}- name: Pushed range\n {8}if: ([^\n]*)\n {8}run: ([^\n]*)$/m.exec(ci);
  assert.ok(step, "ci.yml has no Pushed range step");
  assert.equal(step[1], "github.event_name == 'pull_request' || github.event.before != '0000000000000000000000000000000000000000'");
  assert.equal(step[2], "make check-push RANGE=${{ github.event_name == 'pull_request' && format('{0}..{1}', github.event.pull_request.base.sha, github.event.pull_request.head.sha) || format('{0}..{1}', github.event.before, github.sha) }}");
  assert.doesNotMatch(ci, /sok-check/, "ci.yml must run the kit commands through the Makefile");
});
