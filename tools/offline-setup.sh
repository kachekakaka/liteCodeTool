#!/usr/bin/env bash
# ARM 离线首次展开工具链；保留官方 tar 内的符号链接与执行权限。
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")" && pwd)"
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != aarch64 ]; then
  echo '此包仅适用于 Linux ARM64（aarch64）' >&2
  exit 1
fi
cd "$ROOT/toolchain"
sha256sum -c archives.sha256
for tool in node vscode; do
  if [ ! -f "$tool/.offline-ready" ]; then
    mkdir -p "$tool"
    tar -xzf "$tool.tar.gz" --strip-components=1 -C "$tool"
    touch "$tool/.offline-ready"
  fi
done
chmod +x "$ROOT/liteCodeTool/node_modules/.bin/"* "$ROOT/liteCodeTool/node_modules/@esbuild/linux-arm64/bin/esbuild"
"$ROOT/toolchain/node/bin/node" --version
