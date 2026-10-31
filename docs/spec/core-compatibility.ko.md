# Core 호환성

[English](core-compatibility.md)

Files package는 core release `0.0.23`의 manifest contract를 사용한다. `plugin.json`은 `host` page와 `module`이 없는 status-only section을 선언한다. 공개 core `v0.0.20` reader는 `host`를 거부하고 exposure checker는 `section.module`을 요구한다. 따라서 `package.json`은 core version-range 규칙에 따라 core `0.0.23`을 허용하며 이전 version 및 검증하지 않은 이후 version을 제외하는 `engines.soksak: "^0.0.23"`을 선언한다. 이 contract를 담은 core release가 게시될 때까지 package release는 P30의 gate에 남는다.
