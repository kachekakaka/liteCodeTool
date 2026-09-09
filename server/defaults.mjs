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
  {
    type: 'projectile',
    name: '飞行目标',
    isEntity: true,
    targetIdField: 'batch_no',
    sourceField: 'source',
    fields: [
      { key: 'batch_no', name: '批号', type: 'string' },
      {
        key: 'source',
        name: '数据源',
        type: 'enum',
        options: ['雷达1', '雷达2', '雷达3', '雷达4', '遥测1', '遥测2', '光测1', '光测2'],
      },
      { key: 'altitude', name: '高度', type: 'number', unit: 'km', precision: 2 },
      { key: 'speed', name: '速度', type: 'number', unit: 'km/h', precision: 0 },
      { key: 'heading', name: '航向', type: 'number', unit: '°', precision: 0 },
      { key: 'lon', name: '经度', type: 'number', unit: '°E', precision: 6 },
      { key: 'lat', name: '纬度', type: 'number', unit: '°N', precision: 6 },
      {
        key: 'status',
        name: '状态',
        type: 'enum',
        options: ['正常', '跟踪', '丢失', '拦截'],
      },
      { key: 'update_time', name: '最新报位时间', type: 'datetime' },
    ],
  },
  {
    type: 'event_log',
    name: '滚动消息流',
    isEntity: false,
    fields: [
      { key: 'time', name: '时间', type: 'datetime' },
      { key: 'level', name: '级别', type: 'enum', options: ['info', 'warn', 'error'] },
      { key: 'source', name: '来源', type: 'string' },
      { key: 'content', name: '内容', type: 'string' },
    ],
  },
];
/**
 * 生成默认船舶对象槽位，ID 和标签从 1 开始编号。
 *
 * @param n - 需要生成的槽位数量。
 * @returns schemaType 为 vessel 的槽位数组。
 */
const slots = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `slot_${i + 1}`,
    label: `对象${i + 1}`,
    schemaType: 'vessel',
  }));
/**
 * 组装默认控件配置，统一几何、样式、属性和绑定结构。
 *
 * @param id - 控件 ID。
 * @param type - 控件类型，例如 text、number 或 line。
 * @param x - 左侧逻辑坐标，单位像素。
 * @param y - 顶部逻辑坐标，单位像素。
 * @param w - 逻辑宽度，单位像素。
 * @param h - 逻辑高度，单位像素。
 * @param fontSize - 基础字号，单位像素。
 * @param props - 控件专属属性，默认空对象。
 * @param binding - 字段绑定，默认 null 表示未绑定。
 * @param color - 文字或主题颜色，默认 #DBF4FF。
 * @returns 符合控件契约的配置对象。
 */
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
/**
 * 生成引用模板对象槽位字段的动态绑定。
 *
 * @param field - 数据模式中的字段键名。
 * @param slotId - 对象槽位 ID，默认 slot_1。
 * @returns target 为 slot 的字段绑定对象。
 */
const bind = (field, slotId = 'slot_1') => ({ target: 'slot', slotId, field });
/**
 * 创建使用槽位字段的动态数值控件。
 *
 * @param id - 控件 ID。
 * @param field - 绑定的数值字段键名。
 * @param x - 左侧逻辑坐标，单位像素。
 * @param y - 顶部逻辑坐标，单位像素。
 * @param w - 逻辑宽度，单位像素。
 * @param h - 逻辑高度，单位像素。
 * @param size - 字号，默认 32 像素。
 * @param slot - 对象槽位 ID，默认 slot_1。
 * @param color - 文字颜色，默认 #22D3EE。
 * @returns 带动态来源和槽位绑定的数值控件。
 */
const number = (id, field, x, y, w, h, size = 32, slot = 'slot_1', color = '#22D3EE') =>
  control(id, 'number', x, y, w, h, size, { sourceMode: 'dynamic' }, bind(field, slot), color);
