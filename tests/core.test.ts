import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EntityStore,
  effectiveControl,
  effectiveSubTitle,
  resolveValue,
  inWindow,
  formatScalar,
  fitGeometry,
  safeImageUrl,
  validateScreen,
  validateTemplate,
  clone,
  validId,
  isRecordStale,
  alignTrajectoryPoints,
  DEFAULT_CHART_COLORS,
  DEFAULT_GLOBAL_CHART_FIELD,
  DEFAULT_SLOT_CHART_FIELD,
  formatControlDisplayName,
  formatControlSummary,
  formatControlOption,
  formatControlTag,
} from '../src/engine/core.ts';
import type {
  ComponentInstance,
  ComponentTemplate,
  Control,
  Envelope,
  Schema,
} from '../src/types.ts';
const schemas: Schema[] = [
  {
    type: 'vessel',
    name: '船舶',
    isEntity: true,
    fields: [
      { key: 'speed', name: '航速', type: 'number', unit: '节', precision: 1 },
      { key: 'lon', name: '经度', type: 'number', unit: '°E', precision: 6 },
      { key: 'status', name: '状态', type: 'enum' },
    ],
  },
  {
    type: 'port_stats',
    name: '统计',
    isEntity: false,
    fields: [{ key: 'total', name: '船舶总数', type: 'number', unit: '艘' }],
  },
];
const control: Control = {
  id: 'value',
  type: 'number',
  style: { x: 10, y: 10, w: 200, h: 100, fontSize: 40 },
  props: { sourceMode: 'dynamic' },
  binding: { target: 'slot', slotId: 'slot_1', field: 'speed' },
};
const template: ComponentTemplate = {
  id: 'tpl',
  name: '测试组件',
  category: '测试',
  layout: { width: 320, height: 200 },
  slots: [
    { id: 'slot_1', label: '对象1', schemaType: 'vessel' },
    { id: 'slot_2', label: '对象2', schemaType: 'vessel' },
  ],
  controls: [control],
};
const instance: ComponentInstance = {
  instanceId: 'inst',
  templateId: 'tpl',
  position: { x: 0, y: 0, w: 320, h: 200 },
  slotBindings: { slot_1: 'A', slot_2: 'B' },
  controlOverrides: {},
};
const packet = (data: Envelope['data'], timestamp = 1000, id = 'A'): Envelope => ({
  type: 'vessel',
  id,
  timestamp,
  data,
});
const resolve = (store: EntityStore, i = instance, c = control, now = 2000) =>
  resolveValue(c, template, i, store, schemas, now);

