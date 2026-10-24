# Host runtime

[한국어](host-runtime.ko.md)

The host runtime follows the project shown by its plugin host. The start value and each project message are either `null` or an object with a non-empty `id` and `root`. When the project is `null`, the runtime clears the tree and bookmarks and sends no sidecar request.

The start project seeds the initial tree value, but it is not the current project for operations until the first delivery through `page.onProject`. Before that delivery, project-dependent commands fail with an explicit readiness error; they do not silently return success or perform I/O. The host sends the project currently shown after the plugin-host page becomes ready, including `null`. This delivery confirms the current project because it may differ from the start value if the window changed projects before the page became ready. A first delivery equal to the start project initializes that project once; a first `null` delivery clears the tree and bookmarks and performs no project-specific operation. Later repeated values remain idempotent.

Project initialization subscribes to the sidecar before reading project data or requesting a snapshot. If another project delivery changes the current project while that subscription is pending, the earlier initialization stops when the subscription resolves. It does not read data for the new project through the old transition or request a snapshot for the old project. A refusal from an operation that still belongs to the current project remains reportable.

Before the first project delivery, the bookmarks status reads as no project with an empty list. Registering the status must not dereference the non-authoritative start value as the current project or read project data.

A refusal from a project-dependent host or sidecar operation is reported while the project captured by that operation is still current, including a refusal whose text says `no project is shown`. The runtime cancels an in-flight operation without reporting only after the project changes from the operation's captured project. It does not classify an error as cancellation by matching its text.

A project change ends the previous sidecar session. Its registered message and failure callbacks may still arrive after the project changes, including after it changes to `null`. The runtime ignores callbacks for a session other than the current project's session. It does not report them as errors, mutate the current tree or bookmarks, or derive a session from a missing project.

A later project with an `id` and `root` uses its own sidecar session. A callback from an earlier project is ignored even when it arrives after the later project is shown.

A repeated project message with the current `id` and `root` is not a project change. The runtime preserves its tree, bookmarks and pending work and starts no sidecar or project-data request. A changed `root` is a project change even when the `id` is unchanged.

## Declared status snapshots

The plugin host registers each exposed status with its full manifest name, such as `files.tree`. The view bridge stores and answers snapshots by the plugin-local status name, such as `tree`. The host adapter therefore passes the suffix after `files.` to `bridge.snapshots.push` for the initial value and every subscribed value. It does not change the full name passed to `expose.status`.

## Declared tree expansion

The host subscribes to `declared-ui.expanded` through `runtime.native.on` before it exposes the declared statuses. The event has `{status, tree, path, expanded}`. The Files host accepts only local status `tree` and declared tree key `files`. `path` is the array of node keys from the root of that declared tree to a branch; it is not a filesystem path. The host resolves the keys against its current `files.tree` value and uses that node's `params.path` for the sidecar request. It does not join node keys or infer a filesystem path from them.

The host sends sidecar operation `expand` when `expanded` is `true` and `collapse` when it is `false`, with the current sidecar generation and the resolved filesystem path. The event states the desired value; the host does not infer a toggle from the current branch. The sidecar reply publishes the complete `files.tree` snapshot. An event with no current project, an unknown tree or status, an invalid key path, or a path that does not name a current branch is reported through the host error route without a sidecar request. A rejected event callback is also reported through that route. The event listener ends when the host runtime is disposed.
