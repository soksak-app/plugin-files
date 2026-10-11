// The entrance of the events of this plugin (core docs/spec/plugins.md#logging). A site names the whole event
// `plugin.<id>.<event>`, which the catalog events.json declares; the log of the context takes the name without the prefix.
const LEVELS = ["error", "warn", "info", "debug", "trace"];

/** Returns `emitEvent(level, name, fields)`, which stores the event `name` of the plugin `pluginId` through `runtime.log`. */
export function createEmitter(runtime, pluginId) {
  const prefix = `plugin.${pluginId}.`;
  return function emitEvent(level, name, fields) {
    if (!LEVELS.includes(level)) throw new TypeError(`emitEvent requires a level of ${LEVELS.join(", ")}, found ${JSON.stringify(level)}`);
    if (typeof name !== "string" || !name.startsWith(prefix)) throw new TypeError(`emitEvent requires a name that starts with ${prefix}, found ${JSON.stringify(name)}`);
    // events: forwarded
    runtime.log[level](name.slice(prefix.length), fields);
  };
}