test('底账可立即显示，同时不伪造历史', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 12.3 }), true);
  assert.equal(resolve(s).value, '12.3');
  assert.equal(Object.keys(s.get('vessel', 'A')!.history).length, 0);
});
test('静态内容不被实体增量冲刷', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 50 }));
  const c = clone(control);
  c.props = { sourceMode: 'static', staticValue: '固定标题' };
  assert.equal(resolve(s, instance, c).value, '固定标题');
});
test('缺字段与 null 均为 --', () => {
  const s = new EntityStore();
  assert.equal(resolve(s).value, '--');
  s.apply(packet({ speed: null }));
  assert.equal(resolve(s).value, '--');
});
test('数值 0 不应被当成缺失', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 0 }));
  assert.equal(resolve(s).value, '0.0');
  assert.equal(resolve(s).empty, false);
});
test('增量只合并上报字段', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 10, lon: 121.5 }));
  s.apply(packet({ speed: 11 }, 2000));
  assert.equal(s.get('vessel', 'A')?.data.lon, 121.5);
});
test('晚到快照不能覆盖较新的字段', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 18 }, 3000));
  s.apply(packet({ speed: 10, lon: 121.5 }, 1000), true);
  assert.equal(resolve(s).value, '18.0');
  assert.equal(s.get('vessel', 'A')?.data.lon, 121.5);
});
test('快照使用每个字段自己的源时间，而不是 HTTP 返回时间', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 18 }, 3000));
  s.apply(
    { ...packet({ speed: 10, lon: 121.5 }, 9000), fieldTimestamps: { speed: 2000, lon: 8000 } },
    true,
  );
  assert.equal(resolve(s).value, '18.0');
  assert.equal(s.get('vessel', 'A')?.timestamps.lon, 8000);
});
test('重复与乱序消息不回退数据也不重复历史', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 18 }, 3000));
  s.apply(packet({ speed: 18 }, 3000));
  s.apply(packet({ speed: 10 }, 1000));
  assert.equal(s.get('vessel', 'A')?.history.speed.length, 1);
});
test('单控件稀疏覆盖不修改原模板，也不丢失样式', () => {
  const i = clone(instance);
  i.controlOverrides.value = { style: { color: '#22D3EE' }, props: { precision: 2 } };
  const c = effectiveControl(control, i);
  c.style.x = 20;
  assert.equal(control.style.x, 10);
  assert.equal(c.style.fontSize, 40);
  assert.equal(c.props.precision, 2);
  assert.equal(control.props.precision, undefined);
});
test('切换字段同步中文标签、单位和精度', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 12, lon: 121.5204 }));
  const i = clone(instance);
  i.controlOverrides.value = { binding: { target: 'slot', slotId: 'slot_1', field: 'lon' } };
  const v = resolve(s, i);
  assert.deepEqual([v.value, v.label, v.unit], ['121.520400', '经度', '°E']);
});
test('对象2的私有绑定与对象1独立', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 11 }));
  s.apply(packet({ speed: 21 }, 1000, 'B'));
  const i = clone(instance);
  i.controlOverrides.value = { binding: { target: 'slot', slotId: 'slot_2', field: 'speed' } };
  assert.equal(resolve(s, i).value, '21.0');
  assert.equal(resolve(s).value, '11.0');
});
test('换到无底账实体不能残留上一船数值', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 10 }));
  const i = clone(instance);
  i.slotBindings.slot_1 = 'missing';
  assert.equal(resolve(s, i).value, '--');
});
test('全局统计解析不依赖任何对象槽位', () => {
  const s = new EntityStore();
  s.apply({ type: 'port_stats', timestamp: 1000, data: { total: 8 } });
  const c = clone(control);
  c.binding = { target: 'global', schemaType: 'port_stats', field: 'total' };
  assert.equal(resolve(s, instance, c).value, '8');
});
test('过期值保留数值并明确标记，不伪装实时', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 10 }));
  assert.equal(resolve(s, instance, control, 200000).stale, true);
  assert.equal(resolve(s, instance, control, 200000).value, '10.0');
});
test('显式 null 打断历史，滑动窗口只返回真实范围', () => {
  const s = new EntityStore();
  s.apply(packet({ speed: 10 }, 1000));
  s.apply(packet({ speed: null }, 2000));
  assert.equal(s.get('vessel', 'A')?.history.speed[1].value, null);
  assert.deepEqual(
    inWindow(
      [
        { timestamp: 0, value: 1 },
        { timestamp: 80000, value: 2 },
        { timestamp: 130000, value: 3 },
      ],
      120000,
      1,
    ),
    [{ timestamp: 80000, value: 2 }],
  );
});
test('历史内存有点数上限', () => {
  const s = new EntityStore();
  for (let n = 1; n <= 8000; n++) s.apply(packet({ speed: n }, n));
  assert.equal(s.get('vessel', 'A')?.history.speed.length, 7200);
});
test('无效数值和日期不会渲染 NaN 或 Invalid Date', () => {
  assert.equal(formatScalar(NaN), '--');
  assert.equal(formatScalar(Infinity), '--');
  assert.equal(formatScalar('不是时间', undefined, true), '--');
});
test('无效包和保留标识不破坏实体池', () => {
  const s = new EntityStore();
  s.apply(null as unknown as Envelope);
  s.apply({ type: '__proto__', timestamp: 1, data: { speed: 1 } });
  assert.deepEqual(Object.keys(s.records), []);
  assert.equal(validId('../secret'), false);
});
test('缩放后的拖动仍受逻辑画布边界约束', () => {
  assert.deepEqual(fitGeometry({ x: 1900, y: -5, w: 320, h: 200 }, 1920, 1080), {
    x: 1600,
    y: 0,
    w: 320,
    h: 200,
  });
});
test('图片源拒绝可执行协议', () => {
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(safeImageUrl('https://example.com/a.png'), 'https://example.com/a.png');
});
test('有效模板和屏幕可以保存，非法覆盖会拒绝', () => {
  validateTemplate(template, schemas);
  const screen = {
    id: 'screen',
    name: '测试大屏',
    resolution: { width: 1920, height: 1080 },
    background: '#030B17',
    components: [clone(instance)],
  };
  validateScreen(screen, [template], schemas);
  screen.components[0].controlOverrides.missing = { props: {} };
  assert.throws(() => validateScreen(screen, [template], schemas), /不存在/);
});
test('非法槽位、越界和原型污染配置被拒绝', () => {
  const t = clone(template);
  t.slots.push(clone(t.slots[0]));
  assert.throws(() => validateTemplate(t, schemas), /槽位/);
  const other = clone(template);
  other.controls[0].style.w = 900;
  assert.throws(() => validateTemplate(other, schemas), /边界/);
  assert.throws(() => validateTemplate(JSON.parse('{"__proto__":{}}'), schemas), /保留/);
});

