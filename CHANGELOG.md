# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- P21.1: `ui/events.js` provides the emitter of the plugin events, `events.json` declares the 7 events of the plugin (`plugin.files.sidecar.request`, `list`, `watch.changed`, `watch.failed`, `git`, `open.failed`, `command`), and `plugin.json` names the catalog in `events`. Tests: `test/events.test.mjs`.
- P19: the vertical and the horizontal file tree show the failure to open a file (`열 수 없음: <text of the error>`) in their message row from the status `files.open` and the command `files.open.failed`, and the error display of the main document no longer shows it.
- P18: the documents and comments call plugins, sidecars and releases by those words.
