# 변경 기록

[English](CHANGELOG.md)

## 미배포

- P26-5: `ui/host.html`의 SDK 항목을 `sok://core/` 대상으로 연결하여, 설치된 page가 더는 `sok://files/modules/...`를 요청하지 않는다. `test/pack-closure.test.mjs`가 import map과 page가 import하는 파일의 포장 목록을 검사한다. Red: `soksak maps to /modules/soksak/dist/index.js`. Green: `make test`가 66개 중 66개 통과한다.

- P26-6: 파일 host page는 view import map의 네 항목을 `sok://core/` 대상으로 선언하고, 호출, exposure, 선언 UI snapshot을 `@soksak/plugin-api/view`의 view bridge로 보낸다. `scripts/check-manifest.mjs`는 import map을 surface page map과 더는 비교하지 않는다. bridge는 잃은 호출을 `plugin.files.host.report`로 보고한다. `test/sdk-models/`가 복사한 view와 snapshot case를 재생한다. Red: import map과 page import 테스트가 page map에서 실패했다. Green: `make test`가 79개 중 79개 통과한다.

- P28: host page의 계약 case를 core에서 바이트 단위로 `test/fixtures/contract`에 복사하고(`expose.json`, `declared-ui-snapshot.json`, `view-snapshot-pull.json`) SHA-256으로 고정한다. `test/sdk-models/expose.mjs`가 status 등록과 dispose를 model로 만들고, `test/sdk-models/conformance.test.mjs`가 그것을 쓰는 expose case 5개를 재생한다. 나머지 14개 case는 이유와 함께 적는다. Red: `status.next` 규칙을 `<=`로 바꾸자 `expose.status.get-watch-and-next-in-order#4`가 실패했다. Green: `make test`가 63개 중 63개 통과한다.

- P26-1: `plugin.json`이 plugin host page `ui/host.html`을 선언하고, 두 사이드바 section은 `status`를 선언한다. `package.json`의 `files`는 `ui/host.html`을 나열한다. section module(`ui/sections/`), 묶음 tree 라이브러리(`ui/vendor/`, `vendor/trees.js`), 묶음 script, plugin API 가짜를 쓰는 test 빌드, `@pierre/trees`, `esbuild`, `jsdom` 의존성을 제거한다. 선언하거나 import하는 곳이 없기 때문이다. `make test`는 SDK 없이 58개 test를 실행한다. `make check`는 `host`를 거부하는 고정 plugin API에서 여전히 실패하며(P26-4), Red: `test/manifest-shape.test.mjs`가 `ui/sections still exists`와 `ui/vendor still exists`로 실패했다. Green: `make test`가 58개 중 58개 통과한다.

- F238-c-23: `make test`는 SDK 도구와 SDK import 없이 이 plugin의 테스트만 실행하고, 새 `make check`는 고정된 `@soksak/plugin-api`로 SDK 검사(manifest, exposure, engines, events, records)를 실행한다. `pack`은 `check`에 의존하며 CI는 둘을 모두 실행한다. section 모듈은 `build/test/ui`로 테스트하며, 이는 `ui/`의 복사본으로 plugin API import가 consumer 쪽 fake를 가리킨다. Red: `test/check-target.test.mjs`가 `test runs soksak-exposure`로, `test/sdk-boundary.test.mjs`가 `manifest.test.mjs`로 실패했다. Green: 각각 3/3, 1/1, `make test` 72/72, `make check` 통과.

- F238-d-17-1: DOM-free 테스트가 `ui/declared-data.js`와 `ui/host-runtime.js`를 읽고, 두 파일 중 어느 쪽에서든 `document`, `window`, `innerHTML`, `createElement`, `querySelector`, `appendChild`가 나오면 실패한다. Red: `ui/host-runtime.js`에 `document.createElement("div");`를 덧붙이자 `DOM APIs found: document, createElement`로 실패했고, 파일을 복원한 뒤 테스트가 3/3을 통과한다.

- P26-3: 한도를 넘은 text, key 또는 parameter는 그대로 보내져, core가 거부 문구와 함께 거부하고 section을 비운다. `treeValue`와 `bookmarkValue`는 이 경우 throw하지 않고, control character는 여전히 거부한다. 테스트: `test/declared-data.test.mjs`와 `test/host-runtime.test.mjs`(24/24), `make test`(68/68).

- P26-2: `treeValue`와 `bookmarkValue`는 표시 순서의 가장 긴 prefix 중, 잘린 status-line을 포함한 값이 1000개 list item, 5000개 tree node, 16 level, JSON 직렬화 값의 1048576 bytes(UTF-8) 안에 드는 것을 남긴다. depth 16 행 아래의 행은 건너뛰지 않고 그 행에서 목록이 끝난다. 테스트: `test/declared-data.test.mjs`(17/17), `make test`(65/65).

- P25: 새 커밋의 작성자는 `min-0-max <max@blue.tools>`다. `.mailmap`이 이전 이름 `min-median-max`를 잇고, 게시된 커밋은 다시 쓰지 않는다.

