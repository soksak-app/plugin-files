// Pins the SHA-256 of each copied contract file in test/fixtures/contract. Each copy is the file of the same name in
// packages/plugin-api/contract of core, copied as bytes; a change to a copy fails here, so a copy is replaced only by
// a new copy of the published file with its digest.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const DIGESTS = {
  "declared-ui-snapshot.json": "92c119d777954ed2f07cf1e98fcd61ac90f0f9a074a0e0965c8290d1465d519b",
  "expose.json": "9f6cd5261c98d0ee3a4c614c6f36aa91a84a27979b1520e90622915174bd3f93",
  "view-bridge.json": "c4b5439c0cdd8156eabf1ff07db21a989314ca7fabcd1c319ec983bef4c1dd9e",
  "view-commands.json": "37205ccb654de3249e37912f0f6375805d970a28cd08bcdb5083f2ab7239c37d",
  "view-native.json": "0044f4bdd08436d487e22db57c2fa8664dbea24a4152e28b24c112b4bace3c80",
  "view-snapshot-pull.json": "14fd388dd1c91ae4d122e76cfd371062961e48d3a048dc8e784bec57029b2e2f",
};

for (const [name, digest] of Object.entries(DIGESTS)) {
  test(`the copy ${name} is the pinned contract file`, () => {
    const bytes = readFileSync(new URL(`./fixtures/contract/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, name);
  });
}
