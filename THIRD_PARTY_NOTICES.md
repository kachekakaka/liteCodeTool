# 第三方资源与许可

项目使用本机字体，不打包系统字体。当前前端由 Vite 统一构建，实际依赖版本以 `package-lock.json` 为准。

| 资源 | 许可位置 | 使用范围 |
| --- | --- | --- |
| Vue、Vue Router | 各自 `node_modules` 包内 LICENSE（MIT） | 前端渲染与路由 |
| Vite | `node_modules/vite/LICENSE`（MIT） | 开发和生产构建 |
| TypeScript | `node_modules/typescript/LICENSE.txt`（Apache-2.0） | 类型检查与服务端共享核心编译 |
| Prettier | `node_modules/prettier/LICENSE`（MIT） | 源码格式化 |
| ws 内置资源 | `vendor/ws.LICENSE`（MIT） | Node WebSocket 服务，不依赖可选原生扩展 |
| tar | `node_modules/tar/LICENSE.md`（BlueOak-1.0.0）及其依赖包内许可证 | 开发侧提取和装配归档，不进入应用运行依赖 |
| Node.js 运行环境 | 双平台运行包的 `runtime/LICENSE`，保留官方完整第三方许可 | 包内独立启动应用 |

旧 `vendor/vue`、`vendor/typescript` 与 `vendor/he.*` 已随旧构建链移除。仍在使用的 ws 内置文件及其许可保留，来源延续原项目分发资源。

完整离线开发包保留 Node、VS Code、PowerShell 和扩展自身随附的许可。安装和使用须遵守各自发行许可；这些工具不属于本项目自有代码。离线包的 `manifest.json` 记录工具链与扩展版本、资源来源和校验信息。