- P24: `make hooks`가 `.githooks`를 hook 폴더로 정해, commit message의 형식이나 용어 규칙, record 규칙을 어긴 commit이 만들어질 때 거부된다.

## 0.0.6 (2026-10-13)

- P23: 이벤트 계약(P21)과 record 검사(P22)를 담은 version 0.0.6을 release한다. tag `v0.0.6`이 `files-0.0.6.tgz`를 게시한다.
- P22: `make test`가 record 검사 `soksak-records`를 실행하고, CI가 push된 각 commit message의 형식을 `soksak-commits`로 검사한다.
- P21.4: `@soksak/plugin-api`를 core release 0.0.11에서 받고 `engines.soksak`은 `>=0.0.11`이므로, `make test`가 설치된 의존성의 event 가드를 실행한다.
- P21: 전달자 `ui/events.js`가 넘기는 event 이름에 `events: forwarded`를 표시하므로, core의 catalog 검사가 `emitEvent` 호출에서 이름을 읽는다.
- P21.3: `make test`가 `census.json`과 `events.json`으로 `soksak-events`를 실행한다. 이유 주석은 `default: <reason>` 형식이고, `inTurn`이 버리는 rejection은 기록하지 않는 이유를 적는다.
- P21.2: 상태 모듈이 files sidecar 요청(`plugin.files.sidecar.request`), 목록(`plugin.files.list`), git 상태(`plugin.files.git`), watch가 보고하는 변경(`plugin.files.watch.changed`), 요청이 일으키지 않은 실패(`plugin.files.watch.failed`), 파일을 열지 못한 실패(`plugin.files.open.failed`), 명령 결과(`plugin.files.command`)를 기록한다. 테스트: `test/state.test.mjs`.
- P21.1: `ui/events.js`가 plugin event의 emitter를 제공하고, `events.json`이 plugin의 event 7개(`plugin.files.sidecar.request`, `list`, `watch.changed`, `watch.failed`, `git`, `open.failed`, `command`)를 선언하며, `plugin.json`이 `events`로 카탈로그를 가리킨다. 테스트: `test/events.test.mjs`.
- P19: 세로 트리와 가로 트리가 파일을 열지 못한 실패(`열 수 없음: <오류 글>`)를 status `files.open`과 명령 `files.open.failed`로 메시지 행에 보이고, main document의 오류 표시는 더 이상 그것을 보이지 않는다.
- P18: 문서와 주석이 plugin, sidecar, release를 그 말로 부른다.

- F238-d-17: files declared data module의 DOM-free 검사와 DOM API를 찾는 fixture를 추가한다. declared data module이 검사(2/2)를 통과하고 DOM을 주입한 fixture는 같은 assertion에서 거부된다. 이는 명시된 DOM-free 경계의 검증이며 production defect의 Red는 아니다.

- F238-d-24: files sidebar section이 view 전용 조작을 쓰지 않는지 검사하는 regression test를 더한다. fixture에서 금지 조작을 감지한다(2/2).

- F238-d-15: 선언된 file tree와 bookmark value를 만드는 DOM-free 함수를 추가한다. tree 값은 toolbar binding, 선택 경로, descendant detail, no-project 상태, 제한된 tree 행을 포함한다. manifest/status source 통합은 남아 있다.

- F238-d-15: 행/depth 제한 전에 모든 tree row를 검사하고 orphan path, non-directory parent, 중복, 잘못된 field를 거부한다. schema에 맞는 node key를 만들고 bookmark list를 1000개에서 자르며 status-line을 남긴다. Red/Green: 이전 builder에서 소유 malformed-row 검사가 실패하고 현재 `test/declared-data.test.mjs`는 14/14 통과하며 depth 초과 행을 자른 뒤 남은 node budget도 사용한다.

- F238-d-15: `files.tree`, `files.bookmarks`를 declared UI value schema로 바꾸고 git, selection, open 독립 status를 제거한다. state source와 module consumer가 tree/list 값을 사용하며 project label/path를 유지한다. listing 실패를 빈 폴더로 표시하지 않는다. 선언된 open command와 전역 listing 오류 표시는 소유 contract 작업으로 남아 있다.

- F238-d-15: manifest, state status provider, module consumer를 declared tree/bookmark list value로 바꾼다. project path label을 유지하고 listing 실패 때 tree empty text를 비워 빈 폴더로 표시하지 않는다. plugin open command binding과 전역 listing-error 표시 경로는 소유 contract에 남아 있다.

- F238-d-16: files sidecar의 snapshot/expand/collapse/select protocol을 사용하는 DOM-free plugin-host consumer를 추가한다. 구독 순서를 지키고 새 declared-tree 값을 갱신하며 application error display로 오류를 보고한다. sidecar dependency 최저 버전을 0.0.7로 올린다. `ui/host.js`는 core main에 실제 존재하는 `page`, `expose` export를 가져오며 core producer source는 host field와 ordered sidecar API를 지원한다. `ui/host.js`는 import를 fake-tested entry adapter에 연결한다(startup 2/2); runtime fake test는 4/4 통과한다. 실제 활성화는 published SDK release와 pinned 버전 manifest validation까지 보류하며 manifest는 의도적으로 활성화하지 않는다.
