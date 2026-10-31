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
