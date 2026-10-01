# files plugin repository 의 test 와 pack(docs/features.md). pack 은 core 의 sok 를 쓴다.
.PHONY: test pack

SOK ?= sok
# DIAGNOSTICS=1 이면 diagnostics.json 을 담은 진단 package 를 쓴다.
PACK_FLAGS = $(if $(DIAGNOSTICS),--diagnostics,)

# test 는 core tag 의 @soksak/plugin-api 를 쓴다.
node_modules: package.json
	pnpm install
	touch node_modules

test: node_modules
	pnpm test

pack:
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)
