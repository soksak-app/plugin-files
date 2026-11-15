# Core compatibility

[한국어](core-compatibility.ko.md)

The files package declares `engines.soksak: "^0.0.41"`, which admits core 0.0.41 and every later 0.0 release ([versions and ranges](https://github.com/soksak-app/core/blob/main/docs/spec/installation.md#versions-and-ranges)). The plugin names no plugin API release: it declares no dependency on `@soksak/plugin-api`, and its tests answer the plugin API with the fixture of `test/fixtures/plugin-api`, so no test runs core's code (P116). `engines.soksak` is the only relation of the package to core. Its `plugin.json` declares
its exposed elements in `exposes.element`: core `0.0.39` and earlier accept only the exposes kinds `status`, `commands` and `dom`, so
they refuse `element`, and core `0.0.40`, the release of core F502-13 (F502-13-1), refuses `exposes.dom`. Its `sections` take the section view form of core
`docs/spec/plugins.md#sections`, a `composition` and a `height`.
