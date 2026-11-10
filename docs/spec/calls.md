# Calls and waits

[한국어](calls.ko.md)

The files views follow the call rule of core 0.0.40 (core `docs/spec/plugin-processes.md`, rule 3, and `docs/spec/exposure.md`, command `timeout`).

## Calls

`plugin.json` declares no `timeout` for a command, because core refuses that member of a command declaration with `<where>: timeout is not a member of a command declaration`. The manifest test lists the members of a command entry as core accepts them, `name`, `description`, `params` and `result`, so it refuses a `timeout` as core does. A call of a view has no time limit. It ends by its reply, by its cancel or by the end of its peer, and the view starts no timer for it. A live peer that does not reply leaves the call open; core reports it in `core.plugin.open-calls`.

The model of the view bridge in `test/sdk-models/view.mjs` starts no timer for a call. `change` of its project data reads the key at most 64 times, as `DATA_CHANGE_READS` of the core view runtime: the bound counts the reads of a write race and waits for no time.

## Tests

No test judges by time. The tests start no timer, mock no timer, set no time limit of their own and settle by no count of turns. The fake view window records each message that the page sends and each change of the children of an element of its document, and the test of a view waits for the occurrence that ends the handling that it asserts, in the turn in which it is recorded: the reply of a command, the reply of an exposure request, an error record, a log record or a drawn row. The start of a view ends when the import of its module resolves, because the module awaits its start. A test that asserts an absence first waits for the occurrence that ends the handling, such as the reply of the command, and then asserts the absence; a handling that ends in the turn of its event, such as a double click off the rows, is asserted in that turn. The replay of the copied contract cases waits, for each step, for the records that the case expects of that step. A wait ends only by its occurrence. The limit of the test runner, `--test-timeout=120000` in the test script of `package.json`, ends a test whose occurrence does not come, as each core test has its limit: the runner fails that test with its name.
