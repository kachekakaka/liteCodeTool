# LiteCodeTool 0.2.0：方案与实现差距对照

核对日期：2026-09-06。对象为已经交付的0.2.0压缩包，不代表GitHub此刻的最新状态。本次为只读对照，未修改应用源码或仓库。

## 对照依据与结论

主要依据用户最初提供的《轻量化低代码大屏平台实施方案》，同时标明包内V2.2新增、调整的范围。代码依据为包内 `source/liteCodeTool/`；核验边界依据为《实施与本地核验记录》。不能仅用后续修订文档中的“已实现”描述代替原始需求验收。

结论：组件制作—实例编排—显示态换船—保存回读的主链路已经实现，但通用图表数据源覆盖存在限制，表格的数据过期提示尚未覆盖；标准工程构建、原生目标环境与真实数据/负载验收未闭环。不是只有真实AIS接入一项未完成，也不能在没有统一验收权重的情况下给出完成百分比。

## 一、原始用户故事逐项对照

| 原始条目 | 状态 | 已有实现与边界 |
| --- | --- | --- |
| 一-1：原子控件组合为复合卡片 | 基础实现 | 组件工坊可添加、选择、拖动、缩放控件并保存模板。七类控件包含后续增加的图片控件。 |
| 一-2：抽象对象槽位与字段绑定 | 基础实现 | 模板声明多个槽位，大屏实例保存具体实体；私有字段覆盖与模板隔离。 |
| 一-3：直接绑定全局非实体模式 | 部分覆盖 | 单值类控件支持全局字段；曲线只从对象槽位取得序列，不能直接以全港统计字段生成时序；表格只面向实体类型。 |
| 一-4：表格与曲线的多对象/动态对象集 | 受限实现，需要明确完整覆盖口径 | 曲线支持手工指定槽位的多对象；表格支持动态实体集合和单个字段等值过滤。两类控件不能分别自由选择“槽位集合/条件集合”。原文用“或”，没有规定复杂条件语言；不能把AND/OR、SQL式查询等擅自当作已承诺功能。 |
| 二-5：组件拖拽、大小、层级、位置 | 基础实现 | 模板可拖入画布，实例可移动、调整尺寸、层级和相对于画布的对齐；不是多选成组的完整专业设计器。后者并未被原始方案明确要求。 |
| 二-6：预设实例对象 | 基础实现 | 属性面板可选择对象并随大屏保存。 |
| 二-7：实例控件更换字段 | 基础实现 | 单个控件有独立覆盖，字段元数据用于标签/单位/精度。 |
| 三-8：显示态全屏与布局锁定 | 已实现，目标环境待验收 | 显示态隐藏编辑工具、锁定排版并提供全屏入口；浏览器直接访问/硬件验收仍需补齐。 |
| 三-9：卡片角落输入即搜换船 | 交互替代 | 卡片局部面板是下拉选船；输入检索需打开监控对象抽屉。搜索换船功能存在，但不是原稿所写的就地输入即搜。后续V2.2允许局部入口加全局抽屉，应明确是否接受替代交互。 |
| 三-10：运行态保存默认、无需重启 | 本地实现并有核验记录 | JSON实际写入、版本冲突保护、重启回读；失败时不清除未保存状态。 |
| 三-11：底账/空值保护 | 核心已实现，质量提示仍需统一 | 0/null/缺字段和快照竞争已有逻辑；表格尚未逐行逐字段标记过期，与V2.2的数据质量约定未完全一致。 |

## 二、应补齐或明确验收边界的功能

### F1：全局统计曲线的数据绑定

`Binding`支持global，但`Series`仅有slotId、field、color。`LineChart.vue`从template.slots和instance.slotBindings寻找实体历史，未消费全局binding。属性检查器对曲线不显示单值控件的数据绑定选择器。

影响：能显示“在港船舶总数”的数值卡，但不能直接在界面把该全局字段设成时间曲线。这是图表数据源能力尚未覆盖，而非HTTP没有返回全局统计。

