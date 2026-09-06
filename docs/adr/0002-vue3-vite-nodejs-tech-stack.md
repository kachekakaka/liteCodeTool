# Vue 3 与 Node.js 核心技术栈选型

为了实现低代码平台的极简轻量、高效拖拽与高频实时推流响应，我们选定前端采用 Vue 3 + Vite + TypeScript，后端采用轻量级 Node.js。Vue 3 的细粒度响应式系统天然契合“实体数据池”局部快速更新的诉求，Node.js 能够在同一套 JavaScript/TypeScript 语言生态下高效提供 Schema 接口、大屏 JSON 配置持久化及 WebSocket 实时推流模拟服务。
