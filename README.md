# Files plugin

[한국어](README.ko.md)

Files plugin: sidebar sections for the project directory. The plugin format is defined in the soksak core specification (`docs/spec/plugins.md`).

```sh
make test                                   # tests of this plugin
make check                                  # SDK checks of the pinned core release
make pack OUT=<folder> # the plugin release
make hooks                                  # once after cloning: check commit messages and records at commit time
```

`make check` checks against the `@soksak/plugin-api` that `package.json` pins. To check against the core `main` branch, check out its `packages/plugin-api` folder into a scratch folder with a separate index file, which leaves the core checkout unchanged, and set `CORE_PLUGIN_API_DIR` to that folder:

```sh
GIT_INDEX_FILE=<scratch>/index git -C <core> --work-tree=<scratch> checkout origin/main -- packages/plugin-api
CORE_PLUGIN_API_DIR=<scratch>/packages/plugin-api make check
```

The checklist is [docs/features.md](docs/features.md).
