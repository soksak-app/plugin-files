# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- F238-d-17-1: the DOM-free test reads `ui/declared-data.js` and `ui/host-runtime.js` and fails on `document`, `window`, `innerHTML`, `createElement`, `querySelector` and `appendChild` in either file. Red: with `document.createElement("div");` appended to `ui/host-runtime.js`, the check failed with `DOM APIs found: document, createElement`; the file was restored, and the test passes 3/3.

- P26-3: a text, key or parameter over its limit is sent unchanged, so core rejects it with its rejection text and the section is cleared; `treeValue` and `bookmarkValue` no longer throw for it, and a control character is still rejected. Tests: `test/declared-data.test.mjs` and `test/host-runtime.test.mjs` (24/24), `make test` (68/68).

- P26-2: `treeValue` and `bookmarkValue` keep the longest prefix in listing order whose value, with its cut status-line, fits 1000 list items, 5000 tree nodes, 16 levels and 1048576 bytes of the JSON-serialized value (UTF-8). A row below the first depth-16 row ends the listing instead of being skipped. Tests: `test/declared-data.test.mjs` (17/17), `make test` (65/65).

- P25: new commits are authored as `min-0-max <max@blue.tools>`; `.mailmap` maps the former name `min-median-max`, and published commits are not rewritten.

- P24: `make hooks` sets `.githooks` as the hook folder, so a commit whose message breaks the commit form or the term rules, or whose records break the record rules, is refused when it is made.

## 0.0.6 (2026-10-13)

- P23: Release version 0.0.6 with the event contract (P21) and the record checks (P22); the tag `v0.0.6` publishes `files-0.0.6.tgz`.
- P22: `make test` runs the record check `soksak-records`, and CI checks the form of each pushed commit message with `soksak-commits`.
- P21.4: `@soksak/plugin-api` comes from the core release 0.0.11 and `engines.soksak` is `>=0.0.11`, so `make test` runs the event guard from the installed dependency.
- P21: the forwarder `ui/events.js` marks the event name it passes with `events: forwarded`, so the catalog check of core reads the names at the calls of `emitEvent`.
- P21.3: `make test` runs `soksak-events` with `census.json` and `events.json`; the reason comments have the form `default: <reason>` and the rejection that `inTurn` drops states why it is not recorded.
- P21.2: the state module records each request to the files sidecar (`plugin.files.sidecar.request`), each listing (`plugin.files.list`), each git status (`plugin.files.git`), each change the watch reports (`plugin.files.watch.changed`), each failure that no request caused (`plugin.files.watch.failed`), the failure to open a file (`plugin.files.open.failed`) and the result of each command (`plugin.files.command`). Tests: `test/state.test.mjs`.
- P21.1: `ui/events.js` provides the emitter of the plugin events, `events.json` declares the 7 events of the plugin (`plugin.files.sidecar.request`, `list`, `watch.changed`, `watch.failed`, `git`, `open.failed`, `command`), and `plugin.json` names the catalog in `events`. Tests: `test/events.test.mjs`.
- P19: the vertical and the horizontal file tree show the failure to open a file (`열 수 없음: <text of the error>`) in their message row from the status `files.open` and the command `files.open.failed`, and the error display of the main document no longer shows it.
- P18: the documents and comments call plugins, sidecars and releases by those words.

- F238-d-17: add a DOM-free check for the files declared data module and a fixture that verifies DOM API detection. The declared data module passes (2/2 tests), and an injected fixture is rejected by the same assertion; this verifies the specified DOM-free boundary, not production-defect Red.

- F238-d-24: add a regression check that files sidebar sections use no view-only interactions; the check detects forbidden interactions in a fixture (2/2 tests).

- F238-d-15: add DOM-free constructors for the declared file-tree and bookmark values. Tree values include toolbar bindings, selected path, descendant detail, no-project state, and bounded tree rows; manifest/source integration remains open.

- F238-d-15: validate every tree row before applying row/depth cuts; reject orphan paths, non-directory parents, duplicates and malformed fields. Generate schema-safe node keys and cut bookmark lists at 1000 with a status line. Red/Green: the owning malformed-row cases fail against the prior builder and pass in `test/declared-data.test.mjs` (14/14), including use of the remaining node budget after valid deep rows are cut.

- F238-d-15: move `files.tree` and `files.bookmarks` to the declared UI value schema; remove the standalone git, selection and open statuses. The state source and module consumers now use the tree/list values, with the project label/path preserved. Listing failures do not claim the folder is empty. The declared open command and global listing-error display remain open with their owning contracts.

- F238-d-15: update the manifest, state status providers, and module consumers to use the declared tree and bookmark list values. Preserve the project path label; blank the tree empty text on listing failure so it is not shown as an empty folder. The plugin-open command binding and core listing-error display remain pending their owning contracts.

- F238-d-16: add a DOM-free plugin-host consumer for the files sidecar snapshot/expand/collapse/select protocol, including ordered subscriptions, fresh declared-tree values, and application error reporting. Raise the sidecar dependency floor to 0.0.7. `ui/host.js` imports the `page` and `expose` exports present in core main; core producer source supports the host fields and ordered sidecar API. `ui/host.js` wires those imports through a fake-tested entry adapter (startup 2/2); runtime fake tests pass 4/4. Actual activation remains gated on a published SDK release and pinned-version manifest validation; the manifest is intentionally not enabled.
