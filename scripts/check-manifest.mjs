// Checks plugin.json with validateManifest of the pinned @soksak/plugin-api. make check runs it. The import map of
// ui/host.html is not checked against the pinned API: the pinned release publishes the page import map (PAGE_IMPORTS) only,
// and the host page is a view page with the view import map, which the plugin tests check (test/pack-closure.test.mjs).
import { readFileSync } from "node:fs";
import { validateManifest } from "@soksak/plugin-api";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
if (validateManifest(manifest) !== manifest) throw new Error("validateManifest did not return plugin.json");
console.log("Manifest checks passed: plugin.json");
