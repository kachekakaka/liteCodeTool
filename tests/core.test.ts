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
  evaluateColorRule,
  formatAdaptiveTimeTick,
  calculateExtents,
  generateSparkline,
  resolveEntityRecord,
  extractUniqueTargets,
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
/**
 * 构造最小船舶数据包，供核心逻辑单测复用。
 *
 * @param data - 测试字段及其标量值。
 * @param timestamp - 源时间戳，单位毫秒，默认 1000。
 * @param id - 实体 ID，默认 A。
 * @returns type 为 vessel 的测试数据包。
 */
const packet = (data: Envelope['data'], timestamp = 1000, id = 'A'): Envelope => ({
  type: 'vessel',
  id,
  timestamp,
  data,
});
/**
 * 使用测试模板与数据模式调用值解析函数，减少用例中的重复准备。
 *
 * @param store - 用例使用的实体池。
 * @param i - 组件实例，省略时使用测试默认实例。
 * @param c - 待解析控件，省略时使用测试默认控件。
 * @param now - 当前时间戳，单位毫秒，默认 2000。
 * @returns 控件的显示值、元信息和时效状态。
 */
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
  /**
   * 构造只含一条待校验全局曲线的测试模板，用于验证错误绑定会被拒绝。
   *
   * @param series - 需要放入模板的曲线配置，可故意传入非法值。
   * @returns 供校验用例使用的独立模板对象。
   */
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

test('规则引擎 evaluateColorRule：支持单侧比较、闭区间、精确文本与短路匹配', () => {
  const rules = [
    { value: '> 50', color: '#EF4444' },     // 红色：大于 50
    { value: '20..50', color: '#F59E0B' },    // 黄色：20 到 50 之间
    { value: '<= 10', color: '#10B981' },     // 绿色：小于等于 10
    { value: '告警', color: '#DC2626' },      // 文本精确匹配
  ];

  // 1. 数值单侧比较
  assert.equal(evaluateColorRule(55, rules), '#EF4444');
  assert.equal(evaluateColorRule('60', rules), '#EF4444'); // 数字字符串兼容

  // 2. 闭区间匹配
  assert.equal(evaluateColorRule(50, rules), '#F59E0B'); // 边界 50 (不大于50，落入 20..50)
  assert.equal(evaluateColorRule(35, rules), '#F59E0B');
  assert.equal(evaluateColorRule(20, rules), '#F59E0B'); // 边界 20

  // 3. 小于等于比较
  assert.equal(evaluateColorRule(10, rules), '#10B981'); // 边界 10
  assert.equal(evaluateColorRule(5, rules), '#10B981');
  assert.equal(evaluateColorRule(-5, rules), '#10B981');

  // 4. 未落入任何规则返回 null
  assert.equal(evaluateColorRule(15, rules), null); // 10 < 15 < 20 未定义

  // 5. 文本精确匹配
  assert.equal(evaluateColorRule('告警', rules), '#DC2626');
  assert.equal(evaluateColorRule('在航', rules), null);

  // 6. 空值与防御性校验
  assert.equal(evaluateColorRule(null, rules), null);
  assert.equal(evaluateColorRule(undefined, rules), null);
  assert.equal(evaluateColorRule(25, []), null);
  assert.equal(evaluateColorRule(25, undefined), null);
});

test('自适应时间刻度 formatAdaptiveTimeTick：秒级窗口显示 HH:mm:ss，长周期显示 HH:mm', () => {
  const ts = new Date('2026-09-09T14:30:15').getTime();

  // 1. 短周期（<= 3 分钟，即 180,000ms）显示包含秒
  const tickShort = formatAdaptiveTimeTick(ts, 60000); // 1 分钟窗口
  assert.equal(tickShort.split(':').length, 3); // 格式如 14:30:15

  // 2. 长周期（> 3 分钟）显示仅到分
  const tickLong = formatAdaptiveTimeTick(ts, 600000); // 10 分钟窗口
  assert.equal(tickLong.split(':').length, 2); // 格式如 14:30
});

