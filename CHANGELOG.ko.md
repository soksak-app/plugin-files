# 변경 기록

[English](CHANGELOG.md)

- P37: Files `0.0.7`은 `engines.soksak` `^0.0.21`을 선언한다. 공개 core `v0.0.20`은 `host` 필드와 status-only section을 거부한다. Red: `test/core-version.test.mjs`가 `">=0.0.11" !== "^0.0.21"`로 실패한다. Green: 같은 test가 1/1 통과하고 candidate `make check`에서 manifest, exposure, engines, event 검사가 통과한다. Records 도구는 `Record checks passed: 0 files`를 보고해 record coverage를 제공하지 않는다. SDK pin, plugin version, archive, registry는 바꾸지 않았으며 P30은 public release gate로 남는다.

## 미배포

- P43: 같은 `id`, `root`를 가진 project message가 반복되면 tree/bookmarks를 비우거나 pending 작업을 버리거나 sidecar snapshot을 다시 보내지 않는다. Root 변경은 계속 project transition으로 처리한다. Red: `test/host-runtime.test.mjs`의 `a repeated project value preserves state and pending work while a changed root refreshes`가 P42 코드에서 전송 수 `2 !== 1`로 실패했다. Green: 해당 test가 통과하고 `test/host-runtime.test.mjs`는 30/30 통과한다. Core F262-6의 원래 두 host project-close trigger는 재현하지 않았다.

- P42: operation이 캡처한 project가 현재일 때 `no project is shown` 거부를 보고한다. 이전 text-only 취소가 active-project bookmark와 sidecar 오류를 숨겼다. 캡처한 project가 바뀐 operation만 보고 없이 취소한다. Red: active-refusal test 세 개가 변경 전 `ui/host-runtime.js`에서 실패했다(bookmark read는 error report가 없었고 bookmark write와 sidecar request는 reject하지 않았다). Green: active 거부를 보고하고 reject하며 project가 `null`이 된 뒤 거부된 bookmark write는 취소한다. `test/host-runtime.test.mjs`는 29/29 통과하고 candidate `make check`는 manifest, exposure, engines, events 및 records(56 files) 검사를 통과한다. 원래 두 host project-close trigger는 core F262-6에서 검증되지 않은 상태로 남는다. Files `0.0.7`은 P38-1이 끝날 때까지 미배포다.

- P41: Files host adapter는 `core.file.open`을 raw host call로 전달하지 않고 `{name, params}` 형태의 `runtime.command` envelope를 통해 main page로 보낸다. Plugin-host channel은 raw core call을 거부한다. Red: `test/host-entry.test.mjs`가 envelope를 기대하도록 바뀐 뒤 변경 전 adapter의 직접 `runtime.command` 호출로 실패했다. Green: 같은 test와 host-entry test file의 8개 case가 통과한다. Files `0.0.7`은 P38-1이 게시될 때까지 미배포 상태다.

- P40: Files host는 `files.tree`를 expose하기 전에 `declared-ui.expanded`를 구독한다. Event의 node-key 경로를 현재 declared tree에서 찾아 요청한 `expand` 또는 `collapse` operation과 해석된 `params.path`를 보내고 sidecar reply snapshot을 publish한다. 잘못되거나 오래된 event, project가 없는 event와 거부된 sidecar callback은 host error 경로로 보고한다. 더 이상 필요 없는 `files.tree.toggle` command를 제거한다. Red: `test/host-runtime.test.mjs`가 변경 전 코드에서 event 미구독 assertion에 실패했다. Green: `test/host-runtime.test.mjs`, `test/host-entry.test.mjs`, `test/sidecar-wire.test.mjs`가 42/42 통과한다. Files `0.0.7`은 P38-1과 core event gate F239-35-4까지 미배포다.

- P39: Plugin host는 `files.tree`, `files.bookmarks`를 전체 이름으로 등록하고 declared-section pull이 요청하는 local name `tree`, `bookmarks`로 snapshot을 저장한다. 이전 adapter는 전체 이름만 저장해 `files.refresh` 뒤 두 pull이 `{seq: 0, value: null}`을 반환하고 sidebar section이 mount되지 않았다. Red: `test/host-entry.test.mjs`의 `plugin host snapshots use plugin-local status names`는 `files.tree`를 받아 기대값 `tree`와 달라 실패했다. Green: `test/host-entry.test.mjs` 7/7, `test/manifest-shape.test.mjs` 10/10이며 변경 module과 test의 `node --check`가 통과한다. 공개 Files `0.0.7`은 없으므로 candidate version은 `0.0.7`로 유지하며 archive는 P38-1까지 미배포다.

- P38: Files host는 project가 `null`이 된 뒤 이전 sidecar session의 message와 failure callback을 무시한다. Red: 변경 전 host-runtime 소유 test에서 project-close event 뒤 이전 session message가 도착하자 `sessionOf`가 `Cannot read properties of null (reading 'id')`로 실패했다. Green: 이전 session callback 두 개를 무시하고 no-project status를 유지하며 error를 보고하지 않는다. `test/host-runtime.test.mjs` 25/25, `soksak-records` 56개 파일 검사가 통과한다. 보존된 Wails probe log는 host sequence 66의 app error를 기록하지만 message callback과 failure callback 중 어느 쪽인지는 구분하지 않는다. Source-level 원인은 현재 project가 `null`일 때 이전 session을 대조하는 것이다. SDK pin, plugin version, archive, registry, app profile은 바꾸지 않는다. P38-1과 core release gate P30이 완료되기 전까지 미배포다.

