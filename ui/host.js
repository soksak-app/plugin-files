// The plugin-host page entry (docs/spec/plugin-host.md).
import { expose, page } from "@soksak/plugin-api/page";
import { mountFilesHost } from "./host-runtime.js";
import { startFilesHost } from "./host-entry.js";

await startFilesHost({ page, expose, mount: mountFilesHost });