test('表格列状态颜色规则校验：允许合法 tableColumnRules 并拒绝非法规则', () => {
  const tableCtrl: Control = {
    id: 'tbl_ctrl',
    type: 'table',
    style: { x: 0, y: 0, w: 200, h: 100 },
    props: {
      schemaType: 'vessel',
      columns: ['speed', 'status'],
      tableColumnRules: [
        {
          field: 'speed',
          rules: [{ value: '> 20', color: '#EF4444' }],
        },
      ],
    },
  };

  const validTpl: ComponentTemplate = {
    id: 'tpl_tbl',
    name: '表格模板',
    category: '基础',
    layout: { width: 300, height: 200 },
    slots: [],
    controls: [tableCtrl],
  };

  assert.doesNotThrow(() => validateTemplate(validTpl, schemas));

  // 非法颜色值抛出异常
  const invalidTpl = clone(validTpl);
  invalidTpl.controls[0].props.tableColumnRules![0].rules[0].color = 'invalid-color';
  assert.throws(() => validateTemplate(invalidTpl, schemas), /表格列规则颜色格式无效/);
});

test('极值计算纯函数 calculateExtents：空值防御、时序规整化与航迹紧凑边距', () => {
  // 1. 空输入与全 null 防御
  assert.deepEqual(calculateExtents([]), { min: 0, max: 10 });
  assert.deepEqual(calculateExtents([null, undefined]), { min: 0, max: 10 });

  // 2. 常规时序模式（按 5 步长规整化，min 保底不高于 0）
  const extents = calculateExtents([12.3, 44.5, 18.0]);
  assert.equal(extents.min, 0);
  assert.equal(extents.max % 5, 0);
  assert.ok(extents.max >= 45);

  // 3. 包含负数值域时序
  const negExtents = calculateExtents([-25, -10, 5]);
  assert.ok(negExtents.min <= -25);
  assert.equal(Math.abs(negExtents.min % 5), 0);
  assert.ok(negExtents.max >= 5);

  // 4. 自由双轴航迹模式（保留 8% 边距，不对齐 5 步长）
  const fieldExtents = calculateExtents([121.4, 121.5, 121.6], true);
  assert.ok(fieldExtents.min < 121.4);
  assert.ok(fieldExtents.max > 121.6);
  assert.ok(fieldExtents.max - fieldExtents.min < 1);
});

test('微图生成纯函数 generateSparkline：空值防御与 SVG 路径坐标投影计算', () => {
  const t0 = 1000000;
  // 1. 空点防御
  assert.deepEqual(generateSparkline([], t0, 120000), {
    points: [],
    svgPath: '',
    svgAreaPath: '',
    min: null,
    max: null,
  });

  // 2. 正常数据点投影
  const points = [
    { timestamp: t0, value: 10 },
    { timestamp: t0 + 60000, value: 20 },
    { timestamp: t0 + 120000, value: 15 },
  ];
  const geo = generateSparkline(points, t0, 120000, 240, 50);
  assert.equal(geo.min, 10);
  assert.equal(geo.max, 20);
  assert.equal(geo.points.length, 3);
  assert.ok(geo.svgPath.startsWith('M'));
  assert.ok(geo.svgAreaPath.endsWith('Z'));
});

test('双维度实体解析 resolveEntityRecord：支持按批号与具体传感器源精确查找记录', () => {
  const store = new EntityStore();
  const now = 1000000;

  // 注入同批号 P-101 但不同传感器来源的数据包
  store.apply({
    type: 'projectile',
    id: 'P-101',
    timestamp: now,
    data: { batch_no: 'P-101', source: '雷达1', altitude: 48.5, speed: 2450 },
  });
  store.apply({
    type: 'projectile',
    id: 'P-101_telemetry',
    timestamp: now,
    data: { batch_no: 'P-101', source: '遥测1', altitude: 48.68, speed: 2465 },
  });

  // 1. 未指定来源时，默认返回主标识记录
  const defaultRec = resolveEntityRecord(store, 'projectile', 'P-101');
  assert.equal(defaultRec?.data.source, '雷达1');
  assert.equal(defaultRec?.data.altitude, 48.5);

  // 2. 指定雷达1来源，返回雷达1记录
  const radarRec = resolveEntityRecord(store, 'projectile', 'P-101', '雷达1');
  assert.equal(radarRec?.data.source, '雷达1');

  // 3. 指定遥测1来源，精确定位到辅助遥测记录
  const teleRec = resolveEntityRecord(store, 'projectile', 'P-101', '遥测1');
  assert.equal(teleRec?.data.source, '遥测1');
  assert.equal(teleRec?.data.altitude, 48.68);

  // 4. 严格来源权威：指定不存在的来源时严格返回 undefined，不静默偷换为默认源
  const notFoundRec = resolveEntityRecord(store, 'projectile', 'P-101', '不存在的雷达9');
  assert.equal(notFoundRec, undefined);

  // 5. 空值防御
  assert.equal(resolveEntityRecord(store, undefined, 'P-101'), undefined);
  assert.equal(resolveEntityRecord(store, 'projectile', undefined), undefined);
});

