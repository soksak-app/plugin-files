# 기능

[English](features.md)

- [o] P1 — P1: 이 plugin을 자기 repository로 test하고 pack한다. 2026-10-02에 soksak core repository(그곳의 checklist 항목 R1-5-3)에서 옮겼으며, 이전 변경 이력은 core에 있다. `make test`와 `make pack`이 통과한다.
- [o] P2 — P1: soksak core 0.0.2용 version 0.0.2를 release한다. 2026-10-02 완료: `package.json`이 0.0.2와 `engines.soksak` `^0.0.2`를 선언하고, test는 core tag `v0.0.2`의 `@soksak/plugin-api`를 쓴다. macOS arm64에서 `make test`가 통과한다.