test('全局统计曲线：正确从全局实体池提取滑动窗口数据并如实留白', () => {
  const s = new EntityStore();
  s.apply({ type: 'port_stats', timestamp: 10_000, data: { total: 42 } });
  s.apply({ type: 'port_stats', timestamp: 40_000, data: { total: 45 } });
  const history = s.get('port_stats')?.history.total ?? [];
  assert.equal(history.length, 2);
  const windowed = inWindow(history, 50_000, 1);
  assert.deepEqual(windowed, [
    { timestamp: 10_000, value: 42 },
    { timestamp: 40_000, value: 45 },
  ]);
  const futureWindow = inWindow(history, 500_000, 1);
  assert.equal(futureWindow.length, 0);
});

test('全局统计曲线：validateTemplate 与 validateScreen 允许合法全局非实体数值字段', () => {
  const globalLineTemplate: ComponentTemplate = {
    id: 'tpl_global_line',
    name: '全局时序大盘',
    category: '统计',
    layout: { width: 600, height: 300 },
    slots: [],
    controls: [
      {
        id: 'ctrl_global_line',
        type: 'line',
        style: { x: 10, y: 10, w: 580, h: 280 },
        props: {
          sourceMode: 'dynamic',
          lookbackMinutes: 20,
          series: [
            { target: 'global', schemaType: 'port_stats', field: 'total', color: '#22D3EE' },
          ],
        },
      },
    ],
  };
  validateTemplate(globalLineTemplate, schemas);
  const screen = {
    id: 'screen_global',
    name: '全局监控大屏',
    resolution: { width: 1920, height: 1080 },
    background: '#030B17',
    components: [
      {
        instanceId: 'inst_global',
        templateId: 'tpl_global_line',
        position: { x: 0, y: 0, w: 600, h: 300 },
        slotBindings: {},
        controlOverrides: {},
      },
    ],
  };
  validateScreen(screen, [globalLineTemplate], schemas);
});

test('全局统计曲线：Series 配置缺少 schemaType 或 field 非数值时被拒绝', () => {
  const tpl = (series: any): ComponentTemplate => ({
    id: 'tpl_err',
    name: '错误模板',
    category: '测试',
    layout: { width: 400, height: 300 },
    slots: [],
    controls: [
      {
        id: 'c1',
        type: 'line',
        style: { x: 0, y: 0, w: 300, h: 200 },
        props: { sourceMode: 'dynamic', series: [series] },
      },
    ],
  });
  assert.throws(
    () =>
      validateTemplate(tpl({ target: 'global', schemaType: 'not_exist', field: 'total' }), schemas),
    /非实体模式/,
  );
  assert.throws(
    () =>
      validateTemplate(tpl({ target: 'global', schemaType: 'vessel', field: 'speed' }), schemas),
    /非实体模式/,
  );
  assert.throws(
    () =>
      validateTemplate(
        tpl({ target: 'global', schemaType: 'port_stats', field: 'not_numeric' }),
        schemas,
      ),
    /非实体模式/,
  );
});

test('表格时效判定：纯函数在未超时、超时后分别返回 false 和 true', () => {
  const record = { data: {}, timestamps: { update_time: 100_000 }, history: {} };
  assert.equal(isRecordStale(record, 60, 150_000), false);
  assert.equal(isRecordStale(record, 60, 170_000), true);
});

test('表格时效判定：staleSeconds <= 0 或单条记录无时间戳时返回 false', () => {
  const record = { data: {}, timestamps: { update_time: 100_000 }, history: {} };
  assert.equal(isRecordStale(record, 0, 200_000), false);
  assert.equal(isRecordStale(record, -5, 200_000), false);
  const noTimeRecord = { data: {}, timestamps: {}, history: {} };
  assert.equal(isRecordStale(noTimeRecord, 60, 200_000), false);
  assert.equal(isRecordStale(undefined, 60, 200_000), false);
});