建议验收：同一份真实或演示port_stats增量同时驱动数值卡与全局统计曲线；无历史时留白；仅修改当前实例的曲线来源不污染模板。

### F2：表格/曲线的集合来源尚未通用

当前表格按schemaType扫描实体池，支持单个filterField与filterValue的严格等值筛选；曲线只使用手工配置的对象槽位序列。没有曲线按条件自动纳入新对象的实现，也没有表格直接选取指定对象槽位集合的数据来源模式。

现有“商船动态列表”和“三船对比曲线”这两个基础用例已经成立，不能描述成“完全没做动态集合”。更复杂的条件语言、排序编辑器和多图联动并不是原稿明确约定，不计作硬性缺项。

### F3：表格中的数据过期提示

单值控件通过resolveValue计算字段更新时间和过期状态；表格单元格直接读取record.data进行格式化，状态颜色也只按业务字符串决定。内置表格可以显示上报时间这一列，但没有按行或字段自动显示“已过期”；WebSocket连接也可能仍保持正常。

因此某艘船停止更新时，表格仍可能以绿色展示其最后上报的“在航”，缺少清晰的数据陈旧提示。应按记录/字段源时间标注过期，并避免把旧业务状态表现成刚更新的状态。此项依据V2.2“过期与业务状态分别呈现”的约定，不是要求后端伪造离线业务状态。

本次轻量逻辑复核：向EntityStore放入300秒前的船舶记录，数值卡resolveValue返回stale=true；表格外层返回stale=false。结合表格模板未调用逐格质量解析，确认不是单纯漏测。没有修改程序。

### F4：就地输入检索与原稿交互的差异

`InstanceCard.vue`局部面板为select；“搜索更多对象”打开`ObjectDrawer.vue`。抽屉具备船名/MMSI检索、槽位选择、即时换船和默认保存，核心调度功能存在。

严格按原稿“三-9”的卡片角落输入即搜验收，还要在局部面板补搜索；按修订版认可全局检索作为替代，则此项可作为已接受差异，不应重复开发。两种口径应明确，而不是悄悄互换。

## 三、工程与现场验收未闭环

| 项目 | 尚缺什么 | 注意 |
| --- | --- | --- |
| 常规工程构建 | npm依赖安装与锁文件、完整vue-tsc、Vite构建 | 当前npm run build是离线构建；常规路径是npm run build:vite。离线构建已经有通过记录，不能说完全未构建。 |
| 用户电脑完整启动链路 | Windows原生cmd启动、浏览器直接本机HTTP/WS、刷新/保存/重启回读；目标为macOS时也需原生核验 | 既往是Linux与受限Chromium核验，使用临时桥；不等于用户电脑原生启动验收。 |
| 真实业务数据接入 | 现场数据源到标准JSON契约的适配、字段和单位核对、断线重连与新船联调 | 平台HTTP/WS接口已实现。原始AIS/NMEA解码不是原稿明确要求；仅在现场上游提供原始报文时需要额外适配。 |
| 高频长时与显示设备 | 实际目标实体规模、推流频率、持续运行、CPU/内存/帧率、断流恢复；目标2K/4K机器投屏 | 现有检查没有给出承诺规模，也未完成长期高频负载测试；不能据几张卡片的演示保证海量实时性能。 |
| 项目回库与方案归档 | 把应用修订合回原仓库，保留原AGENTS/CONTEXT/ADR/唯一原型，并在完整验收后归档 | 0.2.0记录明确本轮没有向GitHub提交/推送。此处是发布记录事实，不是本次查询远程状态的结果。 |

## 四、已有而不应重复计为缺项的能力

组件工坊基础制作、多槽位、实例私有覆盖、静态/动态分离、单值全局绑定、拖动缩放、布局层级、字段单位精度联动、无头组件调度抽屉、缺字段占位、零值、逐字段快照时间比较、真实JSON保存与回读、模式隔离、配置导入导出，均能在包内找到实现；此前核验记录覆盖其中主要流程。本次未重跑上一轮全部检查，不能把旧记录计数说成本次完整验收。

