// 内置的是可复用配置，不是生产数据；只有 --demo 才生成独立的演示实体。
export const schemas = [
  {
    type: 'vessel',
    name: 'AIS 船舶目标',
    isEntity: true,
    idField: 'mmsi',
    fields: [
      { key: 'mmsi', name: 'MMSI', type: 'string' },
      { key: 'vessel_name', name: '船名', type: 'string' },
      {
        key: 'vessel_type',
        name: '船型',
        type: 'enum',
        options: ['商船', '渔船', '执法船', '拖轮'],
      },
      { key: 'speed', name: '航速', type: 'number', unit: '节', precision: 1 },
      { key: 'heading', name: '航向', type: 'number', unit: '°', precision: 0 },
      { key: 'lon', name: '经度', type: 'number', unit: '°E', precision: 6 },
      { key: 'lat', name: '纬度', type: 'number', unit: '°N', precision: 6 },
      {
        key: 'status',
        name: '航行状态',
        type: 'enum',
        options: ['在航', '锚泊', '系泊', '作业', '巡航', '告警'],
      },
      { key: 'update_time', name: '最新报位时间', type: 'datetime' },
    ],
  },
  {
    type: 'port_stats',
    name: '全港船舶统计',
    isEntity: false,
    fields: [
      { key: 'total_vessels', name: '在港船舶总数', type: 'number', unit: '艘', precision: 0 },
      { key: 'cargo_count', name: '商船总数', type: 'number', unit: '艘', precision: 0 },
      { key: 'fishing_count', name: '作业渔船', type: 'number', unit: '艘', precision: 0 },
      { key: 'warning_count', name: '异常告警', type: 'number', unit: '起', precision: 0 },
    ],
  },
];
const slots = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `slot_${i + 1}`,
    label: `对象${i + 1}`,
    schemaType: 'vessel',
  }));
const control = (
  id,
  type,
  x,
  y,
  w,
  h,
  fontSize,
  props = {},
  binding = null,
  color = '#DBF4FF',
) => ({ id, type, style: { x, y, w, h, fontSize, color }, props, binding });
const bind = (field, slotId = 'slot_1') => ({ target: 'slot', slotId, field });
const number = (id, field, x, y, w, h, size = 32, slot = 'slot_1', color = '#22D3EE') =>
  control(id, 'number', x, y, w, h, size, { sourceMode: 'dynamic' }, bind(field, slot), color);
const name = (id, field, x, y, w, size = 24, slot = 'slot_1') =>
  control(id, 'text', x, y, w, 38, size, { sourceMode: 'dynamic' }, bind(field, slot));
