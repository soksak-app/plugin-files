// The diagnostic declaration of a files section view (core docs/spec/plugins.md#diagnostic-declarations). The start values carry
// the declaration that core read for the plugin in a diagnostic build, or null in a build without it, so the view requests no file
// and registers no diagnostic entry without a declaration.

/**
 * Returns the attach function of the module that the diagnostic declaration of `start` names, or null without a declaration.
 * Start values without the diagnostics member are an error, and so is a failed import of the module.
 */
export async function loadDiagnostics(start) {
  if (!Object.hasOwn(start, "diagnostics")) {
    throw new Error("the start values of the files section view have no diagnostics: window.sokSurface {surface, params, origin, project, declarations, diagnostics, section} carries it");
  }
  if (start.diagnostics === null) return null;
  // The module path of the declaration is relative to the root of the plugin, the folder above this file.
  const { attach } = await import(new URL(`../${start.diagnostics.module}`, import.meta.url).href);
  return attach;
}
