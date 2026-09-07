import type { Binding, ComponentInstance, ComponentTemplate, Control, EntityRecord, Envelope, Point, ResolvedValue, Scalar, Schema, ScreenConfig } from '../types.ts';

export const controlTypes = ['text', 'number', 'time', 'light', 'table', 'line', 'image'] as const;
export const DEFAULT_CHART_COLORS = ['#22D3EE', '#25D8AE', '#FFBF47', '#38ACD1'] as const;
export const DEFAULT_GLOBAL_CHART_FIELD = 'total_vessels';
export const DEFAULT_SLOT_CHART_FIELD = 'speed';
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
export const validId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(s) && !reserved.has(s);
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const empty = (value: unknown): boolean => value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value));
export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

// 仅按契约合并属性，不通用深合并：binding 是一个完整寻址单元，数组整体替换。
export function effectiveControl(control: Control, instance: ComponentInstance): Control {
  const patch = instance.controlOverrides?.[control.id];
  return {
    ...clone(control),
    style: { ...control.style, ...patch?.style },
    props: { ...clone(control.props), ...clone(patch?.props ?? {}) },
    binding: patch && Object.hasOwn(patch, 'binding') ? clone(patch.binding ?? null) : clone(control.binding ?? null)
  };
}

export function sourceType(binding: Binding | null | undefined, template: ComponentTemplate | undefined): string | undefined {
  return binding?.target === 'global' ? binding.schemaType : template?.slots.find(s => s.id === binding?.slotId)?.schemaType;
}

export function isStale(timestamp: number | undefined | null, now: number, thresholdSeconds: number): boolean {
  if (!thresholdSeconds || thresholdSeconds <= 0) return false;
  if (!timestamp || !finite(timestamp)) return true;
  return (now - timestamp) > thresholdSeconds * 1000;
}

export function isRecordStale(record: EntityRecord | undefined | null, staleSeconds: number, now: number): boolean {
  if (staleSeconds <= 0 || !record) return false;
  const timestamps = Object.values(record.timestamps ?? {});
  if (!timestamps.length) return false;
  const latest = Math.max(...timestamps);
  return (now - latest) > (staleSeconds * 1000);
}

export function inWindow(points: Point[], now: number, minutes: number): Point[] {
  const cutoff = now - clamp(minutes, 1, 60) * 60_000;
  return points.filter(p => p.timestamp >= cutoff && p.timestamp <= now).sort((a, b) => a.timestamp - b.timestamp);
}

export class EntityStore {
  records: Record<string, Record<string, EntityRecord>> = Object.create(null);
  // 快照与增量逐字段比较时间戳；晚到的 HTTP 快照不能覆盖先到的新增量。
  apply(envelope: Envelope, snapshot = false): void {
    if (!envelope || !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data) || !validId(envelope.type) || (envelope.id !== undefined && !validId(envelope.id)) || !finite(envelope.timestamp)) return;
    const id = envelope.id ?? '_global';
    const type = this.records[envelope.type] ??= Object.create(null);
    const record = type[id] ??= { data: Object.create(null), timestamps: Object.create(null), history: Object.create(null) };
    for (const [field, value] of Object.entries(envelope.data)) {
      if (!validId(field) || (!empty(value) && !['string', 'number', 'boolean'].includes(typeof value))) continue;
      const timestamp = envelope.fieldTimestamps?.[field] ?? envelope.timestamp;
      if (!finite(timestamp) || (record.timestamps[field] !== undefined && record.timestamps[field] >= timestamp)) continue;
      record.data[field] = value;
      record.timestamps[field] = timestamp;
      // 初始底账只更新最新值，不充当过去若干分钟的历史。
      if (!snapshot && (finite(value) || value === null)) {
        const history = record.history[field] ??= [];
        history.push({ timestamp, value: finite(value) ? value : null });
        const cutoff = timestamp - 60 * 60_000;
        while (history.length && (history[0].timestamp < cutoff || history.length > 7200)) history.shift();
      }
    }
  }
  get(type: string | undefined, id = '_global'): EntityRecord | undefined { return type ? this.records[type]?.[id] : undefined; }
  list(type: string): { id: string; record: EntityRecord }[] { return Object.entries(this.records[type] ?? {}).filter(([id]) => id !== '_global').map(([id, record]) => ({ id, record })); }
}

