// Registers the resolve hook of the plugin API fixture. The test script loads it with `node --import`, so each test file of `test/` resolves
// the plugin API names of the pages to the fixtures of this repository.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
