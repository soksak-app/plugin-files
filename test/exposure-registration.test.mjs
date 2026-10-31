// Every command that plugin.json declares is registered in ui/ under its literal name, as commands.register("name", ...)
// of the view bridge. The repository exposure check matches these literal
// registrations, so a name passed through a constant or a loop variable is not seen by the check.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "plugin.json"), "utf8"));
const ui = readdirSync(path.join(root, "ui")).filter((name) => name.endsWith(".js"));
const source = ui.map((name) => readFileSync(path.join(root, "ui", name), "utf8")).join("\n");

const kinds = [["commands", "commands.register"]];
for (const [key, method] of kinds) {
  test(`every declared ${key} entry is registered with a literal name`, { timeout: 10000 }, () => {
    const missing = (manifest.exposes?.[key] ?? [])
      .map((entry) => entry.name)
      .filter((name) => !source.includes(`${method}("${name}"`));
    assert.deepEqual(missing, [], `declared ${key} names without a literal ${method}() registration`);
  });
}
