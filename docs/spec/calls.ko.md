# Call 과 대기

[English](calls.md)

Files view 는 core 0.0.40 의 call 규칙을 따른다(core `docs/spec/plugin-processes.md` rule 3, `docs/spec/exposure.md` 의 command `timeout`).

## Call

`plugin.json` 은 command 에 `timeout` 을 선언하지 않는다. core 는 command 선언의 그 member 를 `<where>: timeout is not a member of a command declaration` 으로 거부한다. manifest test 는 command entry 의 member 를 core 가 받아들이는 `name`, `description`, `params`, `result` 로 적으므로, core 처럼 `timeout` 을 거부한다. view 의 call 에는 시간 한도가 없다. call 은 답, cancel, 상대의 끝으로 끝나고, view 는 그것을 위해 timer 를 시작하지 않는다. 살아 있는 상대가 답하지 않으면 call 은 열린 채로 남고, core 가 그것을 `core.plugin.open-calls` 로 알린다.

`test/sdk-models/view.mjs` 의 view bridge model 은 call 을 위해 timer 를 시작하지 않는다. 그 project data 의 `change` 는 core view runtime 의 `DATA_CHANGE_READS` 처럼 key 를 최대 64번 읽는다. 이 한도는 write 경합의 read 수를 셀 뿐 시간을 기다리지 않는다.

## Test

어떤 test 도 시간으로 판정하지 않는다. test 는 timer 를 시작하지 않고, timer 를 mock 하지 않고, 시간 한도를 두지 않고, 정해진 턴 수로 settle 하지 않는다. fake view window 는 page 가 보내는 각 message 와 그 document 의 element 의 자식이 바뀌는 각 변화를 기록하고, view 의 test 는 자기가 확인하는 처리를 끝내는 occurrence 를 그것이 기록되는 턴에 기다린다. command 의 답, exposure request 의 답, error 기록, log 기록, 그려진 row 다. view 의 시작은 그 module 의 import 가 resolve 될 때 끝난다. module 이 시작을 await 하기 때문이다. 없음을 확인하는 test 는 먼저 처리를 끝내는 occurrence(command 의 답 같은)를 기다린 뒤 없음을 확인한다. row 밖의 double click 처럼 event 의 턴에 끝나는 처리는 그 턴에 확인한다. 복사한 contract case 의 재생은 step 마다 case 가 그 step 에 기대하는 기록을 기다린다. occurrence 가 오지 않는 대기는 event loop 의 끝에, 곧 실행할 것이 남지 않아 process 가 `beforeExit` 를 낼 때 reject 되므로, test 는 그 event 로 실패한다.