- P36: 필수 process display identity를 선언한 files sidecar 0.0.8 이상을 요구하고 이 plugin version을 0.0.7로 올린다. Red: manifest test가 이전 범위에서 실패했다. Green: 새 범위와 version으로 통과한다.

- P33: files host 페이지는 doctype으로 시작하고 import map을 갖지 않는다. host가 doctype 뒤에 view import map을 넣으므로(core F212.12-1-10-6), 페이지의 복사본을 뺐다. Red: host 페이지 규칙 시험이 map을 가진 page에서 실패했다. Green: `make test`가 98개 중 98개를 통과하고, core의 `checkViewPage`가 page를 받아들인다.
- P32: files host 페이지 map이 core view import map의 screen-hash 항목을 가진다. `checkViewPage`가 이 항목을 요구한다. 시험의 map 복사본은 `VIEW_IMPORTS`의 다섯 항목을 가진다. Red: `test/pack-closure.test.mjs`가 host 페이지 map에 screen-hash 항목이 없어 deep-equal 차이로 실패했다. Green: `make test`가 98개 중 98개를 통과하고, `CORE_PLUGIN_API_DIR`로 `make check`가 통과한다.
- P29: pre-push 훅이 `make push-check`를 실행한다. 이것은 ci workflow와 같이 `make test`, `make check`, push 범위의 commit message 검사를 실행한다. Red: `.githooks/pre-push`가 없었고 `git push --dry-run`은 검사를 실행하지 않았다. Green: 훅이 검사를 실행한다. `make test`는 98개 중 98개를 통과하고, `make check`는 고정 SDK에서 실패하며 이것은 P30이 기록한다.
- F238-c-23-1: `CORE_PLUGIN_API_DIR`가 설정되면 `make check`는 그 폴더에서 SDK를 읽는다. `scripts/check-manifest.mjs`는 그 폴더의 `validateManifest`를 불러오고, exposure, engines, events, records 도구도 그 폴더에서 실행한다. `test/check-manifest.test.mjs`는 fixture API의 거부 메시지가 검사를 실패시키는지 확인한다. `ui/host-runtime.js`의 status와 command 등록은 literal 이름을 쓰며, `test/exposure-registration.test.mjs`가 선언된 모든 이름을 검사한다. Red: manifest test는 변수를 무시하는 검사 때문에 실패했고, registration test는 literal 등록이 없는 선언 이름으로 실패했다. Green: `make test`가 98개 중 98개를 통과하며, `make check`는 core origin/main 추출본에 대해 통과한다.
- P26-9: plugin.json의 `files.open` params가 더 이상 `required`를 선언하지 않는다. core schema subset이 이를 받지 않아 두 host가 설치된 plugin을 `unknown field required`로 거부했었다. `test/exposes-schema.test.mjs`가 plugin.json의 모든 exposes schema와 항목을 subset과 대조한다. handler는 문자열 `path`가 없는 호출을 거부하며, test가 이를 포괄한다. Red: subset test가 `files.open params: keyword required is outside the schema subset`로 실패했다. Green: `make test`가 95개 중 95개 통과한다.
- F238-c-13: test command는 `scripts/build-test.mjs`로 `build/test/ui`를 만들며, plugin API import는 `test/sdk-models/`의 model로 바뀐다. `test/host-page.test.mjs`는 build된 page module을 가짜 view channel 위에서 불러 status 등록, 선언된 UI snapshot, command 등록, 선언된 files sidecar 호출을 검사한다. Red: test가 `build/test/ui/host.js`를 불러오지 못했다. Green: `make test`가 test 92개를 통과한다.
- F238-c-14: `test/`의 어느 줄도 SDK 패키지 이름을 싣지 않는다. `test/sdk-boundary.test.mjs`는 needle을 포함한 `test/`의 줄마다 실패하며, needle은 부분 문자열에서 조립한다. model 주석은 plugin API로 적고, `test/pack-closure.test.mjs`는 import map 이름을 부분 문자열에서 조립한다. Red: guard가 일곱 줄을 나열했다. Green: `make test`가 test 88개를 통과한다.
- F238-c-24: release workflow는 `make test`, `make check`, `make pack` 순서로 실행하며, test 전에 Node와 pnpm을 설정한다. `test/workflows.test.mjs`가 두 workflow에서 이 순서를 요구한다. Red: 이전 release workflow에서 test가 실패했다. Green: `make test`가 87개 test를 통과한다. `make check`는 고정된 `@soksak/plugin-api`가 받지 않는 `host` 선언(P26-4)에서 실패하며, core release가 이를 받을 때까지 이것이 예상된 결과다.
- F252-contract-files: 복사한 `view-commands.json`을 core origin/main에 맞췄다. command replay는 handler에 요청의 cids를 context로 전달한다.
- F252-files: plugin host 실행부는 object가 아닌 sidecar message와 알 수 없는 요청 id의 응답을 보고하고, `selected` 또는 디렉터리 `expanded`가 boolean이 아닌 tree 행을 거부하며, null도 `{id, root}`도 아닌 project 시작 값을 거부한다. Error가 아닌 던져진 값은 명령 event에 그 text를 남긴다. 거부된 오류 보고는 console과 `log` route로 간다. Red와 Green: `test/host-runtime.test.mjs`의 여섯 test(docs/features.ko.md의 F252-files 참조).

