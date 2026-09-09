<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';
import { computed, ref } from 'vue';
import type { ControlProps } from '../../types.ts';
import {
  clone,
  DEFAULT_CHART_COLORS,
  DEFAULT_GLOBAL_CHART_FIELD,
  DEFAULT_SLOT_CHART_FIELD,
  extractUniqueTargets,
} from '../../engine/core.ts';
import { notify } from '../../stores/application.ts';
import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, select, createSlot, renameSlot, patchControl } =
  useEditing();
/**
 * 读取检查器表单控件的字符串值，数值转换由调用方按字段语义处理。
 *
 * @param e - 来自 input 或 select 的表单事件。
 * @returns 事件目标的 value 字符串。
 */
const v = (e: Event) => (e.target as HTMLInputElement).value;
const isLineGlobal = computed(
  () =>
    displayControl.value?.binding?.target === 'global' ||
    displayControl.value?.props.series?.some((s) => s.target === 'global') ||
    (displayControl.value?.props.xAxisSchemaType &&
      dataState.schemas.find(
        (s) => s.type === displayControl.value?.props.xAxisSchemaType && !s.isEntity,
      )),
);
/**
 * 通过统一编辑入口合并当前控件属性，自动区分模板草稿与实例覆盖。
 *
 * @param patch - 待修改的控件属性子集；未提供的属性保留原值。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}
/**
 * 切换控件静态或动态数据模式；首次转为动态且无绑定时尝试绑定默认槽位。
 *
 * @param mode - static 表示固定值，dynamic 表示从字段取值。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function mode(mode: 'static' | 'dynamic') {
  props({ sourceMode: mode });
  if (mode === 'dynamic' && !displayControl.value?.binding) bindTarget('slot');
}
/**
 * 切换全局或对象槽位绑定，选取适配字段并重置自动标签、单位和精度。
 *
 * @param target - slot 使用模板对象槽位，global 使用非实体数据模式。
 * @param key - 槽位 ID 或全局 schemaType；默认空字符串时使用首个合适选项。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function bindTarget(target: 'slot' | 'global', key = '') {
  const t = selectedTemplate.value;
  if (!t) return;
  const slot = t.slots.find((s) => s.id === key) ?? t.slots[0];
  const s =
    target === 'global'
      ? dataState.schemas.find((s) => !s.isEntity && (!key || s.type === key))
      : dataState.schemas.find((s) => s.type === slot?.schemaType);
  if (!s) return notify('请先在组件工坊声明对象槽位，或切换为全局数据', true);
  const field =
    s.fields.find((f) =>
      displayControl.value?.type === 'number'
        ? f.type === 'number'
        : displayControl.value?.type === 'time'
          ? f.type === 'datetime'
          : f.key === 'vessel_name',
    ) ?? s.fields[0];
  patchControl({
    binding:
      target === 'global'
        ? { target, schemaType: s.type, field: field.key }
        : { target, slotId: slot.id, field: field.key },
    props: { sourceMode: 'dynamic', labelMode: 'auto', unitMode: 'auto', precision: null },
  });
}
/**
 * 将输入转换为有限数值后更新指定控件属性。
 *
 * @param key - 数值属性名；lookbackMinutes/lookbackSeconds、gapSeconds、staleSeconds、autoPageSeconds 用秒/分，pageSize 为行数。
 * @param event - 包含待转换字符串的输入事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function numberProp(
  key:
    | 'lookbackMinutes'
    | 'lookbackSeconds'
    | 'gapSeconds'
    | 'pageSize'
    | 'staleSeconds'
    | 'autoPageSeconds',
  event: Event,
) {
  const n = Number(v(event));
  if (Number.isFinite(n)) props({ [key]: n });
}
const lineSchemaType = computed(() => {
  const c = displayControl.value;
  if (!c) return 'vessel';
  if (c.props.xAxisSchemaType) return c.props.xAxisSchemaType;
  const first = c.props.series?.[0];
  if (first?.target === 'global') return first?.schemaType || 'port_stats';
  const slot = selectedTemplate.value?.slots.find((s) => s.id === first?.slotId);
  return slot?.schemaType || selectedTemplate.value?.slots[0]?.schemaType || 'vessel';
});
const currentLineSchema = computed(() =>
  dataState.schemas.find((s) => s.type === lineSchemaType.value),
);
const currentLineNumericFields = computed(
  () => currentLineSchema.value?.fields.filter((f) => f.type === 'number') ?? [],
);
const previewTargetOptions = computed(() =>
  extractUniqueTargets(dataState.store, lineSchemaType.value),
);

const availableSources = computed(() => {
  const sources = new Set<string>();
  const schemaSources = currentLineSchema.value?.fields.find((f) => f.key === 'source')?.options;
  if (Array.isArray(schemaSources)) {
    for (const s of schemaSources) if (s) sources.add(String(s));
  }
  const list = dataState.store.list(lineSchemaType.value);
  for (const item of list) {
    if (item.record.data.source) {
      sources.add(String(item.record.data.source));
    }
  }
  return Array.from(sources);
});
/**
 * 切换曲线数据模式，修复不兼容字段和槽位；全局模式统一回到时间横轴。
 *
 * @param event - 数据模式选择事件，其值为目标 schemaType。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function changeLineSchema(event: Event) {
  const nextType = v(event);
  const targetSchema = dataState.schemas.find((s) => s.type === nextType);
  if (!targetSchema) return;
  const numField =
    targetSchema.fields.find((f) => f.type === 'number')?.key ||
    (targetSchema.isEntity ? DEFAULT_SLOT_CHART_FIELD : DEFAULT_GLOBAL_CHART_FIELD);
  if (targetSchema.isEntity) {
    let slot = selectedTemplate.value?.slots.find((s) => s.schemaType === nextType);
    if (!slot) slot = createSlot('对象1', nextType) ?? undefined;
    const existing = displayControl.value?.props.series ?? [];
    const newSeries =
      existing.length > 0
        ? existing.map((s) => ({
            target: 'slot' as const,
            slotId: slot?.id || '',
            field: targetSchema.fields.some((f) => f.key === s.field && f.type === 'number')
              ? s.field
              : numField,
            color: s.color || DEFAULT_CHART_COLORS[0],
          }))
        : [
            {
              target: 'slot' as const,
              slotId: slot?.id || '',
              field: numField,
              color: DEFAULT_CHART_COLORS[0],
            },
          ];
    props({
      sourceMode: 'dynamic',
      xAxisSchemaType: nextType,
      xAxisField:
        displayControl.value?.props.xAxisField &&
        targetSchema.fields.some((f) => f.key === displayControl.value?.props.xAxisField)
          ? displayControl.value.props.xAxisField
          : undefined,
      series: newSeries,
    });
  } else {
    const existing = displayControl.value?.props.series ?? [];
    const newSeries =
      existing.length > 0
        ? existing.map((s) => ({
            target: 'global' as const,
            schemaType: nextType,
            field: targetSchema.fields.some((f) => f.key === s.field && f.type === 'number')
              ? s.field
              : numField,
            color: s.color || DEFAULT_CHART_COLORS[0],
          }))
        : [
            {
              target: 'global' as const,
              schemaType: nextType,
              field: numField,
              color: DEFAULT_CHART_COLORS[0],
            },
          ];
    props({
      sourceMode: 'dynamic',
      xAxisSchemaType: nextType,
      xAxisMode: 'time',
      series: newSeries,
    });
  }
}
/**
 * 切换时间横轴与字段横轴，进入字段模式时补充可用的默认 X 字段。
 *
 * @param mode - time 表示时间横轴，field 表示数值字段横轴。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function setXAxisMode(mode: 'time' | 'field') {
  props({
    xAxisMode: mode,
    xAxisField:
      mode === 'field'
        ? displayControl.value?.props.xAxisField || currentLineNumericFields.value[0]?.key || 'lon'
        : undefined,
  });
}
/**
 * 更新双轴航迹的 X 轴字段。
 *
 * @param event - X 轴数值字段选择事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function changeXAxisField(event: Event) {
  props({ xAxisField: v(event) });
}
const creatingSlotForSeries = ref<number | null>(null);
const newSlotDraft = ref('');
const renamingSlotId = ref<string | null>(null);
const renameSlotDraft = ref('');
/**
 * 处理曲线槽位选择；特殊新建选项进入行内编辑，普通选项直接改绑。
 *
 * @param index - 当前曲线下标，从 0 开始。
 * @param event - 槽位选择事件；__new__ 表示新建槽位。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function onSlotSelectChange(index: number, event: Event) {
  const val = (event.target as HTMLSelectElement).value;
  if (val === '__new__') {
    creatingSlotForSeries.value = index;
    newSlotDraft.value = `对象${(selectedTemplate.value?.slots.length ?? 0) + 1}`;
  } else {
    seriesChange(index, 'slotId', event);
  }
}
/**
 * 为当前曲线创建命名槽位并绑定，然后退出新建槽位输入状态。
 *
 * @param index - 正在新建槽位的曲线下标，须与当前编辑行一致。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function commitNewSlot(index: number) {
  if (creatingSlotForSeries.value !== index) return;
  const label =
    newSlotDraft.value.trim() || `对象${(selectedTemplate.value?.slots.length ?? 0) + 1}`;
  const slot = createSlot(label, lineSchemaType.value);
  creatingSlotForSeries.value = null;
  newSlotDraft.value = '';
  if (slot) {
    const series = clone(displayControl.value?.props.series ?? []);
    if (series[index]) {
      series[index].slotId = slot.id;
      props({ series });
    }
  }
}
/**
 * 取消行内新建槽位并丢弃尚未提交的名称。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function cancelNewSlot() {
  creatingSlotForSeries.value = null;
  newSlotDraft.value = '';
}
/**
 * 进入已有槽位的行内重命名状态并填充原名称。
 *
 * @param slotId - 需要重命名的槽位 ID。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function startRenameSlot(slotId: string) {
  renamingSlotId.value = slotId;
  const slot = selectedTemplate.value?.slots.find((s) => s.id === slotId);
  renameSlotDraft.value = slot?.label ?? '';
}
/**
 * 提交当前槽位名称并结束行内重命名。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function commitRenameSlot() {
  if (!renamingSlotId.value) return;
  renameSlot(renamingSlotId.value, renameSlotDraft.value);
  renamingSlotId.value = null;
  renameSlotDraft.value = '';
}
/**
 * 取消槽位重命名，清空编辑状态与名称草稿。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function cancelRenameSlot() {
  renamingSlotId.value = null;
  renameSlotDraft.value = '';
}
/**
 * 修改指定曲线配置；切换来源类型时整体重建寻址信息并保留颜色。
 *
 * @param index - 曲线下标，从 0 开始，应对应已有曲线。
 * @param key - 待改字段：target、slotId、schemaType、field、color、yAxis 或 filterSource。
 * @param event - 包含新值的表单事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function seriesChange(
  index: number,
  key: 'target' | 'slotId' | 'schemaType' | 'field' | 'color' | 'yAxis' | 'filterSource',
  event: Event,
) {
  const series = clone(displayControl.value?.props.series ?? []);
  const val = v(event);
  if (key === 'target') {
    if (val === 'global') {
      const globalSchema = dataState.schemas.find((s) => !s.isEntity);
      const field = globalSchema?.fields.find((f) => f.type === 'number');
      series[index] = {
        target: 'global',
        schemaType: globalSchema?.type || 'port_stats',
        field: field?.key || DEFAULT_GLOBAL_CHART_FIELD,
        color: series[index].color || DEFAULT_CHART_COLORS[0],
      };
    } else {
      const slot = selectedTemplate.value?.slots[0];
      const field = dataState.schemas
        .find((s) => s.type === slot?.schemaType)
        ?.fields.find((f) => f.type === 'number');
      series[index] = {
        target: 'slot',
        slotId: slot?.id || '',
        field: field?.key || DEFAULT_SLOT_CHART_FIELD,
        color: series[index].color || DEFAULT_CHART_COLORS[0],
      };
    }
  } else {
    series[index][key] = val as any;
  }
  props({ series });
}
/**
 * 按当前实体或全局模式增加一条曲线，使用默认数值字段和循环配色，必要时创建槽位。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function seriesAdd() {
  const isGlobal = isLineGlobal.value || !currentLineSchema.value?.isEntity;
  if (isGlobal) {
    const numField = currentLineNumericFields.value[0]?.key || DEFAULT_GLOBAL_CHART_FIELD;
    props({
      series: [
        ...(displayControl.value?.props.series ?? []),
        {
          target: 'global',
          schemaType: lineSchemaType.value,
          field: numField,
          color:
            DEFAULT_CHART_COLORS[
              (displayControl.value?.props.series?.length ?? 0) % DEFAULT_CHART_COLORS.length
            ],
        },
      ],
    });
    return;
  }
  let slot = selectedTemplate.value?.slots[0];
  if (!slot) {
    slot = createSlot('对象1', lineSchemaType.value) ?? undefined;
  }
  const numField = currentLineNumericFields.value[0]?.key || DEFAULT_SLOT_CHART_FIELD;
  props({
    series: [
      ...(displayControl.value?.props.series ?? []),
      {
        target: 'slot',
        slotId: slot?.id || '',
        field: numField,
        color:
          DEFAULT_CHART_COLORS[
            (displayControl.value?.props.series?.length ?? 0) % DEFAULT_CHART_COLORS.length
          ],
      },
    ],
  });
}
/**
 * 删除指定曲线并保留其余曲线顺序。
 *
 * @param index - 待删除曲线的下标，从 0 开始。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function seriesRemove(index: number) {
  props({ series: (displayControl.value?.props.series ?? []).filter((_, i) => i !== index) });
}
</script>
<template>
  <template v-if="selectedTemplate && displayControl"
    ><section
      v-if="displayControl.type === 'line'"
      class="property-section"
    >
      <h4>数据类型 (Schema)</h4>
      <select
        aria-label="折线图数据类型"
        :value="lineSchemaType"
        @change="changeLineSchema"
      >
        <optgroup label="实体数据类型（支持多对象对比与航迹）">
          <option
            v-for="s in dataState.schemas.filter((s) => s.isEntity)"
            :key="s.type"
            :value="s.type"
          >
            {{ s.name }}
          </option>
        </optgroup>
        <optgroup label="全局统计指标（无需槽位）">
          <option
            v-for="s in dataState.schemas.filter((s) => !s.isEntity)"
            :key="s.type"
            :value="s.type"
          >
            {{ s.name }}
          </option>
        </optgroup>
      </select>

      <h4>X 轴坐标基准</h4>
      <div class="segmented">
        <button
          :class="{ active: (displayControl.props.xAxisMode ?? 'time') === 'time' }"
          @click="setXAxisMode('time')"
        >
          滑动时间轴
        </button>
        <button
          :disabled="!currentLineSchema?.isEntity"
          :class="{ active: displayControl.props.xAxisMode === 'field' }"
          @click="setXAxisMode('field')"
        >
          实体数值字段 (自由双轴)
        </button>
      </div>

      <template v-if="(displayControl.props.xAxisMode ?? 'time') === 'time'">
        <div style="display: flex; gap: 8px; align-items: flex-end">
          <label style="flex: 1">
            时间跨度单位
            <select
              aria-label="时间跨度单位"
              :value="displayControl.props.lookbackUnit || 'minute'"
              @change="props({ lookbackUnit: v($event) as 'minute' | 'second' })"
            >
              <option value="minute">分钟</option>
              <option value="second">秒（短周期自适应）</option>
            </select>
          </label>
          <label
            v-if="(displayControl.props.lookbackUnit || 'minute') === 'minute'"
            style="flex: 1"
          >
            回溯时间（分钟）
            <select
              aria-label="回溯时间（分钟）"
              :value="displayControl.props.lookbackMinutes ?? 20"
              @change="numberProp('lookbackMinutes', $event)"
            >
              <option
                v-for="n in [1, 2, 5, 15, 20, 30, 60]"
                :key="n"
                :value="n"
              >
                {{ n }} 分钟{{ n <= 2 ? '（短周期）' : '' }}
              </option>
            </select>
          </label>
          <label
            v-else
            style="flex: 1"
          >
            回溯时间（秒）
            <select
              aria-label="回溯时间（秒）"
              :value="displayControl.props.lookbackSeconds ?? 60"
              @change="numberProp('lookbackSeconds', $event)"
            >
              <option
                v-for="s in [10, 15, 30, 60, 90, 120, 180, 300, 600]"
                :key="s"
                :value="s"
              >
                {{ s }} 秒
              </option>
            </select>
          </label>
        </div>
        <label
          >断线间隔（秒）<input
            type="number"
            min="1"
            :value="displayControl.props.gapSeconds ?? 120"
            @change="numberProp('gapSeconds', $event)"
        /></label>
      </template>
      <template v-else>
        <label
          >X 轴数值字段
          <select
            aria-label="X 轴数值字段"
            :value="displayControl.props.xAxisField || currentLineNumericFields[0]?.key"
            @change="changeXAxisField"
          >
            <option
              v-for="field in currentLineNumericFields"
              :key="field.key"
              :value="field.key"
            >
              {{ field.name }}{{ field.unit ? ' / ' + field.unit : '' }}
            </option>
          </select>
        </label>
        <p class="field-help">
          X 与 Y 轴按采样时间先后顺序顺次连线，各对象实时呈现各自航迹；末端发光高亮最新位置。
        </p>
      </template>

      <template v-if="currentLineSchema?.isEntity">
        <h4>工坊预览目标</h4>
        <select
          aria-label="工坊预览目标"
          :value="displayControl.props.workshopPreviewTarget || ''"
          @change="props({ workshopPreviewTarget: v($event) || undefined })"
        >
          <option value="">默认（首个可用目标）</option>
          <option
            v-for="item in previewTargetOptions"
            :key="item.id"
            :value="item.id"
          >
            {{ item.label }}
          </option>
        </select>
        <p class="field-help">仅供工坊内试看时序波形与传感器测控对比，不会固化进模板定义。</p>
      </template>

      <h4>曲线配置 (Y 轴度量)</h4>
      <div
        v-for="(series, index) in displayControl.props.series"
        :key="index"
        class="series-config"
      >
        <div>
          <strong>曲线 {{ index + 1 }}</strong
          ><button
            class="link-button"
            @click="seriesRemove(index)"
          >
            移除
          </button>
        </div>
        <template v-if="series.target === 'global' || !currentLineSchema?.isEntity">
          <select
            aria-label="统计指标字段"
            :value="series.field"
            @change="seriesChange(index, 'field', $event)"
          >
            <option
              v-for="field in currentLineNumericFields"
              :key="field.key"
              :value="field.key"
            >
              {{ field.name }}{{ field.unit ? ' / ' + field.unit : '' }}
            </option>
          </select>
        </template>
        <template v-else>
          <div
            v-if="creatingSlotForSeries === index"
            class="inline-slot-creator"
            style="display: flex; gap: 6px; align-items: center"
          >
            <input
              v-model="newSlotDraft"
              placeholder="输入占位符名称，如：领航船"
              autofocus
              @keydown.enter.stop="commitNewSlot(index)"
              @keydown.esc.stop="cancelNewSlot"
              style="flex: 1; font-size: 11px; padding: 4px 6px"
            />
            <button
              class="button"
              style="height: 26px; padding: 0 8px; font-size: 11px"
              @click="commitNewSlot(index)"
            >
              确定
            </button>
            <button
              class="link-button"
              style="font-size: 11px"
              @click="cancelNewSlot"
            >
              取消
            </button>
          </div>
          <div
            v-else-if="renamingSlotId === series.slotId"
            class="inline-slot-creator"
            style="display: flex; gap: 6px; align-items: center"
          >
            <input
              v-model="renameSlotDraft"
              placeholder="修改占位符名称"
              autofocus
              @keydown.enter.stop="commitRenameSlot"
              @keydown.esc.stop="cancelRenameSlot"
              style="flex: 1; font-size: 11px; padding: 4px 6px"
            />
            <button
              class="button"
              style="height: 26px; padding: 0 8px; font-size: 11px"
              @click="commitRenameSlot"
            >
              保存
            </button>
            <button
              class="link-button"
              style="font-size: 11px"
              @click="cancelRenameSlot"
            >
              取消
            </button>
          </div>
          <div
            v-else
            style="display: flex; gap: 6px; align-items: center"
          >
            <select
              aria-label="归属对象槽位"
              :value="series.slotId"
              @change="onSlotSelectChange(index, $event)"
              style="flex: 1"
            >
              <option
                v-for="slot in selectedTemplate.slots"
                :key="slot.id"
                :value="slot.id"
              >
                {{ slot.label }}
              </option>
              <option value="__new__">＋ 新建对象占位符...</option>
            </select>
            <button
              v-if="series.slotId"
              class="link-button"
              title="就地重命名该占位符"
              @click="startRenameSlot(series.slotId)"
            >
              ✎ 改名
            </button>
          </div>
          <label style="font-size: 11px; color: #739dbb; margin: 2px 0 0"
            >Y 轴度量字段
            <select
              aria-label="监控指标字段"
              :value="series.field"
              @change="seriesChange(index, 'field', $event)"
            >
              <option
                v-for="field in currentLineNumericFields"
                :key="field.key"
                :value="field.key"
              >
                {{ field.name }}{{ field.unit ? ' / ' + field.unit : '' }}
              </option>
            </select>
          </label>
        </template>
        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px">
          <label style="font-size: 11px; color: #739dbb; flex: 1; margin: 0">
            Y 轴向
            <select
              aria-label="Y 轴向"
              :value="series.yAxis || 'left'"
              @change="seriesChange(index, 'yAxis', $event)"
            >
              <option value="left">左 Y 轴（主轴）</option>
              <option value="right">右 Y 轴（副轴）</option>
            </select>
          </label>
          <label
            v-if="currentLineSchema?.isEntity"
            style="font-size: 11px; color: #739dbb; flex: 1; margin: 0"
          >
            数据来源过滤
            <select
              aria-label="数据来源过滤"
              :value="series.filterSource || ''"
              @change="seriesChange(index, 'filterSource', $event)"
            >
              <option value="">全部来源</option>
              <option
                v-for="src in availableSources"
                :key="src"
                :value="src"
              >
                {{ src }}
              </option>
            </select>
          </label>
        </div>
        <label style="font-size: 11px; color: #739dbb; margin: 2px 0 0"
          >曲线颜色
          <input
            type="color"
            :value="series.color || '#22D3EE'"
            aria-label="曲线颜色"
            @change="seriesChange(index, 'color', $event)"
          />
        </label>
      </div>
      <button
        class="button full"
        @click="seriesAdd"
      >
        ＋ 添加曲线
      </button>
      <p class="field-help">
        {{
          !currentLineSchema?.isEntity
            ? '全局模式免槽位声明，直接绑定港口宏观指标。'
            : '支持多对象对比；占位符可在模板各控件间共享，大屏运行时指派具体船舶。'
        }}
      </p>
    </section></template
  >
</template>
