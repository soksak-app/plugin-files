import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the core compatibility documents state the engines.soksak that the package declares", () => {
  const statements = (file) => [...readFileSync(new URL(`../docs/spec/${file}`, import.meta.url), "utf8").matchAll(/`engines\.soksak: "([^"]*)"`/g)]
    .map((match) => match[1]);
  assert.deepEqual(
    { english: statements("core-compatibility.md"), korean: statements("core-compatibility.ko.md") },
    { english: [pkg.engines.soksak], korean: [pkg.engines.soksak] },
  );
});

// The tests are verified only against core 0.0.41, the release that the plugin API devDependency pins: their view test host and
// the surface of view records are that release's, so the package requires it (P112). Core 0.0.40 is the first release that
// accepts exposes.element (P94), and the range starts at the release that the tests verify.
test("the package requires core 0.0.41, the release whose view test host the tests verify (P112)", () => {
  assert.equal(pkg.engines.soksak, "^0.0.41");
});

// A range ^0.0.z admits core 0.0.z and every later 0.0 release (core docs/spec/installation.md#versions-and-ranges), so the
// documents state the later releases and name no exclusion of them (P106).
test("the core compatibility documents state that the range admits every later 0.0 core release (P106)", () => {
  const first = /^\^(0\.0\.\d+)$/.exec(pkg.engines.soksak)?.[1];
  assert.ok(first, `engines.soksak ${pkg.engines.soksak} is not a range ^0.0.z`);
  const text = (file) => readFileSync(new URL(`../docs/spec/${file}`, import.meta.url), "utf8").replace(/\s+/g, " ");
  assert.ok(text("core-compatibility.md").includes(`admits core ${first} and every later 0.0 release`), "core-compatibility.md");
  assert.ok(text("core-compatibility.ko.md").includes(`core ${first}부터 그 뒤의 모든 0.0 release를 허용한다`), "core-compatibility.ko.md");
  for (const file of ["core-compatibility.md", "core-compatibility.ko.md"]) {
    assert.doesNotMatch(text(file), /unverified|검증하지 않은/, `${file} excludes the later releases`);
  }
});
