# Tree and bookmarks views

[한국어](tree-view.ko.md)

The `files.tree` and `files.bookmarks` sections are view pages (`ui/tree.html`, `ui/bookmarks.html`) of the plugin. Each view reads its
start values from `window.sokSurface`: `project` is `null` or an object with a non-empty `id` and `root`, and `surface` names the
section surface. A view with a `null` project sends no sidecar request and reads no project data.

## Tree view

The view sends each request to `@soksak/sidecar-files` with the session id `surface`, in the form that the wire contract declares
(`test/fixtures/sidecar-files/tree-wire.json`): `snapshot`, and `expand`, `collapse` and `select` with the `generation` of the last
reply and the `path`. `select` takes `""` to clear the selection. A reply is valid when it has a `generation` of at least 1, a list of
rows with `path`, `name`, `directory`, `depth` and `selected`, a `directory` row with `expanded`, and an optional `detail` text; another
reply is an error. A change line with `changed` requests a new `snapshot`. A failure of the session or a sidecar error is shown on the
message line and written to the error line of the view with `where` `files tree`.

Each user action is a declared command of the view: `files.refresh`, `files.select`, `files.tree.toggle` (folder expansion, with
`expanded`), `files.open` (a double click or Enter on a file, which runs `core.file.open`), `files.open.failed` and
`files.bookmarks.add` (the star button, which adds the selected file to the stored `bookmarks`). The rows are drawn with the vendored
`@pierre/trees` bundle; the library's expansion and selection follow the last reply.

## Bookmarks view

The view reads the project data key `bookmarks` (a list of paths) with `runtime.data.get` and removes a path with the command
`files.bookmarks.remove`, which writes the list through `runtime.data.set`. The view subscribes with `runtime.data.on` before its first read,
and it re-reads the list when a change event names the key `bookmarks`; a change of another key reads nothing. A stored value that is not a
list of paths is an error, and the list is not drawn from it.

## Exposed state

The tree view declares the status `files.tree`. Its value is `{rows, message}`: `rows` lists each visible row of the tree in display
order with `path`, `kind` (`file` or `directory`), `depth`, `expanded` and `selected`, and `message` is the text of the message row, or
`null` when no message row shows. The bookmarks view declares the status `files.bookmarks`, whose value is the list of the bookmarked
paths in stored order. Each status notifies its watchers with the value after each change of the state it reports.

The header buttons carry the dom names `files.tree.refresh` (the refresh button) and `files.bookmarks.add` (the star button). Each
bookmark row carries `files.bookmarks.item`, and its remove button carries `files.bookmarks.remove`; both names declare `many`. The
tree rows carry no dom name: a row is read through `files.tree` and operated through `files.select` and `files.tree.toggle`.
