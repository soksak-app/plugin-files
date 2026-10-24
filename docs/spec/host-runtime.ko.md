# Host runtime

[English](host-runtime.md)

Host runtime은 plugin host에 표시된 project를 따른다. 시작 값과 project message는 `null` 또는 비어 있지 않은 `id`, `root`를 가진 object다. Project가 `null`이면 runtime은 tree와 bookmarks를 비우고 sidecar request를 보내지 않는다.

Project에 의존하는 host 또는 sidecar operation이 거부되면 그 operation이 캡처한 project가 여전히 현재 project일 때 거부를 보고한다. 오류 문구가 `no project is shown`이어도 같다. Operation이 캡처한 project가 바뀐 뒤에만 진행 중인 operation을 보고 없이 취소한다. 오류 문구를 비교해 취소로 분류하지 않는다.

Project가 바뀌면 이전 sidecar session은 끝난다. 이전 session에 등록된 message 및 failure callback은 project가 바뀐 뒤에도, `null`로 바뀐 뒤에도 도착할 수 있다. Runtime은 현재 project session이 아닌 callback을 무시한다. 이를 error로 보고하거나 현재 tree 또는 bookmarks를 바꾸거나, 없는 project에서 session을 만들지 않는다.

나중에 `id`, `root`가 있는 project가 표시되면 자체 sidecar session을 사용한다. 이전 project callback은 새 project가 표시된 뒤 도착해도 무시한다.

현재 `id`, `root`와 같은 project message는 project 변경이 아니다. Runtime은 tree, bookmarks, 진행 중인 작업을 유지하고 sidecar 또는 project-data request를 새로 시작하지 않는다. `id`가 같아도 `root`가 바뀌면 project 변경이다.

## Declared status snapshot

Plugin host는 `files.tree`처럼 전체 manifest 이름으로 exposed status를 등록한다. View bridge는 `tree`처럼 plugin 안에서 사용하는 status 이름으로 snapshot을 저장하고 응답한다. 따라서 host adapter는 처음 값과 구독 값 모두에서 `files.` 뒤의 이름을 `bridge.snapshots.push`에 전달한다. `expose.status`에 전달하는 전체 이름은 바꾸지 않는다.

## Declared tree 확장

Host는 declared status를 expose하기 전에 `runtime.native.on`으로 `declared-ui.expanded`를 구독한다. Event 형식은 `{status, tree, path, expanded}`다. Files host는 local status `tree`와 declared tree key `files`만 받는다. `path`는 declared tree root부터 branch까지의 node key 배열이며 파일 시스템 경로가 아니다. Host는 현재 `files.tree` 값에서 key 경로를 찾아 해당 node의 `params.path`를 sidecar request에 사용한다. Node key를 합치거나 이 값으로 파일 시스템 경로를 추정하지 않는다.

Host는 `expanded`가 `true`면 sidecar operation `expand`, `false`면 `collapse`를 보내며 현재 sidecar generation과 확인한 파일 시스템 경로를 포함한다. Event는 원하는 상태를 지정하므로 현재 branch 상태로 toggle을 추정하지 않는다. Sidecar reply는 전체 `files.tree` snapshot을 publish한다. 현재 project가 없거나 tree 또는 status가 알 수 없거나, key 경로가 잘못됐거나 현재 branch를 지정하지 않으면 sidecar request 없이 host error 경로로 보고한다. Event callback의 rejection도 같은 경로로 보고한다. Host runtime이 dispose되면 event listener를 끝낸다.
