// The manifest check reads validateManifest from CORE_PLUGIN_API_DIR when it is set. A fixture API folder whose
// validateManifest rejects the manifest makes the check fail with the fixture message.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("manifest check fails with the message of the API named by CORE_PLUGIN_API_DIR", { timeout: 60000 }, () => {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "check-manifest.mjs")], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, CORE_PLUGIN_API_DIR: path.join(root, "test", "fixtures", "api-reject") },
  });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /fixture rejects plugin\.json: exposes\.commands\[0\]\.params\.required is outside the schema subset/);
});