const rules = [
  { value: '在航', color: '#25D8AE' },
  { value: '巡航', color: '#22D3EE' },
  { value: '告警', color: '#FF667A' },
  { value: '作业', color: '#FFBF47' },
  { value: '锚泊', color: '#8AA7C7' },
  { value: '系泊', color: '#8AA7C7' },
];
export const templates = [
  {
    id: 'tpl_banner',
    name: '大屏标题横幅',
    category: '基础组件',
    decoration: 'banner',
    showHeader: false,
    layout: { width: 1872, height: 80 },
    slots: [],
    controls: [
      control('emblem', 'image', 6, 7, 64, 64, 16, { sourceMode: 'static', imageType: 'radar' }),
      control('title', 'text', 92, 5, 1195, 42, 34, {
        sourceMode: 'static',
        staticValue: 'AIS 船舶实时监管与调度大屏',
      }),
      control(
        'subtitle',
        'text',
        94,
        51,
        1100,
        23,
        15,
        { sourceMode: 'static', staticValue: '全港总览  /  重点监控  /  动态调度' },
        null,
        '#78A9D0',
      ),
      control('clock', 'time', 1370, 17, 478, 42, 22, { sourceMode: 'static', clock: true }),
    ],
  },
  {
    id: 'tpl_kpi',
    name: '全局指标卡',
    category: '全局统计',
    showHeader: false,
    layout: { width: 456, height: 160 },
    slots: [],
    controls: [
      control(
        'value',
        'number',
        26,
        23,
        404,
        119,
        62,
        { sourceMode: 'dynamic', variant: 'kpi', iconType: 'vessel' },
        { target: 'global', schemaType: 'port_stats', field: 'total_vessels' },
        '#22D3EE',
      ),
    ],
  },
  {
    id: 'tpl_curve',
    name: '重点船舶航速时序',
    category: '图表组件',
    layout: { width: 1248, height: 448 },
    slots: slots(3),
    controls: [
      control('history', 'line', 18, 58, 1212, 372, 16, {
        sourceMode: 'dynamic',
        lookbackMinutes: 20,
        gapSeconds: 120,
        series: [
          { slotId: 'slot_1', field: 'speed', color: '#22D3EE' },
          { slotId: 'slot_2', field: 'speed', color: '#25D8AE' },
          { slotId: 'slot_3', field: 'speed', color: '#FFBF47' },
        ],
      }),
    ],
  },
  {
    id: 'tpl_single',
    name: '重点船舶监控',
    category: '船舶监控',
    layout: { width: 608, height: 448 },
    slots: slots(1),
    controls: [
      name('name', 'vessel_name', 24, 62, 295, 28),
      name('mmsi', 'mmsi', 24, 101, 270, 17),
      control(
        'status',
        'light',
        350,
        68,
        236,
        49,
        18,
        { sourceMode: 'dynamic', colorRules: rules },
        bind('status'),
      ),
      number('speed', 'speed', 24, 155, 260, 111, 46),
      number('heading', 'heading', 322, 155, 260, 111, 40),
      number('lon', 'lon', 24, 288, 267, 79, 23),
      number('lat', 'lat', 322, 288, 262, 79, 23),
      control(
        'updated',
        'time',
        24,
        392,
        560,
        34,
        15,
        { sourceMode: 'dynamic' },
        bind('update_time'),
      ),
    ],
  },
  {
    id: 'tpl_dual',
    name: '双船关键指标对比',
    category: '船舶监控',
    showHeader: false,
    layout: { width: 608, height: 280 },
    slots: slots(2),
    controls: [
      control('title', 'text', 24, 16, 560, 30, 19, {
        sourceMode: 'static',
        staticValue: '双船关键指标对比',
      }),
      name('name_1', 'vessel_name', 24, 65, 264, 22),
      name('name_2', 'vessel_name', 322, 65, 262, 22, 'slot_2'),
      number('speed_1', 'speed', 24, 112, 264, 94, 37),
      number('speed_2', 'speed', 322, 112, 262, 94, 37, 'slot_2', '#25D8AE'),
      control(
        'status_1',
        'light',
        24,
        227,
        264,
        32,
        14,
        { sourceMode: 'dynamic', colorRules: rules },
        bind('status'),
      ),
      control(
        'status_2',
        'light',
        322,
        227,
        262,
        32,
        14,
        { sourceMode: 'dynamic', colorRules: rules },
        bind('status', 'slot_2'),
      ),
    ],
  },
  {
    id: 'tpl_table',
    name: '商船动态列表',
    category: '图表组件',
    layout: { width: 1248, height: 280 },
    slots: [],
    controls: [
      control('table', 'table', 18, 59, 1212, 203, 16, {
        sourceMode: 'dynamic',
        schemaType: 'vessel',
        columns: [
          'vessel_name',
          'mmsi',
          'vessel_type',
          'speed',
          'heading',
          'status',
          'update_time',
        ],
        filterField: 'vessel_type',
        filterValue: '商船',
        pageSize: 4,
        autoPageSeconds: 8,
      }),
    ],
  },
];
for (const type of ['text', 'number', 'time', 'light', 'image', 'table', 'line']) {
  const dimensions = ['table', 'line'].includes(type)
    ? { width: 600, height: 280 }
    : { width: 320, height: 150 };
  const props =
    type === 'line'
      ? {
          sourceMode: 'dynamic',
          lookbackMinutes: 20,
          series: [{ slotId: 'slot_1', field: 'speed', color: '#22D3EE' }],
        }
      : type === 'table'
        ? {
            sourceMode: 'dynamic',
            schemaType: 'vessel',
            columns: ['vessel_name', 'speed', 'status'],
            pageSize: 4,
          }
        : type === 'image'
          ? { sourceMode: 'static', imageType: 'radar' }
          : type === 'time'
            ? { sourceMode: 'static', clock: true }
            : { sourceMode: 'static', staticValue: type === 'number' ? 0 : '请输入内容' };
  templates.push({
    id: `atom_${type}`,
    name: {
      text: '文本框',
      number: '数值框',
      time: '时间框',
      light: '指示灯',
      image: '图片／动图',
      table: '数据表格',
      line: '时序曲线',
    }[type],
    category: '原子控件',
    layout: dimensions,
    showHeader: false,
    slots: !['image', 'table'].includes(type) ? slots(1) : [],
    controls: [
      control('content', type, 12, 12, dimensions.width - 24, dimensions.height - 24, 28, props),
    ],
  });
}
const instance = (id, templateId, x, y, w, h, slotBindings = {}, controlOverrides = {}) => ({
  instanceId: id,
  templateId,
  position: { x, y, w, h, zIndex: 1 },
  slotBindings,
  controlOverrides,
});
export function defaultScreen(demo = false) {
  const bound = (count = 1, start = 1) =>
    demo
      ? Object.fromEntries(
          Array.from({ length: count }, (_, i) => [`slot_${i + 1}`, `41300000${start + i}`]),
        )
      : {};
  return {
    id: 'screen_main',
    name: '主港区综合监控大屏',
    resolution: { width: 1920, height: 1080 },
    background: '#030B17',
    components: [
      instance('banner', 'tpl_banner', 24, 16, 1872, 80),
      ...['total_vessels', 'cargo_count', 'fishing_count', 'warning_count'].map((field, i) =>
        instance(
          `kpi_${i + 1}`,
          'tpl_kpi',
          24 + i * 472,
          112,
          456,
          160,
          {},
          {
            value: {
              binding: { target: 'global', schemaType: 'port_stats', field },
              props: { iconType: ['vessel', 'cargo', 'fishing', 'alert'][i] },
              style: { color: ['#22D3EE', '#5EA4FF', '#FFBF47', '#FF667A'][i] },
            },
          },
        ),
      ),
      instance('curve', 'tpl_curve', 24, 288, 1248, 448, bound(3)),
      instance('single', 'tpl_single', 1288, 288, 608, 448, bound(1, 2)),
      instance('dual', 'tpl_dual', 24, 752, 608, 280, bound(2)),
      instance('table', 'tpl_table', 648, 752, 1248, 280),
    ],
  };
}
export function demoEnvelopes(now = Date.now()) {
  const list = [
    ['远望1号', '商船', 14.2, '在航'],
    ['海巡01', '执法船', 18.6, '巡航'],
    ['浙岱渔0455', '渔船', 4.8, '作业'],
    ['中远海运盛世', '商船', 12.5, '在航'],
    ['港航拖轮06', '拖轮', 0, '系泊'],
    ['海丰远景', '商船', 9.4, '告警'],
    ['浙岱渔0128', '渔船', 3.2, '作业'],
    ['东方海运08', '商船', 8.7, '锚泊'],
  ];
  const result = list.map(([vessel_name, vessel_type, speed, status], i) => ({
    type: 'vessel',
    id: `41300000${i + 1}`,
    timestamp: now,
    data: {
      mmsi: `41300000${i + 1}`,
      vessel_name,
      vessel_type,
      speed,
      status,
      heading: i === 0 ? 0 : (90 + i * 31) % 360,
      lon: 121.4582 + i * 0.017,
      lat: 31.2348 + i * 0.012,
      update_time: new Date(now).toISOString(),
    },
  }));
  result.push({
    type: 'port_stats',
    timestamp: now,
    data: { total_vessels: 8, cargo_count: 4, fishing_count: 2, warning_count: 1 },
  });
  return result;
}
