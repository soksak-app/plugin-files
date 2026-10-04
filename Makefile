# files plugin repository 의 test 와 pack(docs/features.md). pack 은 core 의 sok 를 쓴다.
.PHONY: test pack

SOK ?= sok
# DIAGNOSTICS=1 이면 diagnostics.json 을 담은 진단 package 를 쓴다.
PACK_FLAGS = $(if $(DIAGNOSTICS),--diagnostics,)

# test 는 package.json 이 정한 core commit 의 @soksak/plugin-api 를 쓴다.
node_modules: package.json
	pnpm install
	touch node_modules

# 페이지와 섹션 소스의 공개 이름은 core 의 soksak-exposure 로 plugin.json 과 core 의 선언에 대해 검사한다.
# engines.soksak 은 core 의 soksak-engines 로 그 @soksak/plugin-api 의 release 를 선언하는지 검사한다.
test: node_modules
	pnpm test
	pnpm exec soksak-exposure
	pnpm exec soksak-engines

pack:
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)
