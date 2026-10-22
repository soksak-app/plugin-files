// A plugin API stand-in for the manifest check: validateManifest rejects every manifest with one known message.
export function validateManifest() {
  throw new Error("fixture rejects plugin.json: exposes.commands[0].params.required is outside the schema subset");
}
