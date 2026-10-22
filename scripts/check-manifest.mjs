// Checks plugin.json and the import map of ui/host.html with the validators of the pinned @soksak/plugin-api.
// make check runs it; the plugin tests in make test check the same declarations with fixtures instead.
import { readFileSync } from "node:fs";
import { PAGE_IMPORTS, pageImports, validateManifest } from "@soksak/plugin-api";

const manifest = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
if (validateManifest(manifest) !== manifest) throw new Error("validateManifest did not return plugin.json");
const html = readFileSync(new URL("../ui/host.html", import.meta.url), "utf8");
if (JSON.stringify(pageImports(html)) !== JSON.stringify(PAGE_IMPORTS)) {
  throw new Error("ui/host.html does not declare the documented plugin-page import map");
}
console.log("Manifest checks passed: plugin.json and ui/host.html");
