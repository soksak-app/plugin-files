# files plugin repository 의 test, check 와 pack(docs/features.md). pack 은 pnpm pack 으로 release 를 쓴다.
.PHONY: install test check pack check-push install-hooks

# test 는 이 plugin 의 테스트만 실행한다. SDK 도구와 SDK import 를 쓰지 않는다.
# The installation stage (core docs/spec/plugins.md#repositories): it installs the locked dependencies; the tests, checks and packs consume them without installing.
install:
	pnpm install --frozen-lockfile

test:
	pnpm test

# check 는 package.json 이 pin 한 kit release 의 검사를 실행한다. sok-check events 는 소스에서 빠진 record 를 세고 emit 지점을
# events.json 과 대조하며(event-sources.json 이 선언 파일이다), sok-check docs 는 record 를 검사한다. application 은 release 를
# 설치할 때 plugin.json 을 검증하고, registry 검사는 release 의 공개 이름을 각 listed core 와 비교한다.
check:
	pnpm exec sok-check events --config event-sources.json --catalog events.json
	pnpm exec sok-check docs
	pnpm exec sok-check commands

pack: check
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	pnpm pack --pack-destination $(OUT)

# The check that a push needs: the commit messages of the pushed range, because a published commit message is kept; CI runs
# the tests and checks on the pushed commits.
# RANGE holds the commits of the pushed refs; the pre-push hook sets it, and it defaults to origin/main..HEAD.
check-push:
	pnpm exec sok-check commits "$(or $(RANGE),origin/main..HEAD)"

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
install-hooks:
	@git config core.hooksPath .githooks
