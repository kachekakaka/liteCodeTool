# Lite Code Tool (轻量代码工具)

轻量、模块化且易于维护的代码处理辅助工具。

## 领域词汇规范 (Language)

本项目所有代码、文档、交互提示及日常讨论严格遵守以下领域术语定义。严禁自造别名或在代码命名中混用相近词汇。

---

### 基础架构与环境概念 (Infrastructure & Environment Concepts)

**Data Directory (数据目录)**:
存放运行时用户配置文件（如 `config.json`）、用户自定义规则库或本地持久化数据的同级独立物理目录（`../liteCodeTool_datas/`），完全与源码仓解耦。
- _避免使用 (Avoid)_: Workspace folder, cache dir, project folder, storage root

**Temporary Directory (外部临时目录)**:
位于仓库同级的独立临时目录（`../liteCodeTool_tmp/`），用于存放调试日志、临时中间草稿、构建临时缓存以及成果报告双写物理镜像（`walkthrough.md`）。
- _避免使用 (Avoid)_: Local temp, build artifacts, scratch dir, dump folder

**Dual-write Mirror (双写镜像)**:
AI 实施成果报告（`walkthrough.md`）及关键验证记录在系统内部生成 Artifact 的同时，必须物理同步镜像复制到 `../liteCodeTool_tmp/walkthrough.md` 的规范机制。
- _避免使用 (Avoid)_: Backup copy, local sync, artifact dump

**Application Configuration (应用配置)**:
管理工具运行时基础行为、路径配置与运行参数的持久化配置文件，统一存储于外部数据目录中。
- _避免使用 (Avoid)_: Preferences, options, ini file, sys settings

---

### 核心低代码与大屏概念 (Low-Code & Dashboard Core Concepts)

**Canvas (画布)**:
承载并编排多个组件实例的大屏页面容器，负责管理全局分辨率、页面背景与组件间的层叠排布。
- _避免使用 (Avoid)_: Stage, board, panel container, view frame

**Component Template (组件模板)**:
在组件工坊中定义并保存在资产库中的原型蓝本，定义内部控件构成、相对布局与抽象对象槽位契约，不固化任何具体的物理业务实例。
- _避免使用 (Avoid)_: Master component, base widget, blueprint, prototype block

**Component Instance (组件实例)**:
将组件模板拖入画布后生成的独立运行副本，拥有独立的空间坐标、尺寸排布、私有属性及具体的对象槽位绑定值。修改与保存大屏时仅影响实例本身，绝不污染源组件模板。
- _避免使用 (Avoid)_: Cloned widget, copy, view component, dynamic control

**Control (控件)**:
最基础的原子级可视化或输入单元（包含数值框、文本框、时间框、指示灯、表格、曲线、图片/动态图控件等），依附于组件内部，既支持直接录入固定静态内容，也支持绑定动态数据字段。
- _避免使用 (Avoid)_: Element, primitive, widget item, sub-component

**Image Control (图片控件)**:
支持本地/远程静态图片（PNG/JPG/SVG）与动态图（GIF/SVG动画）展示的基础原子控件，用于图徽标牌、船舶示意图及无数据时的科技感动态视觉呈现。
- _避免使用 (Avoid)_: Picture widget, icon box, photo element, asset viewer

**Static vs Dynamic Source (静态与动态双模数据源)**:
控件的内容填充模式。静态模式直接由设计者在编辑态录入固定文本或数值（用于标题、静态标牌、常量），动态模式则绑定对象槽位或全局数据字段由实时通信驱动。
- _避免使用 (Avoid)_: Hardcoded text, fixed value mode, raw string, mock data

**Object Slot (对象槽位)**:
组件内部声明的抽象实体参数插槽（如“对象1”、“对象2”），代表待注入的具体业务实体（如某艘特定船舶），供内部控件建立字段级绑定关系。
- _避免使用 (Avoid)_: Entity parameter, object placeholder, data target, bind target

**Multi-slot Component (多槽位组件)**:
单个组件模板内部声明了两个或更多抽象对象槽位（如同时包含“对象1: 本船”与“对象2: 会遇船”）的复合组件，内部不同控件可分别独立绑定到不同槽位的字段上。
- _避免使用 (Avoid)_: Dual-entity widget, cross-object card, multi-target component

**Headless Component (无头组件 / 纯净组件)**:
支持隐藏默认外框头部的组件实例形态。隐藏头部后界面完全消除系统预置的标题栏与下拉框，仅呈现用户排布的原子控件，其对象槽位指派由属性面板或大屏全局调度接管。
- _避免使用 (Avoid)_: Frameless card, raw component, borderless widget, clean view

**Slot Scope (槽位作用域)**:
控件进行数据绑定时的第一级寻址上下文。控件通过指定 `slotId`（如 `slot_1` 或 `slot_2`）将自己限定在特定槽位对应的数据实体内，再选择该实体的具体字段。
- _避免使用 (Avoid)_: Entity context, target scope, data namespace

**Entity Store (实体数据池)**:
前端内存中维护的轻量全局响应式数据中心，WebSocket 接收的所有业务数据（按类型与唯一标识索引）与全局非实体数据统一写入该池，自动触发订阅了相应实体的控件局部响应刷新。
- _避免使用 (Avoid)_: Redux store, cache map, global dict, message bus

