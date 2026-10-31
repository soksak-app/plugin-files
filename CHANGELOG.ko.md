# 변경 기록

[English](CHANGELOG.md)

- P89: files host page는 선언하지 않은 `id` 없는 sidecar message, 예를 들어 persistent sidecar의 연결 알림을 `files sidecar sent an undeclared message without id: event <event>; keys <keys>`로 보고한다. 전에는 그런 message를 `files sidecar replied to unknown request undefined`로 보고해서 어떤 message인지 기록에 남지 않았다. Red: `test/host-runtime.test.mjs`의 `a sidecar message without id that the host does not declare is reported with its event and keys (P89)`가 `files sidecar replied to unknown request undefined`로 실패했다. Green: 같은 시험이 통과하고, `test/host-runtime.test.mjs`가 38개 중 38개 통과한다.
- P88: files host page는 tree 요청이 기다리는 동안 sidecar의 session 실패를 `files tree`로 한 번만 보고한다. 실패 callback이 기다리는 요청을 거부하면서 실패도 보고해서, 호출자가 같은 글을 다시 보고했다. 이제 callback은 기다리는 요청이 없을 때만 보고한다. Red: `test/host-runtime.test.mjs`의 `a session failure of the sidecar while a tree request waits is reported once (P88)`가 `the failure is reported once, reported 2 times`로 실패했다. Green: 같은 시험이 통과하고, `test/host-runtime.test.mjs`가 37개 중 37개 통과한다.
- P49: files host page는 sidecar 요청의 send를 기다리는 동안에도 그 답을 관찰한다. 그 사이의 session 실패와 이어지는 send 실패는 unhandled rejection이 아니라 `files tree`로 보고된다.
- P6: CI와 release workflow가 완료되었다. `ci.yml`은 `main`의 모든 push를 macOS에서 테스트하고 검사하며, `release.yml`은 tag에서 release `v0.0.3`부터 `v0.0.6`까지 게시했다.
- P50: files host page가 sidecar의 감시 실패, 곧 `id` 없이 `error`가 든 message를 `files sidecar watch failed: <text>`로 보고한다. 전에는 모르는 요청의 답으로 보고해서 글을 잃었다.
- F275-files: `make install`이 고정된 의존성을 설치한다. 시험, 검사, build는 더 이상 설치하지 않는다.
- F274-files: pre-push hook은 push가 게시하는 commit message만 검사한다. 시험과 검사는 CI가 실행한다.
- P37: Files `0.0.7`은 `engines.soksak` `^0.0.21`을 선언한다. 공개 core `v0.0.20`은 `host` 필드와 status-only section을 거부한다. Red: `test/core-version.test.mjs`가 `">=0.0.11" !== "^0.0.21"`로 실패한다. Green: 같은 test가 1/1 통과하고 candidate `make check`에서 manifest, exposure, engines, event 검사가 통과한다. Records 도구는 `Record checks passed: 0 files`를 보고해 record coverage를 제공하지 않는다. SDK pin, plugin version, archive, registry는 바꾸지 않았으며 P30은 public release gate로 남는다.

## 미배포