## 五、不是本轮方案硬性缺项

地图/GIS/三维地球、账户权限/多租户/审批、MySQL/Oracle、重型UI/E2E测试体系均不应因缺失而认定未按首期方案完成。高级图种、复杂多条件筛选、多选分组和工坊撤销也未被原稿逐项明确约定，不作为本次硬缺项。

免Node.exe/安装器并非原始方案硬性条款；现有包需要Node22.16+，与“完全免环境安装包”不同，应在交付说明中保持清楚。刷新后恢复过去20分钟曲线历史也不是原稿的HTTP“最新快照”承诺，V2.2明确不提供跨会话历史；这不能作为默认遗漏的历史数据库功能。

## 六、与原方案有记录的工程替代

核心测试采用Node内置测试而非原稿Vitest；核心函数集中到engine/core.ts、runtime.ts，而非原稿逐个模块文件；七类控件统一渲染入口而非每类独立Vue文件。这些是结构/工具替代，不是对应业务功能不存在。标准Vite与完整类型检查未验收则仍是工程缺口。

## 七、建议收尾顺序

优先补全局曲线及集合来源覆盖、统一表格过期提示；确认是否补局部搜索。随后完成常规构建和用户电脑原生启动链路，再做真实数据与高频长时验收，最后合回原仓库并归档方案。无需为了“完整”重做已存在的制作/展示/保存主链路。

## 源码定位与证据摘录

下面的行号对应本次从0.2.0软件包原样解出的文件，未改源码。

### `src/types.ts` L7–L23

```text
7: export interface Binding { target: 'slot' | 'global'; slotId?: string; schemaType?: string; field: string }
8: export interface Series { slotId: string; field: string; color?: string }
9: export interface ControlProps {
10:   sourceMode?: 'static' | 'dynamic'; staticValue?: Scalar;
11:   label?: string; labelMode?: 'auto' | 'custom'; unit?: string; unitMode?: 'auto' | 'custom'; precision?: number | null;
12:   lookbackMinutes?: number; gapSeconds?: number; staleSeconds?: number;
13:   series?: Series[]; columns?: string[]; schemaType?: string;
14:   filterField?: string; filterValue?: Scalar; pageSize?: number;
15:   colorRules?: { value: Scalar; color: string }[];
16:   imageType?: 'radar' | 'sonar' | 'image'; imageUrl?: string; alt?: string;
17:   clock?: boolean;
18:   variant?: 'standard' | 'kpi'; iconType?: 'vessel' | 'cargo' | 'fishing' | 'alert'; autoPageSeconds?: number;
19: }
20: export interface Control { id: string; type: ControlType; style: Geometry & { fontSize?: number; color?: string }; props: ControlProps; binding?: Binding | null }
21: export interface Override { style?: Partial<Control['style']>; props?: Partial<ControlProps>; binding?: Binding | null }
22: export interface ComponentTemplate { id: string; name: string; category: string; layout: { width: number; height: number }; slots: Slot[]; controls: Control[]; showHeader?: boolean; decoration?: 'card' | 'banner' }
23: export interface ComponentInstance { instanceId: string; templateId: string; title?: string; position: Geometry & { zIndex?: number }; showHeader?: boolean; slotBindings: Record<string, string>; controlOverrides: Record<string, Override> }
```

### `src/components/LineChart.vue` L13–L18

```text
13:     const series = computed(() => (props.control.props.series ?? []).map((series, index) => {
14:       const slot = props.template.slots.find(s => s.id === series.slotId), id = props.instance.slotBindings[series.slotId];
15:       const field = state.schemas.find(s => s.type === slot?.schemaType)?.fields.find(f => f.key === series.field);
16:       const record = id ? state.store.get(slot?.schemaType, id) : undefined;
17:       return { ...series, id, label: String(record?.data.vessel_name ?? (id || slot?.label || '未绑定对象')), unit: field?.unit ?? '', fieldName: field?.name ?? series.field, color: series.color ?? ['#22D3EE', '#25D8AE', '#FFBF47'][index % 3], points: inWindow(record?.history[series.field] ?? [], state.now, minutes.value) };
18:     }));
```

