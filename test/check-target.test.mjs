import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const make = (...args) => execFileSync("make", args, { cwd: root, encoding: "utf8" });
const SDK_TOOLS = ["soksak-exposure", "soksak-engines", "soksak-events", "soksak-records"];

test("test runs plugin tests only", () => {
  const output = make("-n", "test");
  assert.ok(output.includes("pnpm test"));
  for (const command of SDK_TOOLS) {
    assert.equal(output.includes(command), false, "test runs " + command);
  }
});

test("check runs the SDK validation subset without running plugin tests", () => {
  const output = make("-n", "check");
  for (const command of SDK_TOOLS) {
    assert.ok(output.includes(command), "check omits " + command);
  }
  assert.ok(output.includes("--census census.json --catalog events.json"));
  assert.equal(output.includes("pnpm test"), false);
});

test("pack runs check before pnpm pack", () => {
  const output = make("-n", "pack", "OUT=/tmp/files-check-package");
  const check = output.indexOf("soksak-exposure");
  const pack = output.indexOf("pnpm pack --pack-destination /tmp/files-check-package");
  assert.ok(check >= 0, "pack omitted the check prerequisites");
  assert.ok(pack > check, "pack ran before check");
});
