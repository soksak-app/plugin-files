# Files plugin

[한국어](README.ko.md)

Files plugin: sidebar sections for the project directory. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests of this plugin
make check                                  # SDK checks of the pinned core release
make pack OUT=<folder> SOK=<core>/target/debug/sok   # the plugin release
make hooks                                  # once after cloning: check commit messages and records at commit time
```

The checklist is [docs/features.md](docs/features.md).
