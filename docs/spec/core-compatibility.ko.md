# Core 호환성

[English](core-compatibility.md)

Files package는 `engines.soksak: "^0.0.41"`을 선언한다. 이 범위는 core 0.0.41부터 그 뒤의 모든 0.0 release를 허용한다([version과 범위](https://github.com/soksak-app/core/blob/main/docs/spec/installation.ko.md#version과-범위)). plugin은 plugin API release를 명시하지 않는다. `@soksak/plugin-api`에 대한 dependency를 선언하지 않으며, 테스트는 plugin API를 `test/fixtures/plugin-api`의 fixture로 응답하므로 어떤 테스트도 core의 코드를 실행하지 않는다(P116). `engines.soksak`만이 package와 core의 관계다.
`plugin.json`은 노출하는 element를
`exposes.element`에 선언한다. Core `0.0.39`와 그 이전은 exposes 종류 `status`, `commands`, `dom`만 받으므로 `element`를 거부하고,
core F502-13의 release(F502-13-1)인 core `0.0.40`은 `exposes.dom`을 거부한다. 그 `sections`는 core `docs/spec/plugins.md#sections`의 section view 형태, 즉 `composition`과
`height`를 가진다.