- F332-5-4: Tree 행은 dom 이름 `files.tree.row`를 가진다. Page는 이 이름의 provider를 한 번 등록하며, provider는 tree library가 그리는 행을 container의 열린 shadow root에서 읽어 돌려준다. Page는 그 root가 바뀔 때 각 행을 표시한다. 북마크 항목과 삭제 button은 같은 provider 형식을 쓰므로 제거된 행은 남지 않는다. Red: 커밋된 view에서 83개 중 3개 실패. Green: `make test`가 83개 중 83개 통과하고, `CORE_PLUGIN_API_DIR`을 지정한 `make check`가 통과한다. 고정된 0.0.24 검사는 `data requires a plugin host`로 여전히 실패한다(F332-5-3).
- F332-5-4: tree와 북마크 view가 보이는 상태를 노출한다. `files.tree`는 보이는 행(path, kind, depth, 펼침, 선택)과 message 행 텍스트를, `files.bookmarks`는 북마크 경로를 보고한다. 새로 고침과 별 button, 북마크 항목과 그 삭제 button은 선언된 dom 이름을 가진다. Red: 변경 전 view와 manifest에서 81개 중 7개 실패. Green: `make test`가 81개 중 81개 통과. Tree 행은 dom 이름이 없다. `createExpose`가 요소별 등록을 view가 끝날 때까지 유지하기 때문이며, core가 dom provider를 제공할 때까지 항목은 보류된다(F332-5-4).
- F332-5-2: tree와 북마크 section은 plugin의 view page이다. `ui/tree.html`은 vendor된 `@pierre/trees` bundle로 프로젝트 tree를 그리고 `snapshot`, `expand`, `collapse`, `select`를 `@soksak/sidecar-files`에 보낸다. `ui/bookmarks.html`은 프로젝트 data key `bookmarks`를 읽고 쓴다. manifest는 각 section을 `composition` `view`와 page로 선언하며, `host`, `hostOperations`와 status `files.tree`, `files.bookmarks`를 더 이상 선언하지 않는다. 폴더 펼침을 위해 명령 `files.tree.toggle`을 선언한다. host page 파일과 그 테스트를 제거했고, Red에서 143개 중 10개가 실패한 뒤 `make test`는 72개 중 72개를 통과한다. `CORE_PLUGIN_API_DIR`을 core plugin API 소스로 지정한 `make check`는 통과한다. 고정된 0.0.24 검사는 0.0.25 고정 때까지 보류된다(F332-5-3).
- F332-5-2: 북마크 view는 `runtime.data.on`으로 project data 변경을 구독하고, 그 key가 바뀔 때마다 `bookmarks`를 다시 읽는다. 그래서 파일 tree view가 저장한 북마크가 보인다. Red: `the bookmarks view re-reads the bookmarks when the project data of the key changes`가 `0 !== 1`로 실패했다(`runtime.data.on` 구독 없음; 74개 중 1개 실패). Green: `make test`가 74개 중 74개를 통과하고, `CORE_PLUGIN_API_DIR`을 지정한 `make check`는 manifest, exposure, engines, events, records 검사를 통과한다.
- F332-5-1: vendor된 `@pierre/trees` build를 복원한다. `pnpm run build`가 `vendor/trees.js`를 `ui/vendor/trees.js`로 bundle하고 `ui/vendor/trees.LICENSE.txt`를 쓴다. dev dependency `@pierre/trees` 1.0.0-beta.4와 `esbuild` 0.28.2, 그리고 `pnpm install`이 다시 만든 `pnpm-lock.yaml`을 복원한다. `make test`는 `test/manifest-shape.test.mjs`의 `ui/vendor still exists`에서 실패한다. 이 assertion은 제거된 상태를 검사한다. F332-5-1은 이 assertion이 복원된 bundle을 검사할 때까지 보류한다.
- F326-files: version 0.0.10은 core `^0.0.24`를 요구하고 core `v0.0.24`의 plugin API release file과 `sok`를 쓴다.
- F324-files: version 0.0.9은 core `^0.0.23`을 요구하고, core `v0.0.23`의 plugin API release file을 쓰며, core `v0.0.23` Tauri host application zip 안의 `sok`로 release를 pack한다.
- F272-files: `main`에 push하면 tag가 없을 때 `soksak-release-gate`로 선언된 version을 core release `v0.0.21`의 `sok`와 함께 release한다. `@soksak/plugin-api`에 대한 의존은 그 release의 pack 파일이다. 어떤 workflow도 core를 checkout하지 않는다.
- P48: Package SDK와 release workflow CLI source를 plugin API version 0.0.21인
  동일한 공개 immutable core source에 고정한다. Lockfile-only resolution이
  source를 가져오고 frozen lockfile 검사가 통과한다. Manifest, exposure,
  engine, event 및 기존 core-version 검사가 통과한다. Files는 0.0.8을 유지하고
  engine 범위와 sidecar 최소 버전은 바꾸지 않는다. Package candidate를 만들거나
  게시하지 않았다.

- F239-77-files: 일치하는 설치 diagnostic cohort로 로컬 schema-3 catalog acceptance를 완료한다. 현재 SDK가 source 5개와 pending rule 0개, event 7개를 검사하며 양쪽 host 설치본의 catalog가 source와 정확히 일치하고 application log audit을 통과한다. Public publication은 별도다.