**Editor Mode (编辑态)**:
低代码大屏的设计与制作环境，支持组件自由拖拽编排、层级调整、对象槽位规则绑定与全局大屏参数配置。
- _避免使用 (Avoid)_: Design mode, designer, workbench, admin view

**Viewer Mode (显示态)**:
大屏的投屏展示与日常监控运行环境，画布布局与组件尺寸锁定，支持 WebSocket 高频实时推流渲染以及组件对象槽位的即时切换与动态配置保存。
- _避免使用 (Avoid)_: Runtime mode, preview, display mode, presentation view

**Data Schema (数据模式)**:
由后端接口以标准 JSON 格式下发的数据类型结构定义（包含实体型如 AIS 船舶目标，以及非实体的全局统计与告警信息），包含字段标识、中文显示名、数据类型及工程单位等元数据。
- _避免使用 (Avoid)_: Model definition, payload format, field dictionary, json contract

**Data Binding (数据绑定)**:
控件展示属性与数据源字段之间建立的映射关系，分为基于“对象槽位”的实体字段绑定与直接面向“全局数据模式”的无对象字段绑定。
- _避免使用 (Avoid)_: Field mapping, link path, data connection, wire

**Slot Retargeting (槽位重定向)**:
在编辑态或显示态将组件对象槽位所指向的物理实体标识（如船舶 MMSI）切换为另一实体的操作。重定向仅改变数据源指针，组件内各控件预设的字段绑定规则与展示配置严格保持不变。
- _避免使用 (Avoid)_: Re-binding, object swapping, field reset, target switch

**Entity Snapshot (实体快照 / 初始底账)**:
实体在后端的最新持久化全量状态记录。大屏加载或组件绑定新实体时，前端先通过 HTTP 主动查询初始底账存入实体池，使控件立即获得当前状态；若后端暂无该字段或未上报，则严格按无数据处理。
- _避免使用 (Avoid)_: Full data dump, state backup, entity details, raw record

**Empty State (空值缺省)**:
当后端从未下发某字段、字段值为 null 或实体尚未上报该属性时，控件呈现的统一占位状态（如“--”或灰色离线态），绝不伪造或臆测数据。
- _避免使用 (Avoid)_: Null view, blank value, default mock, fallback fake

**Control Override (控件私有覆盖)**:
组件实例针对其引用的组件模板内部特定控件，在不改变源模板的前提下，单独覆盖其数据绑定（槽位与字段）或展示属性（标签、单位、阈值规则）的私有映射配置。
- _避免使用 (Avoid)_: Control clone, local hack, widget patch, template mutation

**Monitor Object Drawer (监控对象抽屉)**:
显示态下从屏幕边缘滑出的全局轻量管理抽屉，集中列出大屏所有组件实例的槽位指派状态，提供全局检索、临时换船、未保存变更提示与固化保存功能。
- _避免使用 (Avoid)_: Settings sidebar, admin popup, vessel modal, global panel

**In-situ Retargeting Trigger (就地重定向触发器)**:
在无头纯净模式卡片上，支持鼠标长停留悬停（Hover）与触控长按（Long Press）呼出卡片专属换船微型面板的快捷交互机制，与全局监控对象抽屉互为补充。
- _避免使用 (Avoid)_: Quick switcher, local popover, card tooltip, floating trigger

**Single-Control Component Instance (单控件组件实例)**:
当设计者直接向画布拖入原子控件时，由系统自动在底层包裹生成的轻量级单控件组件运行副本，使原子控件能够无缝继承组件的栅格排布与数据生命周期管理。
- _避免使用 (Avoid)_: Bare control, standalone primitive, naked widget

**Sliding Lookback Window (滑动回溯时间窗口)**:
时序曲线控件中配置的有效数据时间跨度。只呈现时间戳处于回溯窗口内的真实数据点，新点推入时更早旧点自动平滑滑出；若历史数据尚未蓄满，则窗口左侧如实留白，绝不伪造历史。
- _避免使用 (Avoid)_: Mock timeline, fake history buffer, rolling mock

**Vector Adaptive Viewport (矢量自适应视口)**:
大屏以 1920×1080 为基准逻辑分辨率，核心图表、装饰角与动效均采用矢量 SVG 与百分比栅格体系，外层结合自适应比例缩放引擎，向 2K (2560×1440) 和 4K (3840×2160) 等超高分显示设备平滑扩展，保持边缘绝对锐利与零排版变形。
- _避免使用 (Avoid)_: Fixed canvas, pixel-locked stage, fixed-width dashboard

**Table Stale Indication (表格陈旧提示)**:
表格行或单元格依据记录源时间戳与配置的超时门槛（`staleSeconds`）动态呈现的视觉弱化状态，用以警示调度人员该实体已停更，支持自定义秒数阈值或设为 0 关闭。
- _避免使用 (Avoid)_: Row timeout, offline color, table freeze, expire mask

**Global Time Series (全局时序序列)**:
时序曲线控件中无需关联任何具体对象槽位、直接绑定全局非实体模式指标（如全港总船数、预警总数）的历史走势数据序列。
- _避免使用 (Avoid)_: Macro line, system trend, non-entity series, port curve