### `src/components/ControlRenderer.vue` L12–L29

```text
12:     const c = computed(() => effectiveControl(props.control, props.instance));
13:     const value = computed(() => resolveValue(props.control, props.template, props.instance, state.store, state.schemas, state.now));
14:     const statusColor = computed(() => c.value.props.colorRules?.find(r => r.value === value.value.raw)?.color ?? '#7995B1');
15:     const tableSchema = computed(() => state.schemas.find(s => s.type === c.value.props.schemaType));
16:     const columns = computed(() => (c.value.props.columns ?? []).map(key => tableSchema.value?.fields.find(f => f.key === key)).filter((field): field is Field => !!field));
17:     const rows = computed(() => state.store.list(c.value.props.schemaType ?? '').filter(({ record }) => !c.value.props.filterField || record.data[c.value.props.filterField] === c.value.props.filterValue).sort((a, b) => a.id.localeCompare(b.id)));
18:     const page = ref(0), pageSize = computed(() => Math.max(1, Math.min(20, c.value.props.pageSize ?? 4)));
19:     const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)));
20:     watch(pageCount, count => { if (page.value >= count) page.value = count - 1; });
21:     const tableHover = ref(false); let pager: ReturnType<typeof setInterval> | undefined; let lastPage = Date.now();
22:     onMounted(()=>{if(c.value.type!=='table')return;pager=setInterval(()=>{const seconds=c.value.props.autoPageSeconds ?? 0;if(state.view==='viewer' && seconds>0 && !tableHover.value && pageCount.value>1 && !document.hidden && Date.now()-lastPage>=seconds*1000){page.value=(page.value+1)%pageCount.value;lastPage=Date.now();}},1000);});
23:     onUnmounted(()=>{if(pager)clearInterval(pager);});
24:     watch(tableHover,()=>{lastPage=Date.now();});
25:     const shown = computed(() => rows.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value));
26:     const image = computed(() => safeImageUrl(c.value.props.sourceMode === 'dynamic' ? String(value.value.raw ?? '') : c.value.props.imageUrl ?? ''));
27:     const imageFailed = ref(false); watch(image, () => { imageFailed.value = false; });
28:     const stamp = computed(() => value.value.timestamp === null ? '' : new Date(value.value.timestamp).toLocaleTimeString('zh-CN', { hour12: false }));
29:     const statusClass = (value: unknown) => value==='告警'?'cell-danger':value==='在航'||value==='巡航'?'cell-ok':value==='作业'?'cell-warning':'';
```

### `src/components/ControlRenderer.vue` L40–L44

```text
40:     <LineChart v-else-if="c.type==='line'" :control="c" :template="template" :instance="instance"/>
41:     <template v-else-if="c.type==='table'">
42:       <div class="table-scroll"><table><thead><tr><th v-for="column in columns" :key="column.key">{{ column.name }}<small v-if="column.unit"> / {{ column.unit }}</small></th></tr></thead><tbody><tr v-for="row in shown" :key="row.id"><td v-for="column in columns" :key="column.key" :class="column.key==='status'?statusClass(row.record.data[column.key]):''" :title="formatScalar(row.record.data[column.key], column.precision, column.type==='datetime')">{{ formatScalar(row.record.data[column.key], column.precision, column.type==='datetime') }}</td></tr></tbody></table><div v-if="!rows.length" class="table-empty">暂无符合条件的数据</div></div>
43:       <div class="table-pagination"><span>{{ rows.length }} 条记录 · {{ c.props.filterField ? '已应用条件过滤' : '动态对象集合' }}</span><div><button :disabled="page===0" aria-label="上一页" @click.stop="page--">‹</button><span>{{ page+1 }} / {{ pageCount }}</span><button :disabled="page>=pageCount-1" aria-label="下一页" @click.stop="page++">›</button></div></div>
44:     </template>
```

