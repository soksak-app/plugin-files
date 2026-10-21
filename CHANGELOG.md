# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

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

- F238-d-17: add a DOM-free check for the files state module and a fixture that verifies DOM API detection. The module passes (2/2 tests); the target boundary remains subject to F238-d-20.
