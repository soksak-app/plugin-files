# files plugin repository 의 test, check 와 pack(docs/features.md). pack 은 core 의 sok 를 쓴다.
.PHONY: test check pack push-check hooks

SOK ?= sok
# DIAGNOSTICS=1 이면 diagnostics.json 을 담은 진단 package 를 쓴다.
PACK_FLAGS = $(if $(DIAGNOSTICS),--diagnostics,)

# test 는 이 plugin 의 테스트만 실행한다. SDK 도구와 SDK import 를 쓰지 않는다.
node_modules: package.json
	pnpm install
	touch node_modules

test: node_modules
	pnpm test

# check 는 설치된 @soksak/plugin-api 로 선언을 검사한다. CORE_PLUGIN_API_DIR 에 core 의 packages/plugin-api 소스
# 디렉터리를 지정하면 모든 SDK 검사가 그 소스를 읽는다(docs/features.md 의 core main 검사).
# scripts/check-manifest.mjs 는 plugin.json 을 validateManifest 로 검사한다.
# 페이지와 섹션 소스의 공개 이름은 core 의 soksak-exposure 로 plugin.json 과 core 의 선언에 대해 검사한다.
# engines.soksak 은 core 의 soksak-engines 로 그 @soksak/plugin-api 의 release 를 선언하는지 검사한다.
# soksak-events 는 core 의 census 규칙을 소스에 적용하고 emit 지점을 events.json 과 대조한다(census.json 이 선언 파일이다).
SDK_EXPOSURE = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/exposure-check.js,pnpm exec soksak-exposure)
SDK_ENGINES = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/engines-check.js,pnpm exec soksak-engines)
SDK_EVENTS = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/events-check.js,pnpm exec soksak-events)
SDK_RECORDS = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/records-check.js,pnpm exec soksak-records)
check: node_modules
	node scripts/check-manifest.mjs
	$(SDK_EXPOSURE)
	$(SDK_ENGINES)
	$(SDK_EVENTS) --census census.json --catalog events.json
	$(SDK_RECORDS)

pack: check
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)

# The check that a push needs: the commit messages of the pushed range, because a published commit message is kept; CI runs
# the tests and checks on the pushed commits.
# RANGE holds the commits of the pushed refs; the pre-push hook sets it, and it defaults to origin/main..HEAD.
push-check:
	pnpm exec soksak-commits "$(or $(RANGE),origin/main..HEAD)"

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