export function formatScalar(value: unknown, precision?: number | null, datetime = false): string {
  if (empty(value)) return '--';
  if (datetime) {
    const date = new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('zh-CN', { hour12: false });
  }
  if (finite(value) && precision !== undefined && precision !== null) return value.toFixed(clamp(precision, 0, 8));
  return String(value);
}

export function resolveValue(control: Control, template: ComponentTemplate, instance: ComponentInstance, store: EntityStore, schemas: Schema[], now: number): ResolvedValue {
  const c = effectiveControl(control, instance);
  const dynamic = c.props.sourceMode === 'dynamic' || (!c.props.sourceMode && !!c.binding);
  if (!dynamic) {
    const raw = c.props.clock ? now : c.props.staticValue;
    return { raw, value: formatScalar(raw, c.props.precision, c.type === 'time'), label: c.props.label ?? '', unit: c.props.unit ?? '', timestamp: null, empty: empty(raw), stale: false };
  }
  const type = sourceType(c.binding, template);
  const field = schemas.find(s => s.type === type)?.fields.find(f => f.key === c.binding?.field);
  const id = c.binding?.target === 'global' ? '_global' : instance.slotBindings[c.binding?.slotId ?? ''];
  const record = id ? store.get(type, id) : undefined;
  const raw = record?.data[c.binding?.field ?? ''];
  const timestamp = record?.timestamps[c.binding?.field ?? ''] ?? null;
  const label = c.props.labelMode === 'custom' ? (c.props.label ?? '') : (field?.name ?? c.props.label ?? '未绑定字段');
  const unit = c.props.unitMode === 'custom' ? (c.props.unit ?? '') : (field?.unit ?? '');
  return { raw, value: formatScalar(raw, c.props.precision ?? field?.precision, c.type === 'time' || field?.type === 'datetime'), label, unit, timestamp, empty: empty(raw), stale: timestamp !== null && isStale(timestamp, now, c.props.staleSeconds ?? 120) };
}

// 拖动和缩放统一以逻辑坐标计算，边界约束不受显示缩放倍率影响。
export function fitGeometry(g: { x: number; y: number; w: number; h: number }, width: number, height: number) {
  const w = clamp(g.w, 40, width), h = clamp(g.h, 28, height);
  return { w, h, x: clamp(g.x, 0, width - w), y: clamp(g.y, 0, height - h) };
}

export function safeImageUrl(value: string): string {
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try { const u = new URL(value, 'http://localhost'); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? value : ''; } catch { return ''; }
}

