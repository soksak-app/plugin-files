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
이 명령은 목록을 `runtime.data.set`으로 쓴다. View는 첫 읽기 전에 `runtime.data.on`으로 구독하며, 변경 event가 key `bookmarks`를 가리키면 목록을 다시 읽는다. 다른 key의 변경은 아무것도 읽지 않는다. 경로의 목록이 아닌 저장 값은 오류이며, 그 값으로 목록을 그리지 않는다.

## 노출되는 상태

Tree view는 status `files.tree`를 선언한다. 그 값은 `{rows, message}`이다. `rows`는 보이는 tree의 행을 표시 순서대로 나열하며, 각 행은
`path`, `kind`(`file` 또는 `directory`), `depth`, `expanded`, `selected`를 가진다. `message`는 message 행의 텍스트이고, message 행이
보이지 않으면 `null`이다. 북마크 view는 status `files.bookmarks`를 선언한다. 그 값은 저장된 순서의 북마크 경로 목록이다. 각 status는
보고하는 상태가 바뀔 때마다 그 값을 watcher에게 알린다.

Header button은 dom 이름을 가진다. 새로 고침 button은 `files.tree.refresh`, 별 button은 `files.bookmarks.add`이다. Tree 행은 dom 이름
`files.tree.row`(`many`)를 가진다. Page는 이 이름의 provider 하나를 등록하며, 그 provider는 지금 library가 그리는 행, 즉 tree
container의 열린 shadow root에서 `data-item-path`를 가진 요소를 돌려준다. Library는 행 요소에 대한 hook이 없으므로, page는 그 root가
바뀔 때(subtree mutation) 각 행을 표시한다. 북마크 행마다 `files.bookmarks.item`을 가지며, 그 삭제 button은 `files.bookmarks.remove`를
가진다. 두 이름 모두 `many`를 선언하고 provider를 하나씩 가지며, 그 provider는 지금 그려진 행을 돌려준다. 그래서 제거된 행은 제공되지 않는다.
