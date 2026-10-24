# Core compatibility

[한국어](core-compatibility.ko.md)

The files package uses the manifest contract of core release candidate `0.0.21`. Its `plugin.json` declares a `host` page and status-only sections without `module`; the published core `v0.0.20` reader rejects `host`, and its exposure checker requires `section.module`. `package.json` therefore declares `engines.soksak: "^0.0.21"`, matching the current candidate under the core version-range rules and excluding `0.0.20` and later unverified versions. The package release remains gated on a published core release that carries this contract (P30).
