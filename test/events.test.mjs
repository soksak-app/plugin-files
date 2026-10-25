// The emitter of the plugin events and the catalog that plugin.json names (core docs/spec/logging.md#catalog).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function fakeRuntime() {
  const stored = [];
  const log = Object.fromEntries(["error", "warn", "info", "debug", "trace"].map((level) => [level, (event, fields) => stored.push({ level, event, fields })]));
  return { runtime: { log }, stored };
}

test("the emitter stores the event without the plugin prefix at the level it names", async () => {
  const { createEmitter } = await import("../ui/events.js");
  const { runtime, stored } = fakeRuntime();
  const emitEvent = createEmitter(runtime, "files");
  emitEvent("warn", "plugin.files.watch.failed", { error: "gone" });
  assert.deepEqual(stored, [{ level: "warn", event: "watch.failed", fields: { error: "gone" } }]);
});

test("the emitter refuses a name of another plugin and a level that the log does not have", async () => {
  const { createEmitter } = await import("../ui/events.js");
  const { runtime, stored } = fakeRuntime();
  const emitEvent = createEmitter(runtime, "files");
  assert.throws(() => emitEvent("info", "plugin.editor.open", {}), /plugin\.files\./);
  assert.throws(() => emitEvent("loud", "plugin.files.list", {}), /level/);
  assert.deepEqual(stored, []);
});

test("plugin.json names the catalog, which declares only events of this plugin and is published", () => {
  assert.equal(manifest.events, "events.json");
  assert.ok(pkg.files.includes("events.json"));
  const catalog = JSON.parse(readFileSync(new URL("../events.json", import.meta.url), "utf8"));
  assert.equal(catalog.schema, 3);
  assert.deepEqual(catalog.layers, ["plugin"]);
  assert.ok(Object.keys(catalog.events).length > 0);
  for (const [name, event] of Object.entries(catalog.events)) {
    assert.match(name, /^plugin\.files\.[a-z_]+(\.[a-z_]+)*$/, name);
    assert.equal(event.layer, "plugin", name);
    assert.ok(event.description.length > 0, name);
    assert.equal(event.fields.$schema, "https://json-schema.org/draft/2020-12/schema", name);
    assert.equal(event.fields.type, "object", name);
    assert.ok(Array.isArray(event.fields.required), name);
    for (const field of event.fields.required) assert.ok(Object.hasOwn(event.fields.properties, field), `${name}.${field}`);
  }
});
