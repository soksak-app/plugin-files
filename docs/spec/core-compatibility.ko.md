# Core 호환성

[English](core-compatibility.md)

Files package는 `engines.soksak: "^0.0.39"`를 선언한다. 이 범위는 core version-range 규칙에 따라
core release `0.0.39`를 허용하고 이전 version 및 검증하지 않은 이후 version을 제외한다. `plugin.json`은 노출하는 element를
`exposes.element`에 선언한다. Core `0.0.34`와 그 이전은 exposes 종류 `status`, `commands`, `dom`만 받으므로 `element`를 거부하고,
core F502-13의 release(F502-13-1)인 core `0.0.35`는 `exposes.dom`을 거부한다. 그 `sections`는 core `docs/spec/plugins.md#sections`의 section view 형태, 즉 `composition`과
`height`를 가진다.