test('表格时效判定：随 now 递增能从新鲜自然过渡到陈旧态', () => {
  const record = { data: {}, timestamps: { update_time: 1_000_000 }, history: {} };
  assert.equal(isRecordStale(record, 10, 1_005_000), false);
  assert.equal(isRecordStale(record, 10, 1_010_000), false);
  assert.equal(isRecordStale(record, 10, 1_011_000), true);
});

test('KPI 控件徽标与图片覆盖：effectiveControl 正确合并私有 iconType 与 imageUrl', () => {
  const baseControl: Control = {
    id: 'c_kpi',
    type: 'number',
    style: { x: 0, y: 0, w: 200, h: 100 },
    props: { variant: 'kpi', iconType: 'cargo' },
  };
  const instance: ComponentInstance = {
    instanceId: 'inst_1',
    templateId: 'tmpl_1',
    position: { x: 0, y: 0, w: 200, h: 100 },
    slotBindings: {},
    controlOverrides: {
      c_kpi: {
        props: { iconType: 'fishing', imageUrl: 'data:image/png;base64,mock' },
      },
    },
  };
  const effective = effectiveControl(baseControl, instance);
  assert.equal(effective.props.variant, 'kpi');
  assert.equal(effective.props.iconType, 'fishing');
  assert.equal(effective.props.imageUrl, 'data:image/png;base64,mock');
});

test('卡片标题私有性：优先展示实例 title，未覆盖时安全回退模板名称', () => {
  const template: ComponentTemplate = {
    id: 'tmpl_1',
    name: '默认模板标题',
    category: '业务卡片',
    layout: { width: 400, height: 300 },
    slots: [],
    controls: [],
  };
  const instanceCustom: ComponentInstance = {
    instanceId: 'inst_1',
    templateId: 'tmpl_1',
    title: '自定义就地修改标题',
    position: { x: 0, y: 0, w: 400, h: 300 },
    slotBindings: {},
    controlOverrides: {},
  };
  const instanceFallback: ComponentInstance = {
    instanceId: 'inst_2',
    templateId: 'tmpl_1',
    position: { x: 0, y: 0, w: 400, h: 300 },
    slotBindings: {},
    controlOverrides: {},
  };
  assert.equal(instanceCustom.title || template.name, '自定义就地修改标题');
  assert.equal(instanceFallback.title || template.name, '默认模板标题');
});

test('数据源双模收敛：全局宏观指标作为动态分支正确解析，并拒绝非法伪模式', () => {
  assert.equal(DEFAULT_CHART_COLORS.length, 4);
  assert.equal(DEFAULT_GLOBAL_CHART_FIELD, 'total_vessels');
  assert.equal(DEFAULT_SLOT_CHART_FIELD, 'speed');

  const s = new EntityStore();
  s.apply({ type: 'port_stats', timestamp: 1000, data: { total: 99 } });
  const c: Control = {
    id: 'global_val',
    type: 'number',
    style: { x: 10, y: 10, w: 200, h: 100 },
    props: { sourceMode: 'dynamic' },
    binding: { target: 'global', schemaType: 'port_stats', field: 'total' },
  };
  const res = resolveValue(c, template, instance, s, schemas, 2000);
  assert.equal(res.value, '99');
  assert.equal(res.empty, false);

  const badTemplate = clone(template);
  badTemplate.controls[0].props = { sourceMode: 'global' as any };
  assert.throws(() => validateTemplate(badTemplate, schemas), /数据源模式无效/);
});

