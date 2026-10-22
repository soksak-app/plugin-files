// The workflows run make check after make test (F238-c-24): ci.yml runs make test, then make check; release.yml runs
// make test, then make check, then make pack.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const WORKFLOWS = {
  "ci.yml": ["test", "check"],
  "release.yml": ["test", "check", "pack"],
};

/** The make targets that the run steps of a workflow file invoke, in order. */
function makeTargets(file) {
  return readFileSync(path.join(ROOT, ".github", "workflows", file), "utf8").split("\n")
    .map((line) => /^\s*-?\s*run:\s*(.*)$/.exec(line)?.[1] ?? "")
    .filter((command) => /^make(\s|$)/.test(command))
    .map((command) => command.split(/\s+/)[1]);
}

for (const [file, steps] of Object.entries(WORKFLOWS)) {
  test(`${file} runs ${steps.map((step) => `make ${step}`).join(", then ")} in that order`, () => {
    const targets = makeTargets(file);
    const message = `${file} make targets: ${targets.join(", ") || "none"}`;
    const positions = steps.map((step) => {
      const position = targets.indexOf(step);
      assert.ok(position !== -1, `${file} runs make ${step} (${message})`);
      return position;
    });
    for (let i = 1; i < steps.length; i++) {
      assert.ok(positions[i] > positions[i - 1], `${file} runs make ${steps[i]} after make ${steps[i - 1]} (${message})`);
    }
  });
}
