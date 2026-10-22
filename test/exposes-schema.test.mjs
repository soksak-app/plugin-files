// Checks the schemas and the entries of the exposes of plugin.json against the schema subset of the core exposure
// specification (docs/spec/exposure.md, the schema subset). The lists below copy that subset: the keywords
// type, properties, items and enum; the type names of the core validator (checkSchema of core packages/plugin-api);
// and the fields that each kind of exposes entry accepts (validateExposes of the same file). A change of the subset in
// core changes these lists in the same change. make check validates the manifest only with the pinned plugin API, so this
// test is the check of the manifest against the subset of core main.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));

const SCHEMA_KEYWORDS = ["type", "properties", "items", "enum"];
const SCHEMA_TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"];
const ENTRY_FIELDS = {
  status: ["name", "description", "schema"],
  commands: ["name", "description", "params", "result", "timeout"],
  dom: ["name", "description", "many"],
};

function schemaViolations(where, schema) {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return [`${where}: schema must be an object`];
  const violations = [];
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.includes(key)) violations.push(`${where}: keyword ${key} is outside the schema subset`);
  }
  if (schema.type !== undefined) {
    for (const type of [].concat(schema.type)) {
      if (!SCHEMA_TYPES.includes(type)) violations.push(`${where}: type ${JSON.stringify(type)} is not a schema type`);
    }
  }
  if (schema.properties !== undefined) {
    for (const [key, sub] of Object.entries(schema.properties)) violations.push(...schemaViolations(`${where}.${key}`, sub));
  }
  if (schema.items !== undefined) violations.push(...schemaViolations(`${where}.items`, schema.items));
  return violations;
}

function* exposeEntries() {
  for (const [kind, entries] of Object.entries(manifest.exposes ?? {})) {
    for (const entry of entries) yield { kind, entry };
  }
}

test("every exposes schema of plugin.json uses only the schema subset", () => {
  const violations = [];
  for (const { kind, entry } of exposeEntries()) {
    const fields = kind === "status" ? ["schema"] : kind === "commands" ? ["params", "result"] : [];
    for (const field of fields) violations.push(...schemaViolations(`${entry.name} ${field}`, entry[field]));
  }
  assert.deepEqual(violations, []);
});

test("every exposes entry of plugin.json carries only the fields of its kind", () => {
  const violations = [];
  for (const { kind, entry } of exposeEntries()) {
    assert.ok(ENTRY_FIELDS[kind], `exposes kind ${kind} is not declared by this test`);
    for (const key of Object.keys(entry)) {
      if (!ENTRY_FIELDS[kind].includes(key)) violations.push(`${entry.name}: field ${key} is outside the ${kind} entry`);
    }
  }
  assert.deepEqual(violations, []);
});

test("the subset check reports each keyword outside the subset of a schema", () => {
  assert.deepEqual(schemaViolations("probe params", { type: "object", required: ["path"] }), ["probe params: keyword required is outside the schema subset"]);
  assert.deepEqual(schemaViolations("probe params", { type: ["string", "null"] }), []);
});