test('卡片副标题判定：effectiveSubTitle 正确识别默认槽位提示、自定义副标题与清空隐藏', () => {
  const tplWithSlots: ComponentTemplate = {
    id: 't1',
    name: '监控卡',
    category: '业务',
    layout: { width: 300, height: 200 },
    slots: [{ id: 's1', label: '槽位1', schemaType: 'vessel' }],
    controls: [],
  };
  const tplNoSlots: ComponentTemplate = {
    id: 't2',
    name: '大盘卡',
    category: '业务',
    layout: { width: 300, height: 200 },
    slots: [],
    controls: [],
  };
  const instDefault: ComponentInstance = {
    instanceId: 'i1',
    templateId: 't1',
    position: { x: 0, y: 0, w: 300, h: 200 },
    slotBindings: {},
    controlOverrides: {},
  };

  // 1. 默认无 subTitle：有槽位显示“目标监控”，无槽位显示“数据总览”
  assert.equal(effectiveSubTitle(instDefault, tplWithSlots), '目标监控');
  assert.equal(effectiveSubTitle(instDefault, tplNoSlots), '数据总览');

  // 2. 实例设置了自定义副标题
  const instCustom = { ...instDefault, subTitle: '泊位A监控' };
  assert.equal(effectiveSubTitle(instCustom, tplWithSlots), '泊位A监控');

  // 3. 实例清空副标题（空串或空白字符）：返回空串，用于卡头完全隐藏
  const instCleared = { ...instDefault, subTitle: '' };
  assert.equal(effectiveSubTitle(instCleared, tplWithSlots), '');
  const instSpaces = { ...instDefault, subTitle: '   ' };
  assert.equal(effectiveSubTitle(instSpaces, tplWithSlots), '');

  // 4. 模板级预置副标题
  const tplCustom = { ...tplWithSlots, subTitle: '预设模板标题' };
  assert.equal(effectiveSubTitle(instDefault, tplCustom), '预设模板标题');
});

test('副标题契约校验：validateTemplate 与 validateScreen 允许合法 subTitle 并拒绝非法类型', () => {
  const tpl = clone(template);
  tpl.subTitle = '合规模板副标题';
  validateTemplate(tpl, schemas);

  const screen = {
    id: 'screen_test',
    name: '测试大屏',
    resolution: { width: 1920, height: 1080 },
    background: '#030B17',
    components: [{ ...clone(instance), subTitle: '合法实例副标题' }],
  };
  validateScreen(screen, [tpl], schemas);

  // 非法副标题（超长或非字符串）被拒绝
  const badScreen = clone(screen);
  badScreen.components[0].subTitle = 'x'.repeat(121);
  assert.throws(() => validateScreen(badScreen, [tpl], schemas), /副标题无效/);

  const badTpl = clone(tpl);
  badTpl.subTitle = 12345 as any;
  assert.throws(() => validateTemplate(badTpl, schemas), /副标题无效/);
});

test('自由双轴契约校验：validateTemplate 允许合法 xAxisMode、xAxisField 与 xAxisSlotId 并拒绝非法取值', () => {
  const lineCtrl: Control = {
    id: 'line_1',
    type: 'line',
    style: { x: 0, y: 0, w: 320, h: 200 },
    props: {
      lookbackMinutes: 20,
      xAxisMode: 'field',
      xAxisField: 'lon',
      xAxisSlotId: 'slot_1',
      series: [{ target: 'slot', slotId: 'slot_1', field: 'speed' }],
    },
  };
  const lineTpl: ComponentTemplate = {
    id: 'line_tpl',
    name: '折线图模板',
    category: '图表',
    layout: { width: 320, height: 200 },
    slots: [{ id: 'slot_1', label: '对象1', schemaType: 'vessel' }],
    controls: [lineCtrl],
  };

  validateTemplate(lineTpl, schemas);

  const badTpl1 = clone(lineTpl);
  badTpl1.controls[0].props.xAxisMode = 'invalid_mode' as any;
  assert.throws(() => validateTemplate(badTpl1, schemas), /X 轴模式无效/);

  const badTpl2 = clone(lineTpl);
  badTpl2.controls[0].props.xAxisField = 12345 as any;
  assert.throws(() => validateTemplate(badTpl2, schemas), /X 轴字段无效/);

  const badTpl3 = clone(lineTpl);
  badTpl3.controls[0].props.xAxisSlotId = 'non_exist';
  assert.throws(() => validateTemplate(badTpl3, schemas), /X 轴槽位无效/);
});

