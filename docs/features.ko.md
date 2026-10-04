# 기능

[English](features.md)

- [o] P1 — P1: 이 plugin을 자기 repository로 test하고 pack한다. 2026-10-02에 soksak core repository(그곳의 checklist 항목 R1-5-3)에서 옮겼으며, 이전 변경 이력은 core에 있다. `make test`와 `make pack`이 통과한다.
- [o] P2 — P1: soksak core 0.0.2용 version 0.0.2를 release한다. 2026-10-02 완료: `package.json`이 0.0.2와 `engines.soksak` `^0.0.2`를 선언하고, test는 core tag `v0.0.2`의 `@soksak/plugin-api`를 쓴다. macOS arm64에서 `make test`가 통과한다.
- [o] P3 — P1: 페이지와 섹션의 공개 이름을 검사한다. 2026-10-02 core checklist 항목 R1-5-5를 위해 완료: `make test`가 core tag `v0.0.2`의 `@soksak/plugin-api`의 `soksak-exposure`를 실행해 `ui/`의 모든 이름을 `plugin.json`과 core 선언에 대해 비교하며, macOS arm64에서 통과한다.
- [o] P4 — P0: core 체크리스트 항목 R2-1을 위해 `@soksak/plugin-api`를 공개된 core 저장소에서 받는다. 2026-10-04 완료: `package.json`은 로컬 폴더 대신 `git+https://github.com/soksak-app/core.git#v0.0.2&path:/packages/plugin-api`를 가리키고, lockfile을 GitHub에서 다시 만들었으며, macOS arm64에서 `make test`가 통과한다.
- [o] P5 — P0: core 체크리스트 항목 R2-2-2를 위해 soksak core 0.0.3용 version 0.0.3을 선언한다. 2026-10-04 완료: `package.json`은 0.0.3과 `engines.soksak` `^0.0.3`을 선언하고, sidecar 범위는 `^0.0.3`이며, `@soksak/plugin-api`는 tag `v0.0.3`이 게시될 때까지 core commit 22162a74에서 받고, `make test`는 `soksak-engines`도 실행한다. core F16 전에는 `soksak-exposure`가 이 저장소에서 검사 없이 끝났다. 이번 실행이 첫 실제 검사이며 통과한다. macOS 26 arm64.
- [~] P6 — P0: core checklist 항목 R2-5-2를 위해 CI와 release workflow를 둔다. `ci.yml`은 macOS runner에서 이 저장소의 테스트를 실행하고, tag `v*`는 `release.yml`을 실행해 같은 core tag에서 `sok`을 빌드하고 plugin archive를 게시하며, `.node-version`과 `packageManager`가 workflow가 설치하는 Node.js와 pnpm 버전을 선언한다. 2026-10-04 진행: `ci.yml`의 build-machine rehearsal이 macOS에서 통과했다. `release.yml`의 rehearsal에는 tag가 필요하다.
