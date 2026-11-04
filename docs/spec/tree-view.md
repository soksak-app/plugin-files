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

The header buttons carry the dom names `files.tree.refresh` (the refresh button) and `files.bookmarks.add` (the star button). The tree
rows carry the dom name `files.tree.row` (`many`). The page registers one provider of the name, which returns the rows that the library
draws now: the elements with `data-item-path` in the open shadow root of the tree container. The library has no hook for a row element,
so the page marks each row when that root changes (a subtree mutation). Each bookmark row carries `files.bookmarks.item`, and its remove
button carries `files.bookmarks.remove`. Both names declare `many` and have one provider each, which returns the rows drawn now, so a
removed row is not provided.

## Diagnostic entries

`diagnostics.json` declares the section-view entries of the view benchmark of core (core `docs/spec/plugin-processes.md#section-views`)
with the module `ui/section-diagnostics.js`, and `files` of `package.json` lists both. A view reads the declaration from `diagnostics` of
its start values: start values without the member are an error, a `null` declaration loads nothing, and otherwise the view imports the
module that the declaration names and serves the entries on its own surface once its first content is drawn.

- `<section id>.view.ready` is the status `{ready, content, language}` of each view, and a view registers only its own under the name
  written at its registration. The schema of `files.tree.view.ready` declares `content` as an enum of `test-project` and `language` as an
  enum of `en-US`; that text is what the head title of the tree view shows in the project folder of the same name. The schema of
  `files.bookmarks.view.ready` declares `content` as an enum of `북마크 없음` and `language` as an enum of `ko-KR`; that text is what the
  message line of the bookmarks view shows in a project without bookmarks. That is the state in which the view benchmark opens a section,
  and the entries change nothing that a view shows. Each schema of `diagnostics.json` uses only the schema subset of core, so a fixed
  value is an enum of one entry. The module reads both values from the declaration of the start values, and a declaration without an
  enum of one string is an error that names the status and the field. `ready` is true only while the element is in the document, not hidden, and shows the text, so another text turns it `false`,
  and an error that replaces the text on the message line turns it `false` for the watchers of the status.
- `files.view.history` answers `{length}`, the length of the session history of the view document.
- `files.view.frames {action}` with `start` reads the theme colors `--card`, `--bg`, `--edge`, `--rule` and `--focus` of the root, each
  as `#rrggbb` (another value is an error that names the token), and takes as `markerColor` the first of magenta, cyan, yellow, green,
  red and blue that differs from each of them by more than 4 in at least one channel. It starts `observeViewDocumentFrames` on the view
  document, writes each frame as `plugin.files.view.content_frame`, paints the root with `markerColor` through an adopted style sheet of
  important declarations of `background-color` and `--card`, and answers `{enabled: true, sourceClock, markerColor}`, where `sourceClock`
  is `{documentTimeOriginMs, sourceNowMs, sourceResolutionMs: 1}` of the document clock. `stop` stops the observer, removes the sheet and
  answers `{enabled: false}`. A second `start`, a `stop` without a `start` and another action are errors.
