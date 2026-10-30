# Host runtime

[English](host-runtime.md)

Host runtime은 plugin host에 표시된 project를 따른다. 시작 값과 project message는 `null` 또는 비어 있지 않은 `id`, `root`를 가진 object다. Project가 `null`이면 runtime은 tree와 bookmarks를 비우고 sidecar request를 보내지 않는다.

Start project는 초기 tree value를 만들지만 `page.onProject`의 첫 전달 전까지 operation의 current project가 아니다. 그 전에 실행된 project 전용 command는 준비 상태 오류로 명시적으로 실패하며, 성공한 것처럼 조용히 반환하거나 I/O를 실행하지 않는다. Host는 plugin-host page가 ready가 된 뒤 현재 표시 중인 project를 전달하며 `null`도 보낸다. Window가 page ready 전에 project를 바꿨을 수 있으므로 이 전달이 현재 project를 확정한다. 첫 전달이 start project와 같으면 그 project를 한 번 초기화한다. 첫 전달이 `null`이면 tree와 bookmarks를 지우고 project 전용 operation을 실행하지 않는다. 이후 같은 값이 반복돼도 idempotent하다.

Project 초기화는 sidecar 구독을 완료한 뒤 project data를 읽고 snapshot을 요청한다. 구독이 pending인 동안 다른 project 전달이 current project를 바꾸면 이전 초기화는 구독이 완료된 시점에 중단한다. 이전 전환이 새 project의 data를 읽거나 이전 project의 snapshot을 요청하지 않는다. 여전히 current project에 속하는 operation의 거부는 계속 보고한다.

첫 project 전달 전 bookmarks status는 빈 목록의 no-project 값으로 읽힌다. Status 등록은 비권위 start 값을 current project로 역참조하거나 project data를 읽지 않는다.

Project에 의존하는 host 또는 sidecar operation이 거부되면 그 operation이 캡처한 project가 여전히 현재 project일 때 거부를 보고한다. 오류 문구가 `no project is shown`이어도 같다. Operation이 캡처한 project가 바뀐 뒤에만 진행 중인 operation을 보고 없이 취소한다. 오류 문구를 비교해 취소로 분류하지 않는다.

Project가 바뀌면 이전 sidecar session은 끝난다. 이전 session에 등록된 message 및 failure callback은 project가 바뀐 뒤에도, `null`로 바뀐 뒤에도 도착할 수 있다. Runtime은 현재 project session이 아닌 callback을 무시한다. 이를 error로 보고하거나 현재 tree 또는 bookmarks를 바꾸거나, 없는 project에서 session을 만들지 않는다.

나중에 `id`, `root`가 있는 project가 표시되면 자체 sidecar session을 사용한다. 이전 project callback은 새 project가 표시된 뒤 도착해도 무시한다.

현재 `id`, `root`와 같은 project message는 project 변경이 아니다. Runtime은 tree, bookmarks, 진행 중인 작업을 유지하고 sidecar 또는 project-data request를 새로 시작하지 않는다. `id`가 같아도 `root`가 바뀌면 project 변경이다.

## Sidecar message

현재 session의 `id`가 있는 message는 그 요청의 답이다. 이전 project 요청의 답은 버리고, `id`가 기다리는 요청을 가리키지 않는 답은 `files sidecar replied to unknown request <id>`로 보고한다. files sidecar는 `id` 없는 message 두 가지를 보낸다. `{changed}`는 감시 중인 경로의 변경이며, runtime은 `plugin.files.tree.changed`로 기록하고 `snapshot` 요청으로 답한다. 문자열 error가 든 `{error}`는 감시 실패이며, runtime은 `files sidecar watch failed: <error>`로 보고한다. 다른 `id` 없는 message는 이 session에 선언되지 않았으므로 `files sidecar sent an undeclared message without id: event <event>; keys <keys>`로 보고한다. 문자열 `event`가 없으면 `no event`를 쓰고, key는 정렬해서 쓰며, tree는 바꾸지 않는다. files sidecar는 표준 입출력 transport를 쓰므로, persistent sidecar의 연결 알림 `{event: "connection"}`은 이런 선언되지 않은 message다. 객체가 아닌 message는 `files sidecar message must be an object`로 보고한다.

## Declared status snapshot

Plugin host는 `files.tree`처럼 전체 manifest 이름으로 exposed status를 등록한다. View bridge는 `tree`처럼 plugin 안에서 사용하는 status 이름으로 snapshot을 저장하고 응답한다. 따라서 host adapter는 처음 값과 구독 값 모두에서 `files.` 뒤의 이름을 `bridge.snapshots.push`에 전달한다. `expose.status`에 전달하는 전체 이름은 바꾸지 않는다.

## File-open refusal

`files.open` command는 선택된 파일 경로를 `core.file.open`을 호출하는 `page.open`으로 보낸다. `-32000` 거부 `no plugin opens <path>`만 처리한다. 같은 project와 파일 선택이 현재 상태일 때 이 거부를 받으면 host는 `plugin.files.open.failed`를 기록하고 선택된 파일 행의 detail에 `열 수 없음: <오류>`로 거부를 publish한다. 처리된 이 거부는 application의 global error display로 보내지 않는다. 행은 기존 sidecar detail을 유지하고 뒤에 거부 문구를 둔다. 이후 다른 선택이나 refresh로 생긴 snapshot을 포함해 tree snapshot이 오면 거부를 지운다. command가 거부되기 전에 project나 선택 경로가 바뀌면 host는 실패를 기록하지만 현재 tree 행에는 붙이지 않는다. 다른 open 오류는 거부된 command로 남는다.

## Declared tree 확장

Host는 declared status를 expose하기 전에 `runtime.native.on`으로 `declared-ui.expanded`를 구독한다. Event 형식은 `{status, tree, path, expanded}`다. Files host는 local status `tree`와 declared tree key `files`만 받는다. `path`는 declared tree root부터 branch까지의 node key 배열이며 파일 시스템 경로가 아니다. Host는 현재 `files.tree` 값에서 key 경로를 찾아 해당 node의 `params.path`를 sidecar request에 사용한다. Node key를 합치거나 이 값으로 파일 시스템 경로를 추정하지 않는다.

Host는 `expanded`가 `true`면 sidecar operation `expand`, `false`면 `collapse`를 보내며 현재 sidecar generation과 확인한 파일 시스템 경로를 포함한다. Event는 원하는 상태를 지정하므로 현재 branch 상태로 toggle을 추정하지 않는다. Sidecar reply는 전체 `files.tree` snapshot을 publish한다. 현재 project가 없거나 tree 또는 status가 알 수 없거나, key 경로가 잘못됐거나 현재 branch를 지정하지 않으면 sidecar request 없이 host error 경로로 보고한다. Event callback의 rejection도 같은 경로로 보고한다. Host runtime이 dispose되면 event listener를 끝낸다.