### `src/components/InstanceCard.vue` L37–L40

```text
37:       <ControlRenderer :control="control" :template="template" :instance="instance"/>
38:       <span v-if="workshop&&state.selectedControl===control.id" class="control-resize" @pointerdown.stop="pointerDown($event,control.id,true)"></span>
39:     </div>
40:     <template v-if="!viewing&&!workshop"><button class="card-grip" aria-label="拖动组件实例" title="拖动组件实例" @pointerdown.stop="pointerDown($event)">⠿</button><span v-if="isSelected" class="card-resize" @pointerdown.stop="pointerDown($event,'',true)"></span></template>
```

### `src/components/ObjectDrawer.vue` L6–L14

```text
6:     const input = ref<HTMLInputElement | null>(null), dialog = ref<HTMLElement | null>(null);
7:     const target = ref({ instanceId: '', slotId: '', schemaType: '' }); let previousFocus: HTMLElement | null = null;
8:     const groups = computed(() => (state.screen?.components ?? []).map(instance => ({ instance, template: state.templates.find(t => t.id === instance.templateId) })).filter(group => !!group.template?.slots.length && (!state.drawerInstance || group.instance.instanceId === state.drawerInstance)));
9:     const candidates = computed(() => state.store.list(target.value.schemaType).filter(({ id, record }) => `${id} ${record.data.vessel_name ?? ''}`.toLocaleLowerCase().includes(state.search.trim().toLocaleLowerCase())));
10:     const current = computed(() => state.screen?.components.find(i => i.instanceId === target.value.instanceId)?.slotBindings[target.value.slotId]);
11:     function name(type: string, id?: string): string { return id ? String(state.store.get(type, id)?.data.vessel_name ?? id) : '未绑定对象'; }
12:     watch(() => state.drawer, async open => {
13:       if (open) { previousFocus = document.activeElement as HTMLElement; const group = groups.value[0], slot = group?.template?.slots[0]; target.value = { instanceId: group?.instance.instanceId ?? '', slotId: slot?.id ?? '', schemaType: slot?.schemaType ?? '' }; await nextTick(); input.value?.focus(); }
14:       else previousFocus?.focus();
```

### `src/engine/core.ts` L68–L84

```text
68: export function resolveValue(control: Control, template: ComponentTemplate, instance: ComponentInstance, store: EntityStore, schemas: Schema[], now: number): ResolvedValue {
69:   const c = effectiveControl(control, instance);
70:   const dynamic = c.props.sourceMode === 'dynamic' || (!c.props.sourceMode && !!c.binding);
71:   if (!dynamic) {
72:     const raw = c.props.clock ? now : c.props.staticValue;
73:     return { raw, value: formatScalar(raw, c.props.precision, c.type === 'time'), label: c.props.label ?? '', unit: c.props.unit ?? '', timestamp: null, empty: empty(raw), stale: false };
74:   }
75:   const type = sourceType(c.binding, template);
76:   const field = schemas.find(s => s.type === type)?.fields.find(f => f.key === c.binding?.field);
77:   const id = c.binding?.target === 'global' ? '_global' : instance.slotBindings[c.binding?.slotId ?? ''];
78:   const record = id ? store.get(type, id) : undefined;
79:   const raw = record?.data[c.binding?.field ?? ''];
80:   const timestamp = record?.timestamps[c.binding?.field ?? ''] ?? null;
81:   const label = c.props.labelMode === 'custom' ? (c.props.label ?? '') : (field?.name ?? c.props.label ?? '未绑定字段');
82:   const unit = c.props.unitMode === 'custom' ? (c.props.unit ?? '') : (field?.unit ?? '');
83:   return { raw, value: formatScalar(raw, c.props.precision ?? field?.precision, c.type === 'time' || field?.type === 'datetime'), label, unit, timestamp, empty: empty(raw), stale: timestamp !== null && now - timestamp > (c.props.staleSeconds ?? 120) * 1000 };
84: }
```

