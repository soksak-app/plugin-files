// The plugin-host page entry (docs/spec/plugin-host.md). The page runs the view channel: its calls, exposure and declared
// UI snapshots go through the view bridge of @soksak/plugin-api/view, and its exposure is createExpose over the bridge port.
import { createExpose } from "@soksak/plugin-api";
import { createViewBridge } from "@soksak/plugin-api/view";
import { createHostEmitter, startFilesHost } from "./host-entry.js";
import { mountFilesHost } from "./host-runtime.js";

const start = window.sokHost;
let emitEvent = null;
// The bridge reports each lost call or snapshot and each skip; open-calls is a count of the open calls, which changes at each call.
const bridge = createViewBridge({
  handler: window.webkit.messageHandlers["sok-view"],
  report: (event) => {
    if (event.kind === "open-calls") return;
    const text = [event.where, event.command, event.text].filter((part) => typeof part === "string" && part !== "").join(" ");
    emitEvent(event.kind === "skipped" ? "debug" : "warn", "plugin.files.host.report", { kind: String(event.kind), text });
  },
});
emitEvent = createHostEmitter(bridge);
const expose = createExpose({
  register: (kind, name) => bridge.exposure.register(kind, name),
  onRequest: (answer) => bridge.runtime.native.on("exposure-request", answer),
  reply: (id, payload) => bridge.exposure.reply(id, payload),
  report: (text) => bridge.runtime.error("exposure", text),
}, () => start.declarations);
await startFilesHost({ bridge, expose, start, mount: mountFilesHost });
