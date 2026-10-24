# Host runtime

[English](host-runtime.md)

Host runtime은 plugin host에 표시된 project를 따른다. 시작 값과 project message는 `null` 또는 비어 있지 않은 `id`, `root`를 가진 object다. Project가 `null`이면 runtime은 tree와 bookmarks를 비우고 sidecar request를 보내지 않는다.

Project가 바뀌면 이전 sidecar session은 끝난다. 이전 session에 등록된 message 및 failure callback은 project가 바뀐 뒤에도, `null`로 바뀐 뒤에도 도착할 수 있다. Runtime은 현재 project session이 아닌 callback을 무시한다. 이를 error로 보고하거나 현재 tree 또는 bookmarks를 바꾸거나, 없는 project에서 session을 만들지 않는다.

나중에 `id`, `root`가 있는 project가 표시되면 자체 sidecar session을 사용한다. 이전 project callback은 새 project가 표시된 뒤 도착해도 무시한다.
