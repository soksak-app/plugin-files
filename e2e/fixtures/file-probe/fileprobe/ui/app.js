// The file probe of the window checks of the files plugin: a tab that a file of the files tree opens reports the path of its params, so a
// check sees which file the tree opened without another real plugin.
import { createExpose } from "@soksak/plugin-api";
import { createViewBridge, createViewReporter } from "@soksak/plugin-api/view";

const bridge = createViewBridge({ handler: window.webkit.messageHandlers["sok-view"],
  report: createViewReporter({ reportError: window.reportError.bind(window), console: window.console }) });
const expose = createExpose({
  register: bridge.exposure.register, reply: bridge.exposure.reply, changed: bridge.exposure.changed,
  report: (text) => bridge.runtime.error("fileprobe exposure", text),
  onRequest: (answer) => bridge.runtime.native.on("exposure-request", answer),
}, () => window.sokSurface.declarations);
// default: a tab that no file opened has no path.
const state = { path: window.sokSurface.params?.path ?? null };
document.getElementById("path").textContent = state.path ?? "";
await expose.status("fileprobe.document", () => state, () => () => {});