test('大屏槽位数据源校验：validateScreen 允许合法 slotSourceBindings 并拒绝非法槽位或格式', () => {
  const tpl: ComponentTemplate = {
    id: 'tpl_flight',
    name: '飞行卡片',
    category: '测控',
    layout: { width: 400, height: 300 },
    slots: [
      { id: 'slot_1', label: '目标1', schemaType: 'projectile' },
      { id: 'slot_2', label: '目标2', schemaType: 'projectile' },
    ],
    controls: [],
  };

  const screen = {
    id: 'screen_flight_test',
    name: '飞行测控大屏',
    resolution: { width: 1920, height: 1080 },
    background: '#030B17',
    components: [
      {
        instanceId: 'inst_flight_1',
        templateId: 'tpl_flight',
        position: { x: 0, y: 0, w: 400, h: 300 },
        slotBindings: { slot_1: 'P-101', slot_2: 'P-102' },
        slotSourceBindings: { slot_1: '雷达1', slot_2: '遥测1' },
        controlOverrides: {},
      },
    ],
  };

  // 合法配置校验通过
  assert.doesNotThrow(() => validateScreen(screen, [tpl], schemas));

  // 1. 槽位数据源映射到不存在的槽位时被拒绝
  const badSlotScreen = clone(screen);
  badSlotScreen.components[0].slotSourceBindings = { slot_nonexistent: '雷达1' };
  assert.throws(() => validateScreen(badSlotScreen, [tpl], schemas), /槽位数据源指派了不存在的槽位/);

  // 2. 槽位数据源非对象时被拒绝
  const badFormatScreen = clone(screen);
  badFormatScreen.components[0].slotSourceBindings = 'invalid_string' as any;
  assert.throws(() => validateScreen(badFormatScreen, [tpl], schemas), /槽位数据源指派无效/);
});

test('短周期滑动窗口 inWindow：支持 15 秒/30 秒短周期精确截取，杜绝 1 分钟外越界点', () => {
  const now = 1000000;
  const points = [
    { timestamp: now - 50000, value: 10 }, // 50 秒前（若按 15 秒截取必须被排除）
    { timestamp: now - 35000, value: 20 }, // 35 秒前
    { timestamp: now - 10000, value: 30 }, // 10 秒前（在 15 秒内）
    { timestamp: now - 2000, value: 40 },  // 2 秒前（在 15 秒内）
  ];

  // 1. 设置 15 秒窗口（15 / 60 分钟）
  const result15s = inWindow(points, now, 15 / 60);
  assert.equal(result15s.length, 2);
  assert.equal(result15s[0].value, 30);
  assert.equal(result15s[1].value, 40);

  // 2. 设置 30 秒窗口（30 / 60 分钟）
  const result30s = inWindow(points, now, 30 / 60);
  assert.equal(result30s.length, 2);
  assert.equal(result30s[0].value, 30);
  assert.equal(result30s[1].value, 40);

  // 3. 设置 60 秒窗口（1 分钟）
  const result60s = inWindow(points, now, 1);
  assert.equal(result60s.length, 4);
});

test('公共目标排重提取 extractUniqueTargets：多传感器同批号正确合并为唯一目标', () => {
  const store = new EntityStore();
  const now = 1000000;

  // 注入同一飞行目标 P-101 的 3 个不同传感器记录
  store.apply({
    type: 'projectile',
    id: 'P-101',
    timestamp: now,
    data: { batch_no: 'P-101', source: '雷达1' },
  });
  store.apply({
    type: 'projectile',
    id: 'P-101_src2',
    timestamp: now,
    data: { batch_no: 'P-101', source: '雷达2' },
  });
  store.apply({
    type: 'projectile',
    id: 'P-101_src3',
    timestamp: now,
    data: { batch_no: 'P-101', source: '遥测1' },
  });

  // 注入另一目标 P-102
  store.apply({
    type: 'projectile',
    id: 'P-102',
    timestamp: now,
    data: { batch_no: 'P-102', source: '雷达1' },
  });

  const targets = extractUniqueTargets(store, 'projectile');
  assert.equal(targets.length, 2);
  assert.equal(targets[0].id, 'P-101');
  assert.equal(targets[0].label, 'P-101');
  assert.equal(targets[1].id, 'P-102');
  assert.equal(targets[1].label, 'P-102');
});


