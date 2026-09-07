# 第三方资源与许可

本软件不包含系统字体。页面使用用户机器上已安装的中文及无衬线字体。

| 资源 | 固定版本 | 许可 | 使用范围 |
| --- | --- | --- | --- |
| Vue | 3.5.13 | MIT；`vendor/vue/LICENSE` | 本地浏览器运行与发布模板编译 |
| TypeScript | 5.8.3 | Apache-2.0；`vendor/typescript/LICENSE.txt` | 仅源码离线发布编译，不进入运行服务依赖 |
| he | 1.2.0 | MIT；`vendor/he.LICENSE` | 构建期HTML实体解码 |
| ws | 8.17.1 | MIT；`vendor/ws.LICENSE` | Node WebSocket服务 |

资源取自本构建环境现有安装：Vue来自trame_client的Vue分发资源，TypeScript与he来自已安装JS工具依赖，ws从Playwright所分发依赖中提取其WebSocket模块闭包。保留原有许可与版权，不打包浏览器自动化工具本身。ws使用JavaScript回退实现，不携带可选原生扩展。

`package.json`保留常规在线开发所需版本范围；实际发行包使用以上固定文件。离线构建可重复使用这些文件，不声称完成了最新漏洞数据库审计。代码与资源校验值见发行包SHA256SUMS.txt。