- F238-b-10-2: `test/test-script.test.mjs`는 test 명령이 `test/sdk-models/`를 포함해 `test/` 아래의 모든 test 파일을 선택함을 고정한다. 명령은 이미 올바랐다. `make test`는 79개 중 79개를 실행한다(이전 78개).
- 정정: host 페이지는 view와 같이 view bridge의 log로 기록한다. 읽지 못한 bookmark 목록은 빈 목록 옆에 알림을 보이고(`readFailed`의 `bookmarkValue`), 변경은 읽기가 성공할 때까지 기다려 저장된 목록을 덮어쓰지 않는다. Red: bridge log와 알림 test가 변경 전 code에서 실패했다. Green: `make test`가 통과한다.
- F238-d-15-1: host 페이지가 프로젝트 데이터에서 `files.bookmarks`를, command `files.bookmarks.add`, `files.bookmarks.remove`, `files.open.failed`를 제공한다. 상태 모듈(`ui/state.js`)은 그 `plugin.json` 항목과 함께 제거되었다. 각 command와 각 tree 요청, 변경 줄, 사이드카 실패는 `runtime.log` 호출로 event가 된다. `plugin.files.tree.request`, `plugin.files.tree.changed`, `plugin.files.tree.failed`는 `events.json`이 선언한다. 파일 행의 파일 열기는 core의 `runtime.command` 호출을 쓰며(P26-7), 그 window 검사는 대기 중이다. Red: bookmark, adapter, 상태 모듈 없음 test가 변경 전 code에서 실패했고, tree event test는 기록이 없어 실패했다. Green: `make test`가 76개 중 76개 통과한다.

- P26-5: `ui/host.html`의 SDK 항목을 `sok://core/` 대상으로 연결하여, 설치된 page가 더는 `sok://files/modules/...`를 요청하지 않는다. `test/pack-closure.test.mjs`가 import map과 page가 import하는 파일의 포장 목록을 검사한다. Red: `soksak maps to /modules/soksak/dist/index.js`. Green: `make test`가 66개 중 66개 통과한다.

- P26-6: 파일 host page는 view import map의 네 항목을 `sok://core/` 대상으로 선언하고, 호출, exposure, 선언 UI snapshot을 `@soksak/plugin-api/view`의 view bridge로 보낸다. `scripts/check-manifest.mjs`는 import map을 surface page map과 더는 비교하지 않는다. bridge는 잃은 호출을 `plugin.files.host.report`로 보고한다. `test/sdk-models/`가 복사한 view와 snapshot case를 재생한다. Red: import map과 page import 테스트가 page map에서 실패했다. Green: `make test`가 79개 중 79개 통과한다.
- F238-d-16: `plugin.json`이 파일 sidecar의 tree 작업 `snapshot`, `expand`, `collapse`, `select`의 `hostOperations`를 선언한다. sidecar는 이를 host 읽기 작업으로 선언한다. test가 선언된 wire 계약의 host 요청과 sidecar 응답을 재생한다(`test/sidecar-wire.test.mjs`, `test/fixtures/sidecar-files/`). 실패한 tree command는 돌려주기 전에 오류 경로로 오류를 보고한다. 상태 모듈은 더 이상 tree status와 tree command를 선언하지 않는다. 이는 플러그인 호스트 페이지가 제공한다. 나열 이벤트 `plugin.files.sidecar.request`, `list`, `watch.changed`, `watch.failed`, `git`은 나열과 함께 제거된다. Red: 변경 전 manifest에서 `hostOperations` 검사가 실패했고, 상태 모듈 test는 `files.tree`가 선언된 상태에서 실패했으며, 실패한 나열의 보고 test는 기록이 없어 실패했다. Green: `make test`가 76개 중 76개 통과한다.

- P26-7: tree의 파일 행은 `files.open` command로 파일을 연다. 이 command는 view bridge로 `core.file.open`을 실행하며, `plugin.json`이 선언한다. 막힘: plugin host가 아직 `core.file.open`을 제공하지 않아, core가 제공하기 전까지 열기는 거부된다. Red: `a file row of the tree carries the open command`가 실패했다. Green: `make test`가 79개 중 79개 통과한다.
- P26-4: `@soksak/plugin-api`를 가장 새 core release인 `v0.0.20`으로 옮겼다. core release가 선언을 받기 전까지 `make check`는 `plugin.json: unknown field host`로 실패한다.

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
