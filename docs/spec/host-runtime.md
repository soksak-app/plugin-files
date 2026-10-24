# Host runtime

[한국어](host-runtime.ko.md)

The host runtime follows the project shown by its plugin host. The start value and each project message are either `null` or an object with a non-empty `id` and `root`. When the project is `null`, the runtime clears the tree and bookmarks and sends no sidecar request.

A project change ends the previous sidecar session. Its registered message and failure callbacks may still arrive after the project changes, including after it changes to `null`. The runtime ignores callbacks for a session other than the current project's session. It does not report them as errors, mutate the current tree or bookmarks, or derive a session from a missing project.

A later project with an `id` and `root` uses its own sidecar session. A callback from an earlier project is ignored even when it arrives after the later project is shown.