// 边界校验同时服务于配置保存和轻量单测，不接收可执行表达式或任意 HTML。
export function assertJsonSafe(value: unknown, depth = 0): void {
  if (depth > 24) throw new Error('配置层级过深');
  if (typeof value === 'number' && !finite(value)) throw new Error('配置包含无效数值');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (reserved.has(key)) throw new Error('配置包含保留字段');
    assertJsonSafe(child, depth + 1);
  }
}
function geometry(g: unknown, width: number, height: number): void {
  const p = g as { x: number; y: number; w: number; h: number };
  if (!p || ![p.x, p.y, p.w, p.h].every(finite) || p.w <= 0 || p.h <= 0 || p.x < 0 || p.y < 0 || p.x + p.w > width + 0.1 || p.y + p.h > height + 0.1) throw new Error('控件或组件尺寸越过画布边界');
}
function controls(template: ComponentTemplate, schemas: Schema[]): void {
  const ids = new Set<string>();
  for (const c of template.controls) {
    if (!validId(c.id) || ids.has(c.id) || !controlTypes.includes(c.type)) throw new Error('控件类型或标识无效');
    ids.add(c.id); geometry(c.style, template.layout.width, template.layout.height);
    if (!c.props || typeof c.props !== 'object' || Array.isArray(c.props) || !['static', 'dynamic', undefined].includes(c.props.sourceMode)) throw new Error('数据源模式无效');
    if (c.binding) {
      const schema = schemas.find(s => s.type === sourceType(c.binding, template));
      if (!schema || !schema.fields.some(f => f.key === c.binding?.field)) throw new Error('数据绑定引用了不存在的字段');
      if (c.binding.target === 'global' ? schema.isEntity : (c.binding.target !== 'slot' || !schema.isEntity)) throw new Error('全局与实体绑定类型不匹配');
    }
    if (c.props.precision !== undefined && c.props.precision !== null && (!Number.isInteger(c.props.precision) || c.props.precision < 0 || c.props.precision > 8)) throw new Error('小数位应为 0~8 的整数');
    for (const key of ['gapSeconds', 'staleSeconds'] as const) if (c.props[key] !== undefined && (!finite(c.props[key]) || c.props[key]! < 0 || c.props[key]! > 86400)) throw new Error('时间阈值应为 0~86400 秒');
    if (c.props.autoPageSeconds !== undefined && (!finite(c.props.autoPageSeconds) || c.props.autoPageSeconds < 0 || c.props.autoPageSeconds > 120)) throw new Error('自动翻页间隔应为 0~120 秒');
    if (c.props.colorRules !== undefined && (!Array.isArray(c.props.colorRules) || c.props.colorRules.length > 30 || c.props.colorRules.some(r => !r || !/^#[0-9a-fA-F]{6}$/.test(r.color)))) throw new Error('指示灯颜色规则无效');
    if (c.props.pageSize !== undefined && (!Number.isInteger(c.props.pageSize) || c.props.pageSize < 1 || c.props.pageSize > 20)) throw new Error('每页行数应为 1~20 的整数');
    if (c.props.series !== undefined && (!Array.isArray(c.props.series) || c.props.series.length > 8)) throw new Error('单个图表最多配置 8 条曲线');
    if (c.type === 'table') {
      const schema = schemas.find(s => s.type === c.props.schemaType && s.isEntity);
      if (!schema || !Array.isArray(c.props.columns) || c.props.columns.some(key => !schema.fields.some(f => f.key === key)) || (c.props.filterField && !schema.fields.some(f => f.key === c.props.filterField))) throw new Error('表格的数据模式、列或过滤字段无效');
    }
    if (c.type === 'line') {
      if (c.props.lookbackMinutes !== undefined && (!finite(c.props.lookbackMinutes) || c.props.lookbackMinutes < 1 || c.props.lookbackMinutes > 60)) throw new Error('曲线时间窗口应为 1~60 分钟');
      if (c.props.xAxisMode !== undefined && !['time', 'field'].includes(c.props.xAxisMode)) throw new Error('X 轴模式无效');
      if (c.props.xAxisField !== undefined && (typeof c.props.xAxisField !== 'string' || c.props.xAxisField.length > 50)) throw new Error('X 轴字段无效');
      if (c.props.series !== undefined && Array.isArray(c.props.series)) {
        for (const s of c.props.series) {
          const isGlobal = s.target === 'global' || c.binding?.target === 'global';
          if (isGlobal) {
            const schemaType = s.schemaType || c.binding?.schemaType || 'port_stats';
            const schema = schemas.find(x => x.type === schemaType && !x.isEntity);
            if (!schema || !schema.fields.some(f => f.key === s.field && f.type === 'number')) throw new Error('全局曲线只能绑定非实体模式的数值字段');
          } else {
            if (!s.slotId) throw new Error('槽位曲线必须指定对象槽位');
            const slot = template.slots.find(x => x.id === s.slotId);
            if (!schemas.find(x => x.type === slot?.schemaType)?.fields.some(f => f.key === s.field && f.type === 'number')) throw new Error('曲线只能绑定对象槽位的数值字段');
          }
        }
      }
    }
  }
}
export function effectiveSubTitle(instance?: { subTitle?: string }, template?: { subTitle?: string; slots?: unknown[] }): string {
  if (instance && instance.subTitle !== undefined) return instance.subTitle.trim();
  if (template && template.subTitle !== undefined) return template.subTitle.trim();
  return template && template.slots && template.slots.length ? '目标监控' : '数据总览';
}
export function validateTemplate(template: ComponentTemplate, schemas: Schema[]): void {
  assertJsonSafe(template);
  if (!validId(template?.id) || !template.name?.trim() || template.name.length > 120 || !template.layout || !finite(template.layout.width) || !finite(template.layout.height) || template.layout.width < 80 || template.layout.height < 60 || template.layout.width > 3840 || template.layout.height > 2160) throw new Error('组件模板名称或尺寸无效');
  if (template.subTitle !== undefined && (typeof template.subTitle !== 'string' || template.subTitle.length > 120)) throw new Error('组件模板副标题无效');
  if (!Array.isArray(template.slots) || template.slots.length > 20 || !Array.isArray(template.controls) || template.controls.length > 100) throw new Error('组件模板超过槽位或控件数量限制');
  const ids = new Set<string>();
  for (const s of template.slots) { if (!validId(s.id) || ids.has(s.id) || !schemas.some(x => x.type === s.schemaType && x.isEntity)) throw new Error('对象槽位定义无效'); ids.add(s.id); }
  controls(template, schemas);
}
export function validateScreen(screen: ScreenConfig, templates: ComponentTemplate[], schemas: Schema[]): void {
  assertJsonSafe(screen);
  if (!validId(screen?.id) || !screen.name?.trim() || screen.name.length > 120 || !screen.resolution || !finite(screen.resolution.width) || !finite(screen.resolution.height) || screen.resolution.width < 320 || screen.resolution.height < 180 || screen.resolution.width > 7680 || screen.resolution.height > 4320 || !/^#[a-fA-F0-9]{6}$/.test(screen.background)) throw new Error('大屏名称、分辨率或背景色无效');
  if (!Array.isArray(screen.components) || screen.components.length > 150) throw new Error('大屏组件数量超出限制');
  const ids = new Set<string>();
  for (const i of screen.components) {
    const template = templates.find(t => t.id === i.templateId);
    if (!validId(i.instanceId) || ids.has(i.instanceId) || !template || !i.slotBindings || !i.controlOverrides) throw new Error('组件实例或组件模板引用无效');
    if (i.position?.zIndex !== undefined && (!Number.isInteger(i.position.zIndex) || i.position.zIndex < 0 || i.position.zIndex > 9999)) throw new Error('组件层级应为 0~9999 的整数');
    if (i.title !== undefined && (typeof i.title !== 'string' || i.title.length > 120)) throw new Error('组件标题无效');
    if (i.subTitle !== undefined && (typeof i.subTitle !== 'string' || i.subTitle.length > 120)) throw new Error('组件副标题无效');
    ids.add(i.instanceId); geometry(i.position, screen.resolution.width, screen.resolution.height);
    for (const [slot, id] of Object.entries(i.slotBindings)) if (!template.slots.some(s => s.id === slot) || !validId(id)) throw new Error('槽位指派无效');
    for (const id of Object.keys(i.controlOverrides)) if (!template.controls.some(c => c.id === id)) throw new Error('覆盖项引用了不存在的控件');
    controls({ ...template, controls: template.controls.map(c => effectiveControl(c, i)) }, schemas);
  }
}
