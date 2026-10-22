// Pins the SHA-256 of each copied contract file in test/fixtures/contract. Each copy is the file of the same name in
// packages/plugin-api/contract of core, copied as bytes; a change to a copy fails here, so a copy is replaced only by
// a new copy of the published file with its digest.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const DIGESTS = {
  "declared-ui-snapshot.json": "92c119d777954ed2f07cf1e98fcd61ac90f0f9a074a0e0965c8290d1465d519b",
  "expose.json": "4d2f89e569fe8fb2c7a2b60d8217f6cd6b7d43a4ea77a07f5e2cbc9ba60cc8aa",
  "view-bridge.json": "4b3432dd370cb76a2cb5ad99c269725b1689d145d907b688c1bc096d7c0f6b81",
  "view-commands.json": "aef59ff9733a122d6d166ccf788c17a5753eac3283e7589f2aadc1d886cb00c7",
  "view-native.json": "0044f4bdd08436d487e22db57c2fa8664dbea24a4152e28b24c112b4bace3c80",
  "view-snapshot-pull.json": "14fd388dd1c91ae4d122e76cfd371062961e48d3a048dc8e784bec57029b2e2f",
};

for (const [name, digest] of Object.entries(DIGESTS)) {
  test(`the copy ${name} is the pinned contract file`, () => {
    const bytes = readFileSync(new URL(`./fixtures/contract/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, name);
  });
}
