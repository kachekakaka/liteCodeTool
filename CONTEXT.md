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

**Static Indicator State (指示灯固定状态)**:
指示灯在固定内容模式下由设计者指定的单一状态文字与颜色，直接决定显示内容，与动态绑定的状态颜色规则独立保存。
- _避免使用 (Avoid)_: 固定匹配规则, 默认动态状态, 共享灯色

**Dynamic Indicator Color Rules (指示灯动态状态颜色规则)**:
指示灯在动态绑定模式下将数据状态值映射为显示颜色的一组规则，与指示灯固定状态独立保存；未匹配或缺值不推断为正常状态。
- _避免使用 (Avoid)_: 固定颜色列表, 共用状态表, 静态匹配规则

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
卡片上支持的轻量换船交互入口（编辑态与显示态全视图模式统一支持）。鼠标悬停在卡片上时平滑浮现右上角切换图标按钮（⇄），点击该按钮（或触控长按）呼出专属微型面板；悬停本身不自动弹出大面板，避免无意遮挡大屏。
- _避免使用 (Avoid)_: Quick switcher, local popover, card tooltip, floating trigger

**Card Subtitle (卡片副标题 / 卡片元信息)**:
组件卡片头部右侧由设计者明确填写的可选元信息文本，新组件模板默认留空，不依据对象槽位自动补字。组件实例可继承模板副标题或单独填写，显式清空则在卡头上完全隐藏不占位。
- _避免使用 (Avoid)_: Header badge, sub-heading, meta label, card tag


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

**KPI Emblem (指标卡片徽标)**:
数值控件在 KPI 呈现风格下，位于大数字右侧作为半透明装饰的矢量小图标（支持内置货船、渔船、商船、告警预设，或自定义图片替换与隐藏关闭），增强大屏工业视觉质感。
- _避免使用 (Avoid)_: Number bg, icon widget, kpi picture, stat decoration

**In-situ Text Editing (就地文本编辑)**:
在编辑态与显示态均支持的轻量编辑交互：鼠标双击大屏标题、卡片名称或静态文本即可原地激活输入框直接修改文字，按回车或失焦即时生效并进入未保存状态，无需强行打开重型属性侧边栏。
- _避免使用 (Avoid)_: Quick rename, inline hack, local input, label patch

**Card Boundary Clamping (卡片边界与文本截断)**:
卡片标题与副标题在水平空间受限时保持单行弹性截断与省略号（`...`），结合浏览器悬停全文提示，保障卡头高度绝对稳定，防止标题换行挤压卡片内部核心监控图表。
- _避免使用 (Avoid)_: Title wrap, multiline header, header overflow, card stretching

**Smart Flip Popover (智能翻转浮层)**:
交互浮层（如就地换船下拉面板）依据其在画布上的垂直绝对坐标（如 Y > 600px）自动判定并切换向下展开或向上翻转的自适应机制，彻底杜绝浮层超出大屏视口底边被物理裁切。
- _避免使用 (Avoid)_: Auto dropdown, smart menu, adaptive modal, position flip

**Emblem Isolation Layer (背景装饰隔离层)**:
卡片内部将大尺寸半透明背景矢量徽标限制在独立的底层视口内进行圆角裁剪，使卡片主容器维持可见溢出（`overflow: visible`），确保外置拖拽手柄、缩放把手与弹出式浮层不受容器边缘裁切。
- _避免使用 (Avoid)_: Icon clip hack, overflow patch, badge wrapper, card mask

**Slot Placeholder (槽位占位符 / 对象占位符)**:
组件模板设计中声明的抽象对象别名（如“本船”、“对比船”）。在组件工坊中仅作为数据挂载的抽象模具标识，不绑定任何具体实体，图例与标签以占位符名称呈现脱敏预览；投屏与运行时大屏才将具体船舶指派至该占位符。
- _避免使用 (Avoid)_: Concrete entity, fixed ship binding, hardcoded slot, target instance

**Dual-Axis Field Mapping (双轴字段映射 / 自由坐标轴)**:
图表控件中 X 轴与 Y 轴的显式解耦映射机制。X 轴支持选择时间序列维度（滑动回溯窗口）或实体属性字段，Y 轴映射业务度量指标字段，支持多曲线各自绑定不同的数据字段或对象占位符。
- _避免使用 (Avoid)_: Rigid timeline, locked-axis chart, fixed time series, single dimension plot

