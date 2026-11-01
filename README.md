# Files plugin

[한국어](README.ko.md)

Files plugin: sidebar sections for the project directory. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests of this plugin
make check                                  # census and record checks of the pinned kit releases
make pack OUT=<folder> # the plugin release
make hooks                                  # once after cloning: check commit messages and records at commit time
```

`make check` runs the census check of the events kit and the record check of the records kit that `package.json` pins. The application validates `plugin.json` when it installs the release, and the registry check compares the exposed names of the release with the declarations of each listed core.

The checklist is [docs/features.md](docs/features.md).
