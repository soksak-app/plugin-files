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
  "view-snapshot-pull.json": "8b20069bfc12300dd7a2774b2dfa1e8e07fe47651e3d5bf5136a124d9e75baae",
};

for (const [name, digest] of Object.entries(DIGESTS)) {
  test(`the copy ${name} is the pinned contract file`, () => {
    const bytes = readFileSync(new URL(`./fixtures/contract/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, name);
  });
}