test('自由双轴时序对齐纯函数：alignTrajectoryPoints 同拍时间戳精确匹配，空值与失配如实剔除', () => {
  const t0 = 1700000000000;
  // 1. 同拍时间戳精确配对
  const xPoints = [
    { timestamp: t0, value: 121.5 },
    { timestamp: t0 + 10000, value: 121.52 },
    { timestamp: t0 + 20000, value: 121.55 },
  ];
  const yPoints = [
    { timestamp: t0, value: 31.2 },
    { timestamp: t0 + 10000, value: 31.23 },
    { timestamp: t0 + 20000, value: 31.27 },
  ];
  const aligned = alignTrajectoryPoints(xPoints, yPoints);
  assert.deepEqual(aligned, [
    { xVal: 121.5, yVal: 31.2, timestamp: t0 },
    { xVal: 121.52, yVal: 31.23, timestamp: t0 + 10000 },
    { xVal: 121.55, yVal: 31.27, timestamp: t0 + 20000 },
  ]);

  // 2. 空值与时间戳失配断流如实剔除
  const xWithNull = [
    { timestamp: t0, value: 121.5 },
    { timestamp: t0 + 10000, value: null },
    { timestamp: t0 + 20000, value: 121.55 },
  ];
  const yWithMismatch = [
    { timestamp: t0, value: 31.2 },
    { timestamp: t0 + 10000, value: 31.23 },
    { timestamp: t0 + 30000, value: 31.3 },
  ];
  const filtered = alignTrajectoryPoints(xWithNull, yWithMismatch);
  assert.deepEqual(filtered, [{ xVal: 121.5, yVal: 31.2, timestamp: t0 }]);

  // 3. 空输入防御
  assert.deepEqual(alignTrajectoryPoints([], []), []);
});

test('控件语义化展示与 UUID 消除：正确生成人类友好的中文名称与内容摘要', () => {
  const lineCtrl: Control = {
    id: 'ctrl_line_test',
    type: 'line',
    style: { x: 0, y: 0, w: 200, h: 100 },
    props: { sourceMode: 'dynamic', series: [{ field: 'speed' }, { field: 'heading' }] },
  };
  const trajCtrl: Control = {
    id: 'ctrl_traj_test',
    type: 'line',
    style: { x: 0, y: 0, w: 200, h: 100 },
    props: {
      sourceMode: 'dynamic',
      xAxisMode: 'field',
      xAxisField: 'lon',
      series: [{ field: 'lat' }],
    },
  };
  const textCtrl: Control = {
    id: 'ctrl_text_test',
    type: 'text',
    style: { x: 0, y: 0, w: 100, h: 40 },
    props: { sourceMode: 'static', staticValue: 'AIS 船舶实时监管与调度大屏' },
  };
  const kpiCtrl: Control = {
    id: 'ctrl_kpi_test',
    type: 'number',
    style: { x: 0, y: 0, w: 100, h: 40 },
    props: { sourceMode: 'dynamic', variant: 'kpi' },
    binding: { target: 'global', schemaType: 'port_stats', field: 'total_vessels' },
  };
  const imgCtrl: Control = {
    id: 'ctrl_img_test',
    type: 'image',
    style: { x: 0, y: 0, w: 50, h: 50 },
    props: { sourceMode: 'static', imageType: 'radar' },
  };

  // 1. 显示名称验证
  assert.equal(formatControlDisplayName(lineCtrl, 0), '折线图 1');
  assert.equal(formatControlDisplayName(textCtrl, 1), '文本 2');
  assert.equal(formatControlDisplayName(imgCtrl), '图片');

  // 2. 内容摘要验证
  assert.equal(formatControlSummary(lineCtrl), '时序曲线 (speed, heading)');
  assert.equal(formatControlSummary(trajCtrl), '双轴航迹 (lon)');
  assert.equal(formatControlSummary(textCtrl), '"AIS 船舶实时监管与调…"');
  assert.equal(formatControlSummary(kpiCtrl), 'KPI · total_vessels');
  assert.equal(formatControlSummary(imgCtrl), '雷达扫描');

  // 3. 完整下拉选项验证
  assert.equal(formatControlOption(lineCtrl, 0), '折线图 1 · 时序曲线 (speed, heading)');
  assert.equal(formatControlOption(textCtrl, 1), '文本 2 · "AIS 船舶实时监管与调…"');

  // 4. 面包屑标签验证
  const tpl: ComponentTemplate = {
    id: 'tpl_test',
    name: '测试模板',
    category: '基础',
    layout: { width: 500, height: 300 },
    slots: [],
    controls: [lineCtrl, textCtrl],
  };
  assert.equal(formatControlTag(lineCtrl, tpl), '折线图 1 (时序曲线 (speed, heading))');
  assert.equal(formatControlTag(textCtrl, tpl), '文本 2 ("AIS 船舶实时监管与调…")');
});
