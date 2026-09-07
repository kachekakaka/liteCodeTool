# 平铺式源码合库与离线/标准双轨构建机制

> 决策变更（2026-09-07）：下述双轨构建选择已由 [ADR 0012](./0012-vite-build-and-offline-development-kit.md) 取代，当前实施及验收状态见该决策；源码平铺组织决定继续有效。以下保留原决策背景。

为了将已实施完成的 v0.2.0 前后端工程代码（Vue 3 + TypeScript + Node.js）高效融入当前代码仓库主干，同时遵循极简实用原则，我们决定采取“平铺合并到仓库根目录”的组织结构：`package.json`、`src/`、`server/`、`vendor/`、`tests/` 直接落盘于仓库根目录，与既有的受控文档（`docs/`、`CONTEXT.md`、`AGENTS.md`）保持同级，避免引入额外的工程嵌套。

工程构建与运行采取“离线与标准双轨并行”策略，明确各自独立的产物目录与启动命令，彻底杜绝混淆：
1. **离线极速轨**：调用自包含编译工具 `tools/build.mjs`，依赖项目固定内置资源（`vendor/`），不依赖外部网络与 npm，产物输出至 `../liteCodeTool_tmp/release/app/`，通过 `npm run start`（或 `启动演示.cmd`）启动该目录下的离线预编译服务，保障极端断网与现场交付时的极速自检与容灾；
2. **标准 Vite 工程轨**：在代码仓库根目录安装标准 npm 依赖与类型声明，执行 `npm run build:vite`（`vue-tsc --noEmit && vite build`）进行全量静态语义检查与生产级 Tree-shaking 打包，产物输出至 `../liteCodeTool_tmp/dist/`；新增 `npm run start:vite` 命令，通过 `CLIENT_DIR` 环境变量显式指向 `dist` 目录启动服务端，确保两轨产物均有清晰、独立、可重复的验收链路。