- F239-77-files: Files event catalog를 event name, class, level과
  required/optional field 의미를 바꾸지 않고 schema 3 JSON Schema로 변환한다.
  Red: 현재 core `events-check`가 schema 2를 거부하고 compact field map을 JSON
  Schema keyword로 처리했다. Green: 현재 core `events-check`가 선언 7개와 source
  emit을 모두 받으며 `test/events.test.mjs` 3/3과 현재 core `make check`가
  통과한다. 당시 전체 `pnpm test`는 113/122로 실패했다. Host-page/sidecar-wire
  검사 여덟 개가 필요한 ready-time project delivery 없이 실행되고, manifest 검사
  한 개는 `plugin.json`의 0.0.8 대신 sidecar 0.0.7을 기대했다. F239-82-files가
  해당 stale fixture와 assertion을 수정한다. Runtime acceptance는 대기 중이다.

- F239-82-files: Host-page와 sidecar-wire test fake가 ready-time project
  delivery를 사용하도록 맞추고, snapshot event는 local status name으로 비교하며
  manifest 기대값을 package version 0.0.8로 갱신한다. Project delivery 전
  project-bound operation이 거부되는 test를 추가한다. Red: 보존된 전체 package
  run에서 project delivery 누락으로 host-page assertion 두 개와 sidecar-wire
  assertion 여섯 개가 실패했고 manifest version assertion 하나도 오래된 값이었다.
  Green: 변경한 소유 test 파일이 4/4, 7/7, 10/10 통과하며 production code는
  바뀌지 않았다.

- P47: P46을 포함하는 Files 0.0.8 local candidate를 준비했다. 공식 진단 package 검사는 manifest, exposure, engines, events와 records 다섯 검사를 통과한다. 새 registry는 P87 entry를 보존하고 Files 0.0.8을 추가하며, 새 설정에 Files sidecar 0.0.8과 함께 설치된다. 설치된 host runtime은 package의 P46 구현과 같다. Files는 `diagnostics.json`을 선언하지 않는다. Candidate archive SHA-256은 `75234f301dda839aa9a81eeeb7fb33c6f4de8a19ec4edfd54ef7783a7bfb2ced`, registry index SHA-256은 `4c192acd4fd8e121811641b38b18067d8c36e9b53b431aa75958cc2a22027c94`다. Local 상태이며 미배포이고 application은 실행하지 않았다.

- P46: `core.file.open`의 예상된 `-32000` `no plugin opens <path>` 거부만 처리한다. 선택된 파일 행은 sidecar detail을 유지하면서 `열 수 없음: <오류>`를 표시하고 다음 tree snapshot에서 거부를 지운다. Host는 `plugin.files.open.failed`를 기록하고 처리된 거부를 application global error display에 보내지 않는다. 다른 open 오류는 계속 reject한다. Red: 새 host-runtime case는 변경 전 코드가 행을 publish하지 않고 `files.open`을 reject해 실패했다. Green: 거부와 예상 밖 오류를 확인하는 두 focused case가 통과하고, `test/host-runtime.test.mjs` filtered run은 2/2 통과한다.

- P45: Files host는 초기 bookmarks status를 읽을 때 start project를 current로 간주하지 않는다. Sidecar 구독 중 project 전달이 current를 바꾸면 이전 초기화는 project data read나 snapshot 요청 전에 중단한다. Red: host-entry test가 먼저 undefined current를 status 등록 중 읽는 결함을 드러냈고, 그 전제 수정 후에는 project-null 전달 뒤 오래된 continuation이 `runtime.data.get`을 호출하는 것을 재현했다. Green: 수정된 test와 host-entry/host-runtime test 41/41, candidate `make check`의 다섯 검사가 통과한다. D 설치 파일은 P44 source와 같지만 project callback 값이 기록되지 않아 이 controlled race를 D의 확인된 원인으로 주장하지 않는다.

- P44: Files host는 document-start project를 초기 tree value로만 사용하고 I/O 권한으로 취급하지 않는다. Ready-time 첫 전달을 기다리며 그 전 project command는 명시적으로 거부한다. Red: null 전달 test는 변경 전 코드에서 bookmark와 tree 오류를 냈고, pre-ready command test는 command가 거부되지 않고 성공처럼 resolve되어 실패했다. Green: 두 test와 `test/host-runtime.test.mjs` 32/32가 통과한다. 첫 전달이 `null`이면 project 전용 I/O 없이 tree를 비우고, start와 같은 non-null 전달이면 한 번 초기화한다.

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
