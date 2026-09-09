import type {
  Binding,
  ComponentInstance,
  ComponentTemplate,
  Control,
  EntityRecord,
  Envelope,
  Point,
  ResolvedValue,
  Schema,
  ScreenConfig,
} from '../types.ts';

export const controlTypes = [
  'text',
  'number',
  'time',
  'light',
  'table',
  'line',
  'image',
  'stream',
] as const;
export const DEFAULT_CHART_COLORS = ['#22D3EE', '#25D8AE', '#FFBF47', '#38ACD1'] as const;
export const DEFAULT_GLOBAL_CHART_FIELD = 'total_vessels';
export const DEFAULT_SLOT_CHART_FIELD = 'speed';
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
/**
 * 校验可用作资源、实体或字段键的标识，排除原型保留键。
 *
 * @param s - 待校验的未知值；有效字符串长度为 1～80，仅允许字母、数字、下划线和连字符。
 * @returns 合法标识返回 true，同时将输入收窄为 string。
 */
export const validId = (s: unknown): s is string =>
  typeof s === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(s) && !reserved.has(s);
/**
 * 通过 JSON 序列化复制配置，避免修改原对象。仅适用于可 JSON 序列化的数据。
 *
 * @param value - 需要复制的配置值；不得包含循环引用。
 * @returns 与输入类型相同的副本；Date 等特殊对象遵循 JSON 转换规则。
 * @typeParam T - 待复制配置的类型。
 * @throws 输入不能被 JSON 序列化或反序列化时抛出异常。
 */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/**
 * 判断输入是否为有限数值，排除 NaN 和正负无穷。
 *
 * @param value - 待判断的值。
 * @returns 有限 number 返回 true，并提供类型收窄。
 */
export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
/**
 * 识别缺失值、显式空值和无效数值；0、false 与空字符串均不算缺失。
 *
 * @param value - 待判断的字段值。
 * @returns 值为 undefined、null 或非有限 number 时返回 true。
 */
export const empty = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value));
/**
 * 将数值约束到闭区间；上限小于下限时按下限收敛。
 *
 * @param value - 待约束的有限数值。
 * @param min - 允许的最小值。
 * @param max - 允许的最大值。
 * @returns 区间内的数值。
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

// 仅按契约合并属性，不通用深合并：binding 是一个完整寻址单元，数组整体替换。
/**
 * 合并模板控件与当前实例的私有覆盖；binding 和数组整体替换，不进行通用深合并。
 *
 * @param control - 模板中的原始控件。
 * @param instance - 包含 controlOverrides 的组件实例。
 * @returns 合并后的控件配置，不修改原控件或实例。
 */
export function effectiveControl(control: Control, instance: ComponentInstance): Control {
  const patch = instance.controlOverrides?.[control.id];
  return {
    ...clone(control),
    style: { ...control.style, ...patch?.style },
    props: { ...clone(control.props), ...clone(patch?.props ?? {}) },
    binding:
      patch && Object.hasOwn(patch, 'binding')
        ? clone(patch.binding ?? null)
        : clone(control.binding ?? null),
  };
}

/**
 * 从全局绑定或模板对象槽位解析数据模式标识。
 *
 * @param binding - 控件绑定；为空时视为未绑定。
 * @param template - 控件所属模板；用于查找 slotId 对应的 schemaType。
 * @returns 数据模式标识；绑定或槽位不存在时为 undefined。
 */
export function sourceType(
  binding: Binding | null | undefined,
  template: ComponentTemplate | undefined,
): string | undefined {
  return binding?.target === 'global'
    ? binding.schemaType
    : template?.slots.find((s) => s.id === binding?.slotId)?.schemaType;
}

/**
 * 按字段源时间判断过期，阈值非正数时关闭过期判定。
 *
 * @param timestamp - 字段源时间戳，单位毫秒；启用判定时缺失、0 或无效时间按过期处理。
 * @param now - 当前时间戳，单位毫秒。
 * @param thresholdSeconds - 过期阈值，单位秒；小于等于 0 时返回 false。
 * @returns 字段超过阈值或缺少有效时间时为 true。
 */
export function isStale(
  timestamp: number | undefined | null,
  now: number,
  thresholdSeconds: number,
): boolean {
  if (!thresholdSeconds || thresholdSeconds <= 0) return false;
  if (!timestamp || !finite(timestamp)) return true;
  return now - timestamp > thresholdSeconds * 1000;
}

/**
 * 按记录中最新字段的源时间判断整行数据是否过期。
 *
 * @param record - 待检查的实体记录；为空时不标记过期。
 * @param staleSeconds - 过期阈值，单位秒；小于等于 0 时关闭判定。
 * @param now - 当前时间戳，单位毫秒。
 * @returns 最新字段超过阈值时为 true；无记录或无字段时间时为 false。
 */
export function isRecordStale(
  record: EntityRecord | undefined | null,
  staleSeconds: number,
  now: number,
): boolean {
  if (staleSeconds <= 0 || !record) return false;
  const timestamps = Object.values(record.timestamps ?? {});
  if (!timestamps.length) return false;
  const latest = Math.max(...timestamps);
  return now - latest > staleSeconds * 1000;
}

/**
 * 筛选当前滑动窗口内的历史点，并按时间升序生成新数组。
 *
 * @param points - 待筛选历史点，不会原地修改。
 * @param now - 窗口截止时间戳，单位毫秒。
 * @param minutes - 窗口长度，单位分钟；支持短周期秒级（最小 5 秒，即 5/60 分钟），最大 60 分钟。
 * @returns 位于窗口起止时间内的有序点集，包含边界时刻。
 */