/**
 * 创建固定高度为 38 逻辑像素的动态文本控件。
 *
 * @param id - 控件 ID。
 * @param field - 绑定的文本字段键名。
 * @param x - 左侧逻辑坐标，单位像素。
 * @param y - 顶部逻辑坐标，单位像素。
 * @param w - 逻辑宽度，单位像素。
 * @param size - 字号，默认 24 像素。
 * @param slot - 对象槽位 ID，默认 slot_1。
 * @returns 带动态来源和槽位绑定的文本控件。
 */
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
        tableColumnRules: [
          {
            field: 'status',
            rules: [
              { value: '在航', color: '#22C55E' },
              { value: '巡航', color: '#06B6D4' },
              { value: '作业', color: '#F59E0B' },
              { value: '告警', color: '#EF4444' },
            ],
          },
        ],
      }),
    ],
  },
];
for (const type of ['text', 'number', 'time', 'light', 'image', 'table', 'line', 'stream']) {
  const dimensions = ['table', 'line', 'stream'].includes(type)
    ? { width: 560, height: 260 }
    : { width: 320, height: 150 };
  const props =
    type === 'line'
      ? {
          sourceMode: 'dynamic',
          lookbackMinutes: 20,
          series: [{ slotId: 'slot_1', field: 'speed', color: '#22D3EE' }],
        }
      : type === 'stream'
        ? {
            sourceMode: 'dynamic',
            schemaType: 'event_log',
            streamMaxItems: 50,
            streamAutoScroll: true,
          }
        : type === 'table'
          ? {
              sourceMode: 'dynamic',
              schemaType: 'vessel',
              columns: ['vessel_name', 'speed', 'status'],
              pageSize: 4,
              tableColumnRules: [
                {
                  field: 'status',
                  rules: [
                    { value: '在航', color: '#22C55E' },
                    { value: '巡航', color: '#06B6D4' },
                    { value: '作业', color: '#F59E0B' },
                    { value: '告警', color: '#EF4444' },
                  ],
                },
              ],
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
      stream: '滚动消息流',
    }[type],
    category: '原子控件',
    layout: dimensions,
    showHeader: false,
    slots: !['image', 'table', 'stream'].includes(type) ? slots(1) : [],
    controls: [
      control('content', type, 12, 12, dimensions.width - 24, dimensions.height - 24, 28, props),
    ],
  });
}
/**
 * 构造引用现有模板的默认大屏实例，初始层级为 1。
 *
 * @param id - 组件实例 ID。
 * @param templateId - 引用的模板 ID。
 * @param x - 左侧逻辑坐标，单位像素。
 * @param y - 顶部逻辑坐标，单位像素。
 * @param w - 逻辑宽度，单位像素。
 * @param h - 逻辑高度，单位像素。
 * @param slotBindings - 槽位 ID 到实体 ID 的指派表，默认空对象。
 * @param controlOverrides - 控件 ID 到私有覆盖的映射，默认空对象。
 * @returns 包含位置、指派与覆盖配置的组件实例。
 */
const instance = (id, templateId, x, y, w, h, slotBindings = {}, controlOverrides = {}) => ({
  instanceId: id,
  templateId,
  position: { x, y, w, h, zIndex: 1 },
  slotBindings,
  controlOverrides,
});
/**
 * 构造主港区默认大屏，演示模式下预先指派演示对象。
 *
 * @param demo - 是否使用演示绑定，默认 false；真实模式保留空槽位指派。
 * @returns 新的默认大屏配置，包含横幅、指标卡、曲线和表格等实例。
 */
export function defaultScreen(demo = false) {
  /**
   * 按所在 defaultScreen 的模式生成演示槽位指派。
   *
   * @param count - 需要绑定的槽位数量，默认 1。
   * @param start - 演示实体编号起点，默认 1。
   * @returns 演示模式返回槽位到演示实体的映射；真实模式返回空对象。
   */
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
/**
 * 生成初始演示船舶与港区统计数据，供演示启动和推流使用。
 *
 * @param now - 数据源时间戳，单位毫秒，默认 Date.now()。
 * @returns 包含 8 艘船舶和 1 份全局统计的数据包数组。
 */
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
  const sampleSources = ['雷达1', '雷达2', '雷达3', '雷达4', '遥测1', '遥测2', '光测1', '光测2'];
  const baseAltitudes = [48.5, 52.3, 61.0, 78.4, 85.2, 92.6, 35.8, 42.1, 68.7, 75.3, 88.9, 105.4];
  const baseSpeeds = [2450, 2600, 3100, 3850, 4200, 4550, 1850, 2100, 3400, 3750, 4300, 4950];
  const sampleStatuses = [
    '正常',
    '跟踪',
    '跟踪',
    '跟踪',
    '正常',
    '拦截',
    '跟踪',
    '正常',
    '跟踪',
    '跟踪',
    '正常',
    '跟踪',
  ];

  for (let i = 1; i <= 12; i++) {
    const batch_no = `P-${100 + i}`;
    const targetBaseAlt = baseAltitudes[i - 1];
    const targetBaseSpd = baseSpeeds[i - 1];
    const targetStatus = sampleStatuses[i - 1];

    for (let sIdx = 0; sIdx < sampleSources.length; sIdx++) {
      const src = sampleSources[sIdx];
      const isPrimary = sIdx === 0;
      const id = isPrimary ? batch_no : `${batch_no}_src${sIdx + 1}`;
      const altOffset = isPrimary ? 0 : Number((sIdx * 0.14 - 0.28).toFixed(2));
      const spdOffset = isPrimary ? 0 : Math.round(sIdx * 12 - 25);
      const headingOffset = isPrimary ? 0 : sIdx * 2;

      result.push({
        type: 'projectile',
        id,
        timestamp: now,
        data: {
          batch_no,
          source: src,
          altitude: Math.max(1.0, Number((targetBaseAlt + altOffset).toFixed(2))),
          speed: Math.max(100, Math.round(targetBaseSpd + spdOffset)),
          heading: (42 + i * 27 + headingOffset) % 360,
          lon: Number((121.5 + i * 0.08 + (isPrimary ? 0 : sIdx * 0.002)).toFixed(6)),
          lat: Number((31.3 + i * 0.06 + (isPrimary ? 0 : sIdx * 0.002)).toFixed(6)),
          status: targetStatus,
          update_time: new Date(now).toISOString(),
        },
      });
    }
  }

  result.push({
    type: 'event_log',
    timestamp: now,
    data: {
      time: new Date(now).toISOString(),
      level: 'info',
      source: '雷达1',
      content: '捕获空中机动飞行目标 P-101，初始高度 48.5km，速度 2450km/h',
    },
  });
  return result;
}
