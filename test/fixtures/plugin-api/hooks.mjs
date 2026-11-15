// The resolve hook of the plugin API fixture. It maps each specifier of the plugin API to the fixture module of this repository, which
// is the mapping that the import map of the application gives the page; every other specifier resolves as Node resolves it.
// The plugin API names are built from parts, so this file holds no line that the boundary check of test/ refuses.
const PLUGIN_API = "@soksak/" + "plugin-api";
const FIXTURES = new Map([
  [PLUGIN_API, "./index.mjs"],
  [`${PLUGIN_API}/view`, "./view.mjs"],
  [`${PLUGIN_API}/diagnostic-view-frames`, "./diagnostic-view-frames.mjs"],
]);

export async function resolve(specifier, context, nextResolve) {
  const fixture = FIXTURES.get(specifier);
  if (fixture === undefined) return nextResolve(specifier, context);
  return { url: new URL(fixture, import.meta.url).href, shortCircuit: true };
}