export function inWindow(points: Point[], now: number, minutes: number): Point[] {
  const safeMinutes = clamp(minutes, 5 / 60, 60);
  const cutoff = now - safeMinutes * 60_000;
  return points
    .filter((p) => p.timestamp >= cutoff && p.timestamp <= now)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 以数据模式和实体 ID 两级索引保存最新字段值及有限历史；全局数据使用 _global 记录。
 */
export class EntityStore {
  /** 数据模式 → 实体 ID → 最新值、源时间和历史；使用无原型对象隔离保留键。 */
  records: Record<string, Record<string, EntityRecord>> = Object.create(null);
  // 快照与增量逐字段比较时间戳；晚到的 HTTP 快照不能覆盖先到的新增量。
  /**
   * 逐字段合并实体数据，只接受更新的源时间，避免快照或乱序消息覆盖新值。
   *
   * @param envelope - 数据包；无效标识、时间和字段会被忽略，未提供 id 时使用全局记录。
   * @param snapshot - 是否为初始底账，默认 false；true 只更新最新值，不追加历史。
   * @returns 无返回值；原地更新记录。增量历史最多保留一小时且每字段不超过 7200 点。
   */
  apply(envelope: Envelope, snapshot = false): void {
    if (
      !envelope ||
      !envelope.data ||
      typeof envelope.data !== 'object' ||
      Array.isArray(envelope.data) ||
      !validId(envelope.type) ||
      (envelope.id !== undefined && !validId(envelope.id)) ||
      !finite(envelope.timestamp)
    )
      return;
    const id = envelope.id ?? '_global';
    const type = (this.records[envelope.type] ??= Object.create(null));
    const record = (type[id] ??= {
      data: Object.create(null),
      timestamps: Object.create(null),
      history: Object.create(null),
    });
    for (const [field, value] of Object.entries(envelope.data)) {
      if (
        !validId(field) ||
        (!empty(value) && !['string', 'number', 'boolean'].includes(typeof value))
      )
        continue;
      const timestamp = envelope.fieldTimestamps?.[field] ?? envelope.timestamp;
      if (
        !finite(timestamp) ||
        (record.timestamps[field] !== undefined && record.timestamps[field] >= timestamp)
      )
        continue;
      record.data[field] = value;
      record.timestamps[field] = timestamp;
      // 初始底账只更新最新值，不充当过去若干分钟的历史。
      if (!snapshot && (finite(value) || value === null)) {
        const history = (record.history[field] ??= []);
        history.push({ timestamp, value: finite(value) ? value : null });
        const cutoff = timestamp - 60 * 60_000;
        while (history.length && (history[0].timestamp < cutoff || history.length > 7200))
          history.shift();
      }
    }
  }
  /**
   * 按数据模式和实体标识读取内存记录。
   *
   * @param type - 数据模式标识；undefined 时返回 undefined。
   * @param id - 实体标识，默认 _global，代表全局数据。
   * @returns 记录本身的引用；不存在时为 undefined。
   */
  get(type: string | undefined, id = '_global'): EntityRecord | undefined {
    return type ? this.records[type]?.[id] : undefined;
  }
  /**
   * 列出指定模式下的实体，排除全局记录。
   *
   * @param type - 数据模式标识。
   * @returns 包含实体 id 与记录引用的数组；无实体时为空数组。
   */
  list(type: string): { id: string; record: EntityRecord }[] {
    return Object.entries(this.records[type] ?? {})
      .filter(([id]) => id !== '_global')
      .map(([id, record]) => ({ id, record }));
  }
}

/**
 * 将字段值转换为界面文本，统一处理空值、小数位和日期时间。
 *
 * @param value - 原始字段值；缺失或无效值显示 --。
 * @param precision - 小数位；省略或为 null 时不强制精度，指定时约束到 0～8。
 * @param datetime - 是否按日期时间格式化，默认 false；true 使用中文本地时间格式。
 * @returns 用于显示的字符串；无法解析的日期返回 --。
 */
export function formatScalar(value: unknown, precision?: number | null, datetime = false): string {
  if (empty(value)) return '--';
  if (datetime) {
    const date = new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('zh-CN', { hour12: false });
  }
  if (finite(value) && precision !== undefined && precision !== null)
    return value.toFixed(clamp(precision, 0, 8));
  return String(value);
}

/**
 * 根据数据模式、实体标识与可选数据源获取匹配的实体记录。
 *
 * @param store - 实体数据池。
 * @param type - 数据模式标识。
 * @param id - 实体标识（如批号或 MMSI）。
 * @param source - 可选物理数据来源（如 雷达1、遥测1 等）。
 * @param schema - 可选模式元数据，用于确定业务目标和来源字段。
 * @returns 匹配到的实体记录，未匹配时返回 undefined。
 */
export function resolveEntityRecord(
  store: EntityStore,
  type: string | undefined,
  id: string | undefined,
  source?: string,
  schema?: Schema,
): EntityRecord | undefined {
  return resolveEntityEntry(store, type, id, source, schema)?.record;
}

/**
 * 读取记录对应的业务目标，缺少业务字段时保留记录 ID。
 * @param id - 实体记录标识。
 * @param record - 实体记录。
 * @param type - 数据模式标识。
 * @param schema - 可选模式元数据。
 * @returns 业务目标标识。
 */
export function entityTarget(
  id: string,
  record: EntityRecord,
  type: string,
  schema?: Schema,
): string {
  const field = schema?.targetIdField ?? (type === 'projectile' ? 'batch_no' : schema?.idField);
  return String((field && record.data[field]) || id);
}

/**
 * 按业务目标和来源定位记录；自动模式优先同名记录，否则使用稳定 ID 顺序。
 * @param store - 实体池。
 * @param type - 模式标识。
 * @param id - 目标或兼容旧记录标识。
 * @param source - 具体来源；空值表示自动选取单条记录。
 * @param schema - 可选模式元数据。
 * @returns 记录 ID 与实体记录；指定来源缺失或存在歧义时返回 undefined。
 */
export function resolveEntityEntry(
  store: EntityStore,
  type: string | undefined,
  id: string | undefined,
  source?: string,
  schema?: Schema,
): { id: string; record: EntityRecord } | undefined {
  if (!type || !id) return undefined;
  const direct = store.get(type, id);
  if (id === '_global') return direct ? { id, record: direct } : undefined;
  const target = direct ? entityTarget(id, direct, type, schema) : id;
  const sourceField = schema?.sourceField ?? 'source';
  const rows = store
    .list(type)
    .filter((row) => entityTarget(row.id, row.record, type, schema) === target);
  if (source) {
    const matches = rows.filter((row) => row.record.data[sourceField] === source);
    return matches.length === 1 ? matches[0] : undefined;
  }
  return rows.find((row) => row.id === target) ?? rows.sort((a, b) => a.id.localeCompare(b.id))[0];
}

/**
 * 计算曲线有效来源，区分未覆盖与显式自动。
 * @param instance - 当前实例。
 * @param slot - 槽位标识。
 * @param fallback - 曲线静态来源。
 * @returns 来源名称；空值表示自动选择。
 */
export function effectiveSource(
  instance: ComponentInstance,
  slot: string,
  fallback?: string,
): string | undefined {
  return Object.hasOwn(instance.slotSourceBindings ?? {}, slot)
    ? instance.slotSourceBindings![slot]
    : fallback;
}

/**
 * 清除旧模板中误持久化的工坊预览目标，不修改输入。
 * @param template - 原始模板。
 * @returns 只包含持久化配置的模板副本。
 */
export function normalizeTemplate(template: ComponentTemplate): ComponentTemplate {
  const result = clone(template);
  for (const control of result.controls ?? [])
    if (control.props) delete control.props.workshopPreviewTarget;
  return result;
}

/**
 * 标准化旧来源空值及记录 ID 指派，清除实例中的预览字段。
 * @param screen - 原始大屏。
 * @param templates - 可用模板。
 * @param store - 可选底账；缺失时保留待解析的旧 ID。
 * @param schemas - 可用模式元数据。
 * @returns 带来源语义版本 2 的大屏副本。
 */
export function normalizeScreen(
  screen: ScreenConfig,
  templates: ComponentTemplate[] = [],
  store?: EntityStore,
  schemas: Schema[] = [],
): ScreenConfig {
  const result = clone(screen);
  if (result.bindingVersion !== undefined && result.bindingVersion !== 2)
    throw new Error('不支持的大屏来源绑定版本');
  for (const instance of result.components ?? []) {
    if (result.bindingVersion !== 2)
      for (const [slot, source] of Object.entries(instance.slotSourceBindings ?? {}))
        if (source === '') delete instance.slotSourceBindings![slot];
    const template = templates.find((t) => t.id === instance.templateId);
    for (const slot of template?.slots ?? []) {
      const id = instance.slotBindings?.[slot.id];
      const record = id && store?.get(slot.schemaType, id);
      if (!record) continue;
      const schema = schemas.find((s) => s.type === slot.schemaType);
      const target = entityTarget(id, record, slot.schemaType, schema);
      if (target !== id) {
        instance.slotBindings[slot.id] = target;
        if (
          !Object.hasOwn(instance.slotSourceBindings ?? {}, slot.id) &&
          record.data[schema?.sourceField ?? 'source']
        ) {
          instance.slotSourceBindings ??= {};
          instance.slotSourceBindings[slot.id] = String(
            record.data[schema?.sourceField ?? 'source'],
          );
        }
      }
    }
    for (const override of Object.values(instance.controlOverrides ?? {}))
      if (override.props) delete override.props.workshopPreviewTarget;
  }
  result.bindingVersion = 2;
  return result;
}

/**
 * 从实体池中提取指定模式排重后的目标实体选项列表。
 *
 * @param store - 实体池存储实例。
 * @param schemaType - 数据模式标识。
 * @param schema - 可选模式元数据，未提供时兼容内置飞行目标身份。
 * @returns 包含目标标识与可读文本的数组。
 */
export function extractUniqueTargets(
  store: EntityStore,
  schemaType: string,
  schema?: Schema,
): Array<{ id: string; label: string }> {
  const items = store.list(schemaType);
  const seen = new Set<string>();
  const result: Array<{ id: string; label: string }> = [];
  for (const item of items) {
    const targetId = entityTarget(item.id, item.record, schemaType, schema);
    if (!seen.has(targetId)) {
      seen.add(targetId);
      const name = item.record.data.vessel_name;
      const label = name && name !== targetId ? `${name} · ${targetId}` : targetId;
      result.push({ id: targetId, label });
    }
  }
  return result;
}

/**
 * 解析控件最终显示值，合并实例覆盖、槽位绑定、字段元信息与时效状态。
 *
 * @param control - 模板中的原始控件。
 * @param template - 控件所属组件模板，提供对象槽位声明。
 * @param instance - 当前实例，提供槽位指派和私有覆盖。
 * @param store - 实体记录及字段历史的内存存储。
 * @param schemas - 字段名称、单位、类型与默认精度的数据模式清单。
 * @param now - 当前时间戳，单位毫秒，用于时钟和过期判定。
 * @returns 包含原始值、格式化文本、标签、单位、源时间、缺失与过期状态的结果。
 */
export function resolveValue(
  control: Control,
  template: ComponentTemplate,
  instance: ComponentInstance,
  store: EntityStore,
  schemas: Schema[],
  now: number,
): ResolvedValue {
  const c = effectiveControl(control, instance);
  const dynamic = c.props.sourceMode === 'dynamic' || (!c.props.sourceMode && !!c.binding);
  if (!dynamic) {
    const raw = c.props.clock ? now : c.props.staticValue;
    return {
      raw,
      value: formatScalar(raw, c.props.precision, c.type === 'time'),
      label: c.props.label ?? '',
      unit: c.props.unit ?? '',
      timestamp: null,
      empty: empty(raw),
      stale: false,
    };
  }

  const type = sourceType(c.binding, template);
  const field = schemas
    .find((s) => s.type === type)
    ?.fields.find((f) => f.key === c.binding?.field);
  const id =
    c.binding?.target === 'global' ? '_global' : instance.slotBindings[c.binding?.slotId ?? ''];
  const slotSource =
    c.binding?.target === 'global'
      ? undefined
      : instance.slotSourceBindings?.[c.binding?.slotId ?? ''];
  const record = id
    ? resolveEntityRecord(
        store,
        type,
        id,
        slotSource,
        schemas.find((s) => s.type === type),
      )
    : undefined;
  const raw = record?.data[c.binding?.field ?? ''];
  const timestamp = record?.timestamps[c.binding?.field ?? ''] ?? null;
  const label =
    c.props.labelMode === 'custom'
      ? (c.props.label ?? '')
      : (field?.name ?? c.props.label ?? '未绑定字段');
  const unit = c.props.unitMode === 'custom' ? (c.props.unit ?? '') : (field?.unit ?? '');
  return {
    raw,
    value: formatScalar(
      raw,
      c.props.precision ?? field?.precision,
      c.type === 'time' || field?.type === 'datetime',
    ),
    label,
    unit,
    timestamp,
    empty: empty(raw),
    stale: timestamp !== null && isStale(timestamp, now, c.props.staleSeconds ?? 120),
  };
}

// 拖动和缩放统一以逻辑坐标计算，边界约束不受显示缩放倍率影响。
/**
 * 按逻辑画布坐标约束位置和尺寸，不受页面显示缩放影响。
 *
 * @param g - 待约束的 x、y、w、h，单位为逻辑像素。
 * @param width - 容器逻辑宽度，单位像素；调用方应保证不小于最小控件宽度。
 * @param height - 容器逻辑高度，单位像素；调用方应保证不小于最小控件高度。
 * @returns 新的位置尺寸对象；正常画布内最小尺寸为 40×28，并限制到容器边界。
 */
export function fitGeometry(
  g: { x: number; y: number; w: number; h: number },
  width: number,
  height: number,
) {
  const w = clamp(g.w, 40, width),
    h = clamp(g.h, 28, height);
  return { w, h, x: clamp(g.x, 0, width - w), y: clamp(g.y, 0, height - h) };
}

/**
 * 筛选允许显示的图片地址，拒绝可执行协议及带账号密码的地址。
 *
 * @param value - 待检查的图片地址或受支持格式的 Base64 图片数据。
 * @returns 合法地址原文；不符合协议或格式要求时为空字符串。
 */
export function safeImageUrl(value: string): string {
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try {
    const u = new URL(value, 'http://localhost');
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? value : '';
  } catch {
    return '';
  }
}

// 边界校验同时服务于配置保存和轻量单测，不接收可执行表达式或任意 HTML。
/**
 * 递归检查配置中的保留键、非有限数值和过深嵌套。
 *
 * @param value - 待校验的 JSON 配置值。
 * @param depth - 当前递归深度，外部调用保持默认 0；超过 24 层会拒绝。
 * @returns 无返回值；校验通过即正常结束。
 * @throws 发现原型保留键、无效数值或超深结构时抛出 Error。
 */
export function assertJsonSafe(value: unknown, depth = 0): void {
  if (depth > 24) throw new Error('配置层级过深');
  if (typeof value === 'number' && !finite(value)) throw new Error('配置包含无效数值');
  if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      if (reserved.has(key)) throw new Error('配置包含保留字段');
      assertJsonSafe(child, depth + 1);
    }
}
/**
 * 校验位置尺寸是否为有限正尺寸且位于画布内。
 *
 * @param g - 待校验的 x、y、w、h 对象。
 * @param width - 容器逻辑宽度，单位像素。
 * @param height - 容器逻辑高度，单位像素；边界允许 0.1 像素浮点误差。
 * @returns 无返回值；校验通过即正常结束。
 * @throws 缺少尺寸、尺寸非法或越界时抛出 Error。
 */
