# files plugin repository 의 test, check 와 pack(docs/features.md). pack 은 core 의 sok 를 쓴다.
.PHONY: test check pack hooks

SOK ?= sok
# DIAGNOSTICS=1 이면 diagnostics.json 을 담은 진단 package 를 쓴다.
PACK_FLAGS = $(if $(DIAGNOSTICS),--diagnostics,)

# test 는 이 plugin 의 테스트만 실행한다. SDK 도구와 SDK import 를 쓰지 않는다.
node_modules: package.json
	pnpm install
	touch node_modules

test: node_modules
	pnpm test

# check 는 package.json 이 정한 core commit 의 @soksak/plugin-api 로 선언을 검사한다.
# scripts/check-manifest.mjs 는 plugin.json 과 ui/host.html 의 import map 을 SDK 의 validator 로 검사한다.
# 페이지와 섹션 소스의 공개 이름은 core 의 soksak-exposure 로 plugin.json 과 core 의 선언에 대해 검사한다.
# engines.soksak 은 core 의 soksak-engines 로 그 @soksak/plugin-api 의 release 를 선언하는지 검사한다.
# soksak-events 는 core 의 census 규칙을 소스에 적용하고 emit 지점을 events.json 과 대조한다(census.json 이 선언 파일이다).
check: node_modules
	node scripts/check-manifest.mjs
	pnpm exec soksak-exposure
	pnpm exec soksak-engines
	pnpm exec soksak-events --census census.json --catalog events.json
	pnpm exec soksak-records

pack: check
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