### `src/engine/core.ts` L124–L135

```text
124:     if (c.props.colorRules !== undefined && (!Array.isArray(c.props.colorRules) || c.props.colorRules.length > 30 || c.props.colorRules.some(r => !r || !/^#[0-9a-fA-F]{6}$/.test(r.color)))) throw new Error('指示灯颜色规则无效');
125:     if (c.props.pageSize !== undefined && (!Number.isInteger(c.props.pageSize) || c.props.pageSize < 1 || c.props.pageSize > 20)) throw new Error('每页行数应为 1~20 的整数');
126:     if (c.props.series !== undefined && (!Array.isArray(c.props.series) || c.props.series.length > 8)) throw new Error('单个图表最多配置 8 条曲线');
127:     if (c.type === 'table') {
128:       const schema = schemas.find(s => s.type === c.props.schemaType && s.isEntity);
129:       if (!schema || !Array.isArray(c.props.columns) || c.props.columns.some(key => !schema.fields.some(f => f.key === key)) || (c.props.filterField && !schema.fields.some(f => f.key === c.props.filterField))) throw new Error('表格的数据模式、列或过滤字段无效');
130:     }
131:     if (c.props.lookbackMinutes !== undefined && (!finite(c.props.lookbackMinutes) || c.props.lookbackMinutes < 1 || c.props.lookbackMinutes > 60)) throw new Error('曲线时间窗口应为 1~60 分钟');
132:     for (const s of c.props.series ?? []) {
133:       const slot = template.slots.find(x => x.id === s.slotId);
134:       if (!schemas.find(x => x.type === slot?.schemaType)?.fields.some(f => f.key === s.field && f.type === 'number')) throw new Error('曲线只能绑定对象槽位的数值字段');
135:     }
```

### `src/App.vue` L54–L62

```text
54:     function keyboard(event: KeyboardEvent) {
55:       if (state.help) {if(event.key==='Escape')state.help=false;return;}
56:       if (state.drawer) return;
57:       if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); (event.target as HTMLElement)?.blur?.(); void nextTick().then(()=>state.view === 'workshop' ? runtime.saveTemplate() : runtime.saveScreen()); return; }
58:       if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return;
59:       if (event.key === 'Escape') { if (state.view === 'viewer') runtime.setView('editor'); else runtime.clearSelection(); }
60:       if (state.view === 'editor' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? runtime.redo() : runtime.undo(); }
61:       if (event.key === 'Delete' && state.view === 'workshop') removeControl();
62:       if (event.key === 'Delete' && state.view === 'editor' && !state.selectedControl) runtime.removeInstance();
```

### `package.json` L9–L22

```text
9:   "scripts": {
10:     "dev": "node --experimental-strip-types server/dev.mjs",
11:     "demo": "node ../liteCodeTool_tmp/release/app/server/index.mjs --demo",
12:     "server": "node --experimental-strip-types server/index.mjs",
13:     "server:demo": "node --experimental-strip-types server/index.mjs --demo",
14:     "build": "node tools/build.mjs",
15:     "start": "node ../liteCodeTool_tmp/release/app/server/index.mjs",
16:     "test": "node --experimental-strip-types --test tests/core.test.ts",
17:     "build:vite": "vue-tsc --noEmit && vite build",
18:     "preview": "node ../liteCodeTool_tmp/release/app/server/index.mjs --demo",
19:     "dev:demo": "node --experimental-strip-types server/dev.mjs --demo"
20:   },
21:   "dependencies": {
22:     "vue": "^3.5.13",
```

## 核对包指纹

文件：`LiteCodeTool_v0.2.0_可运行软件包_含源码.zip`

SHA-256：`07e69773adaa9c35383625611e9070a55fad73d21abb0276138cbb0965d782f4`