function geometry(g: unknown, width: number, height: number): void {
  const p = g as { x: number; y: number; w: number; h: number };
  if (
    !p ||
    ![p.x, p.y, p.w, p.h].every(finite) ||
    p.w <= 0 ||
    p.h <= 0 ||
    p.x < 0 ||
    p.y < 0 ||
    p.x + p.w > width + 0.1 ||
    p.y + p.h > height + 0.1
  )
    throw new Error('控件或组件尺寸越过画布边界');
}
/**
 * 校验模板控件的标识、几何、数据绑定及各控件专属属性。
 *
 * @param template - 待校验模板，提供控件集合、画布尺寸和对象槽位。
 * @param schemas - 允许绑定的数据模式及字段清单。
 * @returns 无返回值；所有控件通过检查后正常结束。
 * @throws 控件重复、越界、绑定不匹配或属性超限时抛出 Error。
 */
function controls(template: ComponentTemplate, schemas: Schema[]): void {
  const ids = new Set<string>();
  for (const c of template.controls) {
    if (!validId(c.id) || ids.has(c.id) || !controlTypes.includes(c.type))
      throw new Error('控件类型或标识无效');
    ids.add(c.id);
    geometry(c.style, template.layout.width, template.layout.height);
    if (
      !c.props ||
      typeof c.props !== 'object' ||
      Array.isArray(c.props) ||
      !['static', 'dynamic', undefined].includes(c.props.sourceMode)
    )
      throw new Error('数据源模式无效');
    if (c.binding) {
      const schema = schemas.find((s) => s.type === sourceType(c.binding, template));
      if (!schema || !schema.fields.some((f) => f.key === c.binding?.field))
        throw new Error('数据绑定引用了不存在的字段');
      if (
        c.binding.target === 'global'
          ? schema.isEntity
          : c.binding.target !== 'slot' || !schema.isEntity
      )
        throw new Error('全局与实体绑定类型不匹配');
    }
    if (
      c.props.precision !== undefined &&
      c.props.precision !== null &&
      (!Number.isInteger(c.props.precision) || c.props.precision < 0 || c.props.precision > 8)
    )
      throw new Error('小数位应为 0~8 的整数');
    for (const key of ['gapSeconds', 'staleSeconds'] as const)
      if (
        c.props[key] !== undefined &&
        (!finite(c.props[key]) || c.props[key]! < 0 || c.props[key]! > 86400)
      )
        throw new Error('时间阈值应为 0~86400 秒');
    if (
      c.props.autoPageSeconds !== undefined &&
      (!finite(c.props.autoPageSeconds) ||
        c.props.autoPageSeconds < 0 ||
        c.props.autoPageSeconds > 120)
    )
      throw new Error('自动翻页间隔应为 0~120 秒');
    if (
      c.props.colorRules !== undefined &&
      (!Array.isArray(c.props.colorRules) ||
        c.props.colorRules.length > 30 ||
        c.props.colorRules.some((r) => !r || !/^#[0-9a-fA-F]{6}$/.test(r.color)))
    )
      throw new Error('指示灯颜色规则无效');
    if (
      c.props.pageSize !== undefined &&
      (!Number.isInteger(c.props.pageSize) || c.props.pageSize < 1 || c.props.pageSize > 20)
    )
      throw new Error('每页行数应为 1~20 的整数');
    if (
      c.props.series !== undefined &&
      (!Array.isArray(c.props.series) || c.props.series.length > 8)
    )
      throw new Error('单个图表最多配置 8 条曲线');
    if (c.props.tableColumnRules !== undefined) {
      if (!Array.isArray(c.props.tableColumnRules) || c.props.tableColumnRules.length > 20) {
        throw new Error('表格列规则数量无效');
      }
      for (const cr of c.props.tableColumnRules) {
        if (
          !cr ||
          typeof cr.field !== 'string' ||
          !Array.isArray(cr.rules) ||
          cr.rules.length > 30
        ) {
          throw new Error('表格列规则格式无效');
        }
        if (cr.rules.some((r) => !r || !/^#[0-9a-fA-F]{6}$/.test(r.color))) {
          throw new Error('表格列规则颜色格式无效');
        }
      }
    }
    if (
      c.props.streamMaxItems !== undefined &&
      (!Number.isInteger(c.props.streamMaxItems) ||
        c.props.streamMaxItems < 5 ||
        c.props.streamMaxItems > 500)
    ) {
      throw new Error('消息流最大条数应为 5~500 的整数');
    }
    if (c.type === 'stream') {
      if (c.props.schemaType) {
        const schema = schemas.find((s) => s.type === c.props.schemaType);
        if (!schema) throw new Error('消息流数据模式无效');
      }
    }
    if (c.type === 'table') {
      const schema = schemas.find((s) => s.type === c.props.schemaType && s.isEntity);
      if (
        !schema ||
        !Array.isArray(c.props.columns) ||
        c.props.columns.some((key) => !schema.fields.some((f) => f.key === key)) ||
        (c.props.filterField && !schema.fields.some((f) => f.key === c.props.filterField))
      )
        throw new Error('表格的数据模式、列或过滤字段无效');
    }
    if (c.type === 'line') {
      if (
        c.props.lookbackUnit !== undefined &&
        !['second', 'minute'].includes(c.props.lookbackUnit)
      )
        throw new Error('曲线时间单位无效');
      if (
        c.props.lookbackSeconds !== undefined &&
        (!finite(c.props.lookbackSeconds) ||
          c.props.lookbackSeconds < 10 ||
          c.props.lookbackSeconds > 600)
      )
        throw new Error('曲线秒级时间窗口应为 10~600 秒');
      if (
        c.props.lookbackMinutes !== undefined &&
        (!finite(c.props.lookbackMinutes) ||
          c.props.lookbackMinutes < 1 ||
          c.props.lookbackMinutes > 60)
      )
        throw new Error('曲线时间窗口应为 1~60 分钟');
      if (c.props.xAxisMode !== undefined && !['time', 'field'].includes(c.props.xAxisMode))
        throw new Error('X 轴模式无效');
      if (
        c.props.xAxisField !== undefined &&
        (typeof c.props.xAxisField !== 'string' || c.props.xAxisField.length > 50)
      )
        throw new Error('X 轴字段无效');
      if (
        c.props.xAxisSlotId &&
        (!validId(c.props.xAxisSlotId) || !template.slots.some((s) => s.id === c.props.xAxisSlotId))
      )
        throw new Error('X 轴槽位无效');
      if (
        c.props.workshopPreviewTarget !== undefined &&
        (typeof c.props.workshopPreviewTarget !== 'string' ||
          c.props.workshopPreviewTarget.length > 80)
      )
        throw new Error('工坊预览目标标识无效');
      if (c.props.series !== undefined && Array.isArray(c.props.series)) {
        for (const s of c.props.series) {
          if (s.yAxis !== undefined && !['left', 'right'].includes(s.yAxis))
            throw new Error('曲线 Y 轴归属无效');
          if (
            s.filterSource !== undefined &&
            (typeof s.filterSource !== 'string' || s.filterSource.length > 50)
          )
            throw new Error('曲线数据来源过滤无效');
          const isGlobal = s.target === 'global' || c.binding?.target === 'global';
          if (isGlobal) {
            const schemaType = s.schemaType || c.binding?.schemaType || 'port_stats';
            const schema = schemas.find((x) => x.type === schemaType && !x.isEntity);
            if (!schema || !schema.fields.some((f) => f.key === s.field && f.type === 'number'))
              throw new Error('全局曲线只能绑定非实体模式的数值字段');
          } else {
            if (!s.slotId) throw new Error('槽位曲线必须指定对象槽位');
            const slot = template.slots.find((x) => x.id === s.slotId);
            if (
              !schemas
                .find((x) => x.type === slot?.schemaType)
                ?.fields.some((f) => f.key === s.field && f.type === 'number')
            )
              throw new Error('曲线只能绑定对象槽位的数值字段');
          }
        }
      }
    }
  }
}

/**
 * 由两个同时间戳的有限数值组成的双轴航迹点。
 */
export interface TrajectoryPoint {
  /**
   * X 轴字段原始数值。
   */
  xVal: number;
  /**
   * Y 轴字段原始数值。
   */
  yVal: number;
  /**
   * 两轴共同的源时间戳，单位毫秒。
   */
  timestamp: number;
}

/**
 * 以毫秒时间戳精确匹配 X/Y 点集，生成双轴航迹；复杂度为 O(X + Y)。
 *
 * @param xPoints - X 轴历史点；重复时间戳取最后一个有限值。
 * @param yPoints - Y 轴历史点；调用方若需要时间有序结果，应传入时间有序点集。
 * @returns 两轴同时存在有限值的坐标点，保持 Y 点集遍历顺序，不插值、不原地排序。
 */
export function alignTrajectoryPoints(
  xPoints: Array<{ timestamp: number; value: number | null }>,
  yPoints: Array<{ timestamp: number; value: number | null }>,
): TrajectoryPoint[] {
  if (!xPoints.length || !yPoints.length) return [];
  const xMap = new Map<number, number>();
  for (const xPt of xPoints) {
    if (xPt.value !== null && finite(xPt.value)) {
      xMap.set(xPt.timestamp, xPt.value);
    }
  }
  const result: TrajectoryPoint[] = [];
  for (const yPt of yPoints) {
    if (yPt.value === null || !finite(yPt.value)) continue;
    const xVal = xMap.get(yPt.timestamp);
    if (xVal !== undefined) {
      result.push({
        xVal,
        yVal: yPt.value,
        timestamp: yPt.timestamp,
      });
    }
  }
  return result;
}

/**
 * 解析副标题，依次采用实例、模板和按槽位推导的默认文案。
 *
 * @param instance - 实例副标题覆盖；显式空字符串表示隐藏，省略表示继承。
 * @param template - 模板副标题及槽位；省略副标题时，有槽位显示目标监控，否则显示数据总览。
 * @returns 去除首尾空白后的副标题或默认文案。
 */
export function effectiveSubTitle(
  instance?: { subTitle?: string },
  template?: { subTitle?: string; slots?: unknown[] },
): string {
  if (instance && instance.subTitle !== undefined) return instance.subTitle.trim();
  if (template && template.subTitle !== undefined) return template.subTitle.trim();
  return template && template.slots && template.slots.length ? '目标监控' : '数据总览';
}

export const CONTROL_TYPE_LABELS: Record<string, string> = {
  text: '文本',
  number: '数值',
  time: '时间',
  light: '指示灯',
  table: '表格',
  line: '折线图',
  image: '图片',
  stream: '消息流',
};

/**
 * 把控件类型转换为可读名称，可追加从 1 开始的序号。
 *
 * @param control - 需要命名的控件。
 * @param index - 控件在列表中的下标，从 0 开始；省略时不显示序号。
 * @returns 用于控件列表的名称；未知类型回退为类型标识。
 */
export function formatControlDisplayName(control: Control, index?: number): string {
  const base = CONTROL_TYPE_LABELS[control.type] ?? control.type;
  return index !== undefined ? `${base} ${index + 1}` : base;
}

/**
 * 根据控件类型和数据配置生成简短摘要，避免用内部 ID 作为展示文案。
 *
 * @param control - 待描述的控件及其属性、绑定。
 * @returns 控件用途摘要；较长静态文本会截断显示。
 */
export function formatControlSummary(control: Control): string {
  const props = control.props || {};
  switch (control.type) {
    case 'line': {
      if (props.xAxisMode === 'field') {
        return `双轴航迹 (${props.xAxisField || 'X轴'})`;
      }
      const series = props.series || [];
      const fields = series
        .map((s: { field?: string }) => s.field)
        .filter(Boolean)
        .join(', ');
      return fields
        ? `时序曲线 (${fields})`
        : series.length
          ? `时序曲线 (${series.length} 组)`
          : '时序曲线';
    }
    case 'text': {
      if (props.sourceMode === 'dynamic') {
        return control.binding?.field ? `动态 · ${control.binding.field}` : '动态文本';
      }
      if (props.clock) return '实时时钟';
      if (
        props.staticValue !== undefined &&
        props.staticValue !== null &&
        props.staticValue !== ''
      ) {
        const str = String(props.staticValue);
        return `"${str.length > 12 ? str.slice(0, 12) + '…' : str}"`;
      }
      return '固定文本';
    }
    case 'number': {
      if (props.variant === 'kpi') {
        return control.binding?.field ? `KPI · ${control.binding.field}` : 'KPI 指标卡';
      }
      if (control.binding?.field) return `动态 · ${control.binding.field}`;
      if (props.staticValue !== undefined && props.staticValue !== null)
        return `固定值: ${props.staticValue}`;
      return '数值';
    }
    case 'light': {
      return control.binding?.field ? `状态 · ${control.binding.field}` : '指示灯';
    }
    case 'time': {
      if (props.clock) return '当前时间 (时钟)';
      return control.binding?.field ? `时间 · ${control.binding.field}` : '时间';
    }
    case 'table': {
      const cols = props.columns?.length;
      return cols ? `表格 (${cols} 列)` : '数据表格';
    }
    case 'image': {
      if (props.imageType === 'radar') return '雷达扫描';
      if (props.imageType === 'sonar') return '声纳波纹';
      return '自定义图片';
    }
    case 'stream': {
      return props.schemaType ? `消息流 (${props.schemaType})` : '滚动消息流';
    }
    default:
      return control.type;
  }
}

/**
 * 组合控件名称、序号和用途摘要，生成下拉选项文案。
 *
 * @param control - 待描述的控件。
 * @param index - 控件下标，从 0 开始。
 * @returns 名称与摘要拼接后的选项文本。
 */
export function formatControlOption(control: Control, index: number): string {
  return `${formatControlDisplayName(control, index)} · ${formatControlSummary(control)}`;
}

/**
 * 生成包含控件名称和用途摘要的选中项标签。
 *
 * @param control - 当前控件。
 * @param template - 用于查找控件序号的模板；省略或找不到时不显示序号。
 * @returns 适合检查器显示的控件标签文本。
 */
export function formatControlTag(control: Control, template?: { controls: Control[] }): string {
  const idx = template?.controls ? template.controls.findIndex((c) => c.id === control.id) : -1;
  const name = formatControlDisplayName(control, idx >= 0 ? idx : undefined);
  const summary = formatControlSummary(control);
  return `${name} (${summary})`;
}
/**
 * 校验模板身份、尺寸、对象槽位及所有控件，供前后端共用。
 *
 * @param template - 待保存或导入的模板。
 * @param schemas - 可引用的数据模式清单。
 * @returns 无返回值；校验通过不修改模板。
 * @throws 模板结构、槽位或控件违反契约时抛出带中文原因的 Error。
 */
export function validateTemplate(template: ComponentTemplate, schemas: Schema[]): void {
  assertJsonSafe(template);
  if (
    !validId(template?.id) ||
    !template.name?.trim() ||
    template.name.length > 120 ||
    !template.layout ||
    !finite(template.layout.width) ||
    !finite(template.layout.height) ||
    template.layout.width < 80 ||
    template.layout.height < 60 ||
    template.layout.width > 3840 ||
    template.layout.height > 2160
  )
    throw new Error('组件模板名称或尺寸无效');
  if (
    template.subTitle !== undefined &&
    (typeof template.subTitle !== 'string' || template.subTitle.length > 120)
  )
    throw new Error('组件模板副标题无效');
  if (
    !Array.isArray(template.slots) ||
    template.slots.length > 20 ||
    !Array.isArray(template.controls) ||
    template.controls.length > 100
  )
    throw new Error('组件模板超过槽位或控件数量限制');
  const ids = new Set<string>();
  for (const s of template.slots) {
    if (
      !validId(s.id) ||
      ids.has(s.id) ||
      !schemas.some((x) => x.type === s.schemaType && x.isEntity)
    )
      throw new Error('对象槽位定义无效');
    ids.add(s.id);
  }
  controls(template, schemas);
}
/**
 * 校验大屏、实例、模板引用和私有覆盖形成的最终控件配置。
 *
 * @param screen - 待保存或导入的大屏配置。
 * @param templates - 大屏实例可引用的模板集合。
 * @param schemas - 槽位和字段绑定可引用的数据模式集合。
 * @returns 无返回值；校验通过不修改大屏。
 * @throws 配置、实例几何、引用或合并后的控件违反契约时抛出 Error。
 */
export function validateScreen(
  screen: ScreenConfig,
  templates: ComponentTemplate[],
  schemas: Schema[],
): void {
  assertJsonSafe(screen);
  if (
    !validId(screen?.id) ||
    !screen.name?.trim() ||
    screen.name.length > 120 ||
    !screen.resolution ||
    !finite(screen.resolution.width) ||
    !finite(screen.resolution.height) ||
    screen.resolution.width < 320 ||
    screen.resolution.height < 180 ||
    screen.resolution.width > 7680 ||
    screen.resolution.height > 4320 ||
    !/^#[a-fA-F0-9]{6}$/.test(screen.background)
  )
    throw new Error('大屏名称、分辨率或背景色无效');
  if (!Array.isArray(screen.components) || screen.components.length > 150)
    throw new Error('大屏组件数量超出限制');
  const ids = new Set<string>();
  for (const i of screen.components) {
    const template = templates.find((t) => t.id === i.templateId);
    if (
      !validId(i.instanceId) ||
      ids.has(i.instanceId) ||
      !template ||
      !i.slotBindings ||
      !i.controlOverrides
    )
      throw new Error('组件实例或组件模板引用无效');
    if (
      i.position?.zIndex !== undefined &&
      (!Number.isInteger(i.position.zIndex) || i.position.zIndex < 0 || i.position.zIndex > 9999)
    )
      throw new Error('组件层级应为 0~9999 的整数');
    if (i.title !== undefined && (typeof i.title !== 'string' || i.title.length > 120))
      throw new Error('组件标题无效');
    if (i.subTitle !== undefined && (typeof i.subTitle !== 'string' || i.subTitle.length > 120))
      throw new Error('组件副标题无效');
    ids.add(i.instanceId);
    geometry(i.position, screen.resolution.width, screen.resolution.height);
    for (const [slot, id] of Object.entries(i.slotBindings))
      if (!template.slots.some((s) => s.id === slot) || !validId(id))
        throw new Error('槽位指派无效');
    if (i.slotSourceBindings !== undefined) {
      if (
        typeof i.slotSourceBindings !== 'object' ||
        i.slotSourceBindings === null ||
        Array.isArray(i.slotSourceBindings)
      )
        throw new Error('槽位数据源指派无效');
      for (const [slot, src] of Object.entries(i.slotSourceBindings)) {
        if (!template.slots.some((s) => s.id === slot))
          throw new Error('槽位数据源指派了不存在的槽位');
        if (typeof src !== 'string' || src.length > 80) throw new Error('槽位数据源标识无效');
      }
    }
    for (const id of Object.keys(i.controlOverrides))
      if (!template.controls.some((c) => c.id === id)) throw new Error('覆盖项引用了不存在的控件');
    controls(
      { ...template, controls: template.controls.map((c) => effectiveControl(c, i)) },
      schemas,
    );
  }
}

/**
 * 评估状态颜色规则，支持数值区间（如 >30、<=10、10..20）、比较符号以及标量全等匹配。
 *
 * @param value - 待判定的原始标量值。
 * @param rules - 有序颜色规则列表，按自上而下顺序短路匹配。
 * @returns 命中的六位十六进制颜色；未匹配或无值时返回 null。
 */
export function evaluateColorRule(
  value: unknown,
  rules: { value: unknown; color: string }[] | undefined,
): string | null {
  if (value === null || value === undefined || !rules || !rules.length) return null;

  const numVal =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
        ? Number(value)
        : null;

  for (const rule of rules) {
    if (rule.value === null || rule.value === undefined) continue;
    const ruleStr = String(rule.value).trim();

    // 1. 范围语法 min..max (如 10..20, -5..5)
    if (ruleStr.includes('..')) {
      const parts = ruleStr.split('..').map((p) => p.trim());
      if (parts.length === 2) {
        const min = Number(parts[0]);
        const max = Number(parts[1]);
        if (numVal !== null && Number.isFinite(min) && Number.isFinite(max)) {
          if (numVal >= min && numVal <= max) return rule.color;
          continue;
        }
      }
    }

    // 2. 比较运算符 (如 >30, >=10, <5, <=0)
    const matchOp = ruleStr.match(/^([><]=?)\s*(-?\d+(?:\.\d+)?)$/);
    if (matchOp) {
      const op = matchOp[1];
      const target = Number(matchOp[2]);
      if (numVal !== null && Number.isFinite(target)) {
        let matched = false;
        if (op === '>') matched = numVal > target;
        else if (op === '>=') matched = numVal >= target;
        else if (op === '<') matched = numVal < target;
        else if (op === '<=') matched = numVal <= target;
        if (matched) return rule.color;
        continue;
      }
    }

    // 3. 标量精确匹配
    if (value === rule.value || String(value) === ruleStr) {
      return rule.color;
    }
  }

  return null;
}

/**
 * 根据时间窗口总跨度格式化时间刻度标签。
 *
 * @param time - 时间戳，单位毫秒。
 * @param durationMs - 窗口总时长，单位毫秒。
 * @returns 跨度不超过 3 分钟时显示 HH:mm:ss，否则显示 HH:mm。
 */
export function formatAdaptiveTimeTick(time: number, durationMs: number): string {
  const d = new Date(time);
  if (durationMs <= 180000) {
    return d.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return d.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 坐标轴值域极值接口。
 */
export interface AxisExtents {
  min: number;
  max: number;
}

/**
 * 计算折线图坐标轴的自适应上下边界值域。
 *
 * @param values - 原始数值数组，允许包含 null 或 undefined。
 * @param isFieldAxis - 是否为自由双轴航迹模式；true 时紧凑保留 8% 边距，false 时按 5 步长规整化。
 * @returns 规范化的坐标轴极值对象 { min, max }。
 */
export function calculateExtents(
  values: (number | null | undefined)[],
  isFieldAxis = false,
): AxisExtents {
  const validVals = values.filter(
    (v): v is number => v !== null && v !== undefined && Number.isFinite(v),
  );
  if (!validVals.length) return { min: 0, max: 10 };

  const rawMin = Math.min(...validVals);
  const rawMax = Math.max(...validVals);
  const span = rawMax - rawMin || Math.abs(rawMax) * 0.1 || (isFieldAxis ? 1 : 5);

  if (isFieldAxis) {
    return {
      min: rawMin - span * 0.08,
      max: rawMax + span * 0.08,
    };
  }

  const maxVal = Math.ceil((rawMax + span * 0.08) / 5) * 5;
  const rawFloor = Math.floor((rawMin - span * 0.08) / 5) * 5;
  const minVal = Object.is(rawFloor, -0) || rawFloor >= 0 ? 0 : Math.min(0, rawFloor);
  return { min: minVal, max: Math.max(minVal + 5, maxVal) };
}

/**
 * 微型走势图计算产物接口。
 */
export interface SparklineGeometry {
  points: { x: number; y: number }[];
  svgPath: string;
  svgAreaPath: string;
  min: number | null;
  max: number | null;
}

/**
 * 将时序采样点投影为微型 SVG 走势折线与面积路径（纯函数）。
 *
 * @param points - 时序数据点数组。
 * @param startTime - 窗口起始时间戳，单位毫秒。
 * @param durationMs - 窗口总时长，单位毫秒。
 * @param width - SVG 绘图区宽度，默认 240。
 * @param height - SVG 绘图区高度，默认 50。
 * @returns 包含坐标点集、线条路径、面积闭合路径及极值的几何对象。
 */
export function generateSparkline(
  points: { timestamp: number; value: number | null }[],
  startTime: number,
  durationMs: number,
  width = 240,
  height = 50,
): SparklineGeometry {
  const validPoints = points.filter(
    (p): p is { timestamp: number; value: number } =>
      p.value !== null && p.value !== undefined && Number.isFinite(p.value),
  );
  if (!validPoints.length) {
    return { points: [], svgPath: '', svgAreaPath: '', min: null, max: null };
  }

  const values = validPoints.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) * 0.1 || 1;
  const padMin = min - span * 0.1;
  const padMax = max + span * 0.1;

  const coords = validPoints.map((p) => {
    const cx = Math.max(
      5,
      Math.min(width - 5, 5 + ((p.timestamp - startTime) / (durationMs || 1)) * (width - 10)),
    );
    const cy = Math.max(
      5,
      Math.min(
        height - 5,
        height - 5 - ((p.value - padMin) / (padMax - padMin || 1)) * (height - 10),
      ),
    );
    return { x: cx, y: cy };
  });

  const svgPath = coords
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const svgAreaPath =
    coords.length > 1
      ? `${svgPath} L ${coords.at(-1)!.x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`
      : '';

  return { points: coords, svgPath, svgAreaPath, min, max };
}
