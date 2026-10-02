# Features

[한국어](features.ko.md)

- [o] P1 — P1: Test and pack this plugin as its own repository. Moved on 2026-10-02 from the soksak core repository (checklist item R1-5-3 there), whose history holds the earlier changes. `make test` and `make pack` pass.
- [o] P2 — P1: Release version 0.0.2 for soksak core 0.0.2. Done on 2026-10-02: `package.json` declares 0.0.2 and `engines.soksak` `^0.0.2`, and the tests resolve `@soksak/plugin-api` from the core tag `v0.0.2`; `make test` passes on macOS arm64.
