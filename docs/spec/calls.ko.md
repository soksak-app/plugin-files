# Call 과 대기

[English](calls.md)

Files view 는 core 0.0.40 의 call 규칙을 따른다(core `docs/spec/plugin-processes.md` rule 3, `docs/spec/exposure.md` 의 command `timeout`).

## Call

`plugin.json` 은 command 에 `timeout` 을 선언하지 않는다. core 는 command 선언의 그 member 를 `<where>: timeout is not a member of a command declaration` 으로 거부한다. manifest test 는 command entry 의 member 를 core 가 받아들이는 `name`, `description`, `params`, `result` 로 적으므로, core 처럼 `timeout` 을 거부한다. view 의 call 에는 시간 한도가 없다. call 은 답, cancel, 상대의 끝으로 끝나고, view 는 그것을 위해 timer 를 시작하지 않는다. 살아 있는 상대가 답하지 않으면 call 은 열린 채로 남고, core 가 그것을 `core.plugin.open-calls` 로 알린다.

SDK test host(`@soksak/plugin-api/testing` 의 `openView`, `package.json` 이 pin 한 release)의 view host 는 call 을 위해 timer 를 시작하지 않는다. `change.data` 는 다른 view 처럼 project data key 를 쓰고, `onDataRead` 는 read 와 그 뒤의 replace 사이에 쓴다. page 는 write 경합에서 key 를 최대 64번 읽는다(core view runtime 의 `DATA_CHANGE_READS`). 이 한도는 read 수를 세며 시간을 기다리지 않는다.

## Test

어떤 test 도 시간으로 판정하지 않는다. test 는 timer 를 시작하지 않고, timer 를 mock 하지 않고, 자기 시간 한도를 두지 않고, 정해진 턴 수로 settle 하지 않는다. view host 는 page 가 보내는 각 message 를 기록하고, view 의 test 는 자기가 확인하는 처리를 끝내는 occurrence 를 기다린다. view 의 settled 상태(`settled`), log event 기록(`logged`), command 의 답(`request`)이다. tree library 는 row 를 page 안에 그리므로, test 는 view 의 document 에서 그려진 row 를 읽는다. view 의 시작은 그 module 의 import 가 resolve 될 때 끝난다. module 이 시작을 await 하기 때문이다. 없음을 확인하는 test 는 먼저 처리를 끝내는 occurrence(command 의 답 같은)를 기다린 뒤 없음을 확인한다. row 밖의 double click 처럼 event 의 턴에 끝나는 처리는 그 턴에 확인한다. 대기는 그 occurrence 로만 끝난다. occurrence 가 오지 않는 test 는 core 의 각 test 의 한도처럼 test runner 의 한도, 곧 `package.json` test script 의 `--test-timeout=120000` 이 알린다. runner 는 그 test 를 이름과 함께 실패시킨다.
