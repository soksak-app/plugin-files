// The plugin-host page entry (docs/spec/plugin-host.md).
import { expose, page } from "@soksak/plugin-api/page";
import { mountFilesHost } from "./host-runtime.js";

if (page && expose) {
  await mountFilesHost({ page, expose, project: page.project });
}