**Temporal Point Alignment Tolerance (时序点对对齐容差 / 航迹采样容差)**:
在自由双轴映射（如经度 vs 纬度生成空间航迹线）场景下，两个不同属性字段在物联网通信中可能存在毫秒级物理采样抖动或异步增量上报。系统以时间戳为统一物理动力学基准，在设定的最大时间容差窗口（默认 5 秒 / 5000ms）内寻找最接近采样点合成坐标点对 `(x, y)`；超出容差则视作采样断流如实断开，坚决不跨时间段强行错配。
- _避免使用 (Avoid)_: Point match tolerance, sync window, tick diff, time threshold

**Dual-Y-Axis Time Series (双 Y 轴时序图)**:
时序折线图控件支持为不同曲线独立指派左 Y 轴（Y1）与右 Y 轴（Y2）的解耦度量机制。左轴与右轴拥有各自独立的值域上下限自适应计算与单位刻度，解决高度与速度、经度与纬度等不同量纲或量级悬殊数据同屏对比时的波形压缩失真。
- _避免使用 (Avoid)_: 双折线混用轴, 强制单轴, 双刻度单轴

**Sub-Minute Adaptive Lookback (亚分钟与秒级自适应回溯窗口)**:
时序控件支持秒级短周期回溯跨度（如 10s~300s）与分钟级跨度自由切换，X 轴时间刻度依据总跨度自动切换为秒级（`HH:mm:ss`）自适应格式，满足导弹、发射试验等短周期高速运动目标的波形捕获。
- _避免使用 (Avoid)_: 粗粒度分钟轴, 固定时间跨度, 毫秒死板刻度

**Projectile Schema (飞行目标数据模式)**:
针对弹道、无人机、导弹等高空高速移动实体建立的标准数据模型，包含批号标识、高度（km / 千米）、速度（km/h / 千米每小时）、经纬度、航向与传感器数据来源标识等核心空间动力学度量字段。
- _避免使用 (Avoid)_: 船舶空战扩展, 假实体, 航空杂合模型

**Dual-dimension Target Retargeting (双维度目标重定向 / 目标与数据来源联动重定向)**:
在大屏显示态就地切换或组件工坊设计态进行槽位指派时，同时选择实体目标（如弹目标批号 P-101）与其物理数据来源（如雷达1、雷达2、遥测等传感器站）的双维度联合重定向操作。槽位指派同时作用于该槽位下属的所有关联控件。
- _避免使用 (Avoid)_: 单实体硬切, 来源与目标分离绑, 槽位暗箱过滤

**Table Column Color Rule Truth (表格列状态颜色规则真源)**:
表格单元格依据字段值进行的颜色标记（如航行状态、拦截状态等）必须 100% 由模板或实例上配置的 `tableColumnRules` 规则引擎定义与驱动；严禁在视图层代码中硬编码状态与颜色的映射分支，确保检查器属性面板配置与表格渲染呈现绝对统一。
- _避免使用 (Avoid)_: 视图硬编码类名, 暗箱预设配色, 面板脱节规则

**Range Value Color Rule (数值区间阈值颜色规则)**:
在指示灯与表格单元格中支持的轻量区间语法（如 `> 30`、`<= 10`、`10..20` 或枚举精确匹配），按规则顺序自上而下匹配并赋予对应的告警与状态颜色，缺省或不匹配维持中性或未识别态。
- _避免使用 (Avoid)_: 死板文本硬匹配, 复杂脚本规则, 纯数值比较器

**Cell Sparkline Popover (单元格趋势微图浮层)**:
在实体表格的数值型单元格中，点击或悬停触发的原地轻量时序走势浮层，直接提取该实体当前字段的历史时间窗口数据渲染迷你折线，无需跳出页面或破坏画布既有布局。
- _避免使用 (Avoid)_: 巨型弹出大图, 页面跳转, 槽位强制劫持

**Message Stream Control (滚动消息流控件 / 报文日志流)**:
大屏中专用于按时间顺序实时追加并平滑向上滚动的原子可视化控件，接收系统告警、业务事件或数据报文推流，支持时间戳、消息级别染色及最大行数自动滑出。
- _避免使用 (Avoid)_: 假单行文字框, 强制表格翻页, 弹窗日志

