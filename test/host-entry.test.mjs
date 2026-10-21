import assert from "node:assert/strict";
import test from "node:test";

import { startFilesHost } from "../ui/host-entry.js";

test("host entry mounts runtime with the exported page, exposure API, and page project", async () => {
  const page = { project: { id: "project-a", root: "/work/a" } };
  const expose = {};
  const calls = [];
  const mounted = { dispose() {} };
  const result = await startFilesHost({ page, expose, mount: async (options) => { calls.push(options); return mounted; } });
  assert.deepEqual(calls, [{ page, expose, project: page.project }]);
  assert.equal(result, mounted);
});

test("host entry rejects missing or invalid page and exposure exports instead of silently skipping startup", async () => {
  const mount = async () => assert.fail("mount must not run");
  for (const [input, message] of [
    [{ expose: {}, mount }, /requires the plugin API page/],
    [{ page: null, expose: {}, mount }, /requires the plugin API page/],
    [{ page: {}, mount }, /requires the plugin API expose API/],
    [{ page: {}, expose: null, mount }, /requires the plugin API expose API/],
    [{ page: {}, expose: {}, mount: null }, /requires a mount function/],
  ]) {
    await assert.rejects(startFilesHost(input), message);
  }
});
