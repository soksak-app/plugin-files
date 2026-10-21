// Small entry adapter kept separate from SDK imports so its startup contract is testable.
export async function startFilesHost({ page, expose, mount } = {}) {
  if (!page || typeof page !== "object") {
    throw new TypeError("files host entry requires the plugin API page");
  }
  if (!expose || typeof expose !== "object") {
    throw new TypeError("files host entry requires the plugin API expose API");
  }
  if (typeof mount !== "function") {
    throw new TypeError("files host entry requires a mount function");
  }
  return mount({ page, expose, project: page.project });
}
