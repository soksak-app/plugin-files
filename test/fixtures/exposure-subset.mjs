// The copy of the schema subset of the core exposure specification (core docs/spec/exposure.md, the schema subset) that
// test/exposes-schema.test.mjs checks plugin.json against: the keywords type, properties, items and enum; the type names of the
// core validator (checkSchema of core packages/plugin-api); and the fields that each kind of exposes entry accepts
// (validateExposes of the same file). A change of the subset in core changes this copy in the same change.
export const SCHEMA_KEYWORDS = ["type", "properties", "items", "enum"];
export const SCHEMA_TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"];
export const ENTRY_FIELDS = {
  status: ["name", "description", "schema"],
  commands: ["name", "description", "params", "result"],
  element: ["name", "description", "many"],
};
