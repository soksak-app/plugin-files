# 파일 plugin

[English](README.md)

Plugin 형식은 soksak core spec(`docs/spec/plugins.md`)이 정한다.

```sh
make test                                   # 이 plugin의 test
make check                                  # 고정된 core release의 SDK 검사
make pack OUT=<folder> SOK=<core>/target/debug/sok   # plugin release
make hooks                                  # clone 후 한 번: commit 때 commit message와 record를 검사
```

Checklist는 [docs/features.md](docs/features.md)다.
