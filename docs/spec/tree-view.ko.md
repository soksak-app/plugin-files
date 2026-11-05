# Tree와 bookmarks view

[English](tree-view.md)

`files.tree`와 `files.bookmarks` section은 plugin의 view page(`ui/tree.html`, `ui/bookmarks.html`)이다. 각 view는 시작 값을
`window.sokSurface`에서 읽는다. `project`는 `null`이거나 비어 있지 않은 `id`와 `root`를 가진 object이고, `surface`는 section
surface의 이름이다. `project`가 `null`인 view는 sidecar 요청을 보내지 않고 project data를 읽지 않는다.

## Tree view

View는 각 요청을 `@soksak/sidecar-files`에 session id `surface`로 보낸다. 형식은 wire 계약이 선언한 형식이다
(`test/fixtures/sidecar-files/tree-wire.json`). `snapshot`과, 마지막 응답의 `generation`과 `path`를 담은 `expand`, `collapse`,
`select`를 보낸다. `select`는 선택을 지우려고 `""`를 쓴다. 응답은 `generation`이 1 이상이고, `path`, `name`, `directory`, `depth`,
`selected`를 가진 행의 목록이며, `directory` 행은 `expanded`를 갖고, `detail` 텍스트는 선택 사항일 때만 유효하다. 그 밖의 응답은
오류다. `changed`를 담은 변경 줄은 새 `snapshot`을 요청한다. session 실패나 sidecar 오류는 메시지 줄에 보이고, `where`가
`files tree`인 오류 줄에 기록된다.

사용자의 각 동작은 view의 선언된 명령이다. `files.refresh`, `files.select`, `files.tree.toggle`(폴더 펼침과 접힘, `expanded` 포함),
`files.open`(파일 더블 클릭이나 Enter, `core.file.open`을 실행), `files.open.failed`, `files.bookmarks.add`(별 단추, 선택한 파일을
저장된 `bookmarks`에 더한다)이다. 행은 vendor된 `@pierre/trees` bundle로 그린다. 라이브러리의 펼침과 선택은 마지막 응답을 따른다.

## Bookmarks view

View는 project data key `bookmarks`(경로의 목록)를 `runtime.data.get`으로 읽고, 명령 `files.bookmarks.remove`로 경로를 지운다.
이 명령은 tree view의 `files.bookmarks.add`처럼 목록을 `runtime.data.change`로 바꾸므로, 읽기와 쓰기 사이에 온 다른 view의 변경이 남는다. View는 첫 읽기 전에 `runtime.data.on`으로 구독하며, 변경 event가 key `bookmarks`를 가리키면 목록을 다시 읽는다. 다른 key의 변경은 아무것도 읽지 않는다. 경로의 목록이 아닌 저장 값은 오류이며, 그 값으로 목록을 그리지 않는다.

## 노출되는 상태

Tree view는 status `files.tree`를 선언한다. 그 값은 `{rows, message}`이다. `rows`는 보이는 tree의 행을 표시 순서대로 나열하며, 각 행은
`path`, `kind`(`file` 또는 `directory`), `depth`, `expanded`, `selected`를 가진다. `message`는 message 행의 텍스트이고, message 행이
보이지 않으면 `null`이다. 북마크 view는 status `files.bookmarks`를 선언한다. 그 값은 저장된 순서의 북마크 경로 목록이다. 각 status는
보고하는 상태가 바뀔 때마다 그 값을 watcher에게 알린다.

Header button은 element 이름을 가진다. 새로 고침 button은 `files.tree.refresh`, 별 button은 `files.bookmarks.add`이다. Tree 행은 element 이름
`files.tree.row`(`many`)를 가진다. Page는 이 이름의 provider 하나를 등록하며, 그 provider는 지금 library가 그리는 행, 즉 tree
container의 열린 shadow root에서 `data-item-path`를 가진 요소를 돌려준다. Library는 행 요소에 대한 hook이 없으므로, page는 그 root가
바뀔 때(subtree mutation) 각 행을 표시한다. 북마크 행마다 `files.bookmarks.item`을 가지며, 그 삭제 button은 `files.bookmarks.remove`를
가진다. 두 이름 모두 `many`를 선언하고 provider를 하나씩 가지며, 그 provider는 지금 그려진 행을 돌려준다. 그래서 제거된 행은 제공되지 않는다.

## 진단 entry

`diagnostics.json`은 core view benchmark의 section-view entry(core `docs/spec/plugin-processes.md#section-views`)를 module
`ui/section-diagnostics.js`와 함께 선언하고, `package.json`의 `files`가 둘을 나열한다. View는 시작 값의 `diagnostics`에서 선언을 읽는다.
그 member가 없는 시작 값은 오류이고, `null` 선언은 아무것도 불러오지 않으며, 그 밖에는 view가 선언이 가리키는 module을 import하고 첫
내용을 그린 뒤 자기 surface에서 entry를 제공한다.

- `<section id>.view.ready`는 각 view의 status `{ready, content, language}`이고, view는 등록하는 자리에 이름을 그대로 써서 자기 status만
  등록한다. `files.tree.view.ready`의 schema는 `content`를 enum `test-project`로, `language`를 enum `en-US`로 선언한다. 이 텍스트는 같은
  이름의 project 폴더에서 tree view의 head 제목이 보이는 문구다. `files.bookmarks.view.ready`의 schema는 `content`를 enum `북마크 없음`으로,
  `language`를 enum `ko-KR`로 선언한다. 이 텍스트는 bookmark 없는 project에서 bookmarks view의 message 줄이 보이는 문구다. View benchmark가
  section을 여는 상태가 이것이며, entry는 view가 보이는 것을 바꾸지 않는다. `diagnostics.json`의 각 schema는 core의 schema subset만 쓰므로
  고정 값은 항목 하나짜리 enum이다. Module은 두 값을 시작 값의 선언에서 읽고, 문자열 하나짜리 enum이 아닌 선언은 그 status와 field를
  가리키는 오류다. `ready`는 요소가 document 안에 있고 숨겨지지 않았으며 텍스트를 보이는 동안에만 true다. 그래서 다른 텍스트는 `false`를 보고하고,
  message 줄의 텍스트를 대신하는 오류는 status의 watcher에게 `false`를 알린다.
- `files.view.history`는 view document의 session history 길이인 `{length}`로 답한다.
- `files.view.frames {action}`의 `start`는 root의 theme 색 `--card`, `--bg`, `--edge`, `--rule`, `--focus`를 각각 `#rrggbb`로 읽고(다른
  값은 그 token을 가리키는 오류다), magenta, cyan, yellow, green, red, blue 가운데 각 색과 적어도 한 channel에서 4보다 크게 다른 첫 색을
  `markerColor`로 삼는다. View document에서 `observeViewDocumentFrames`를 시작하고, 각 frame을 `plugin.files.view.content_frame`으로
  쓰며, `background-color`와 `--card`의 important 선언을 담은 adopted style sheet로 root를 `markerColor`로 칠하고,
  `{enabled: true, sourceClock, markerColor}`로 답한다. `sourceClock`은 document 시계의 `{documentTimeOriginMs, sourceNowMs, sourceResolutionMs: 1}`이다.
  `stop`은 observer를 멈추고 sheet를 지우며 `{enabled: false}`로 답한다. 두 번째 `start`, `start` 없는 `stop`, 다른 action은 오류다.
