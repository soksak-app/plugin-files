# Core compatibility

[한국어](core-compatibility.ko.md)

The files package declares `engines.soksak: "^0.0.40"`, which admits core release `0.0.40` under the core version-range rules and excludes earlier versions and later unverified versions. Its `plugin.json` declares
its exposed elements in `exposes.element`: core `0.0.39` and earlier accept only the exposes kinds `status`, `commands` and `dom`, so
they refuse `element`, and core `0.0.40`, the release of core F502-13 (F502-13-1), refuses `exposes.dom`. Its `sections` take the section view form of core
`docs/spec/plugins.md#sections`, a `composition` and a `height`.
