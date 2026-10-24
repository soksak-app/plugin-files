# Host runtime

[한국어](host-runtime.ko.md)

The host runtime follows the project shown by its plugin host. The start value and each project message are either `null` or an object with a non-empty `id` and `root`. When the project is `null`, the runtime clears the tree and bookmarks and sends no sidecar request.

A project change ends the previous sidecar session. Its registered message and failure callbacks may still arrive after the project changes, including after it changes to `null`. The runtime ignores callbacks for a session other than the current project's session. It does not report them as errors, mutate the current tree or bookmarks, or derive a session from a missing project.

A later project with an `id` and `root` uses its own sidecar session. A callback from an earlier project is ignored even when it arrives after the later project is shown.

## Declared status snapshots

The plugin host registers each exposed status with its full manifest name, such as `files.tree`. The view bridge stores and answers snapshots by the plugin-local status name, such as `tree`. The host adapter therefore passes the suffix after `files.` to `bridge.snapshots.push` for the initial value and every subscribed value. It does not change the full name passed to `expose.status`.

## Declared tree expansion

The host subscribes to `declared-ui.expanded` through `runtime.native.on` before it exposes the declared statuses. The event has `{status, tree, path, expanded}`. The Files host accepts only local status `tree` and declared tree key `files`. `path` is the array of node keys from the root of that declared tree to a branch; it is not a filesystem path. The host resolves the keys against its current `files.tree` value and uses that node's `params.path` for the sidecar request. It does not join node keys or infer a filesystem path from them.

The host sends sidecar operation `expand` when `expanded` is `true` and `collapse` when it is `false`, with the current sidecar generation and the resolved filesystem path. The event states the desired value; the host does not infer a toggle from the current branch. The sidecar reply publishes the complete `files.tree` snapshot. An event with no current project, an unknown tree or status, an invalid key path, or a path that does not name a current branch is reported through the host error route without a sidecar request. A rejected event callback is also reported through that route. The event listener ends when the host runtime is disposed.
