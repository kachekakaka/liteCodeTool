<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';
import { usePageMode } from '../../composables/usePageMode.ts';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control, Field } from '../../types.ts';
import {
  effectiveControl,
  formatScalar,
  isRecordStale,
  resolveValue,
  evaluateColorRule,
  inWindow,
  generateSparkline,
} from '../../engine/core.ts';

const props = defineProps({
  control: { type: Object as PropType<Control>, required: true },
  template: { type: Object as PropType<ComponentTemplate>, required: true },
  instance: { type: Object as PropType<ComponentInstance>, required: true },
});

const effectiveCtrl = computed(() => effectiveControl(props.control, props.instance));

const value = computed(() =>
  resolveValue(
    props.control,
    props.template,
    props.instance,
    dataState.store,
    dataState.schemas,
    dataState.now,
  ),
);

const pageMode = usePageMode();
const tableSchema = computed(() =>
  dataState.schemas.find((s) => s.type === effectiveCtrl.value.props.schemaType),
);

const columns = computed(() =>
  (effectiveCtrl.value.props.columns ?? [])
    .map((key) => tableSchema.value?.fields.find((f) => f.key === key))
    .filter((field): field is Field => !!field),
);

const rows = computed(() =>
  dataState.store
    .list(effectiveCtrl.value.props.schemaType ?? '')
    .filter(
      ({ record }) =>
        !effectiveCtrl.value.props.filterField ||
        record.data[effectiveCtrl.value.props.filterField] === effectiveCtrl.value.props.filterValue,
    )
    .sort((a, b) => a.id.localeCompare(b.id)),
);

const page = ref(0),
  pageSize = computed(() => Math.max(1, Math.min(20, effectiveCtrl.value.props.pageSize ?? 4)));

const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)));

watch(pageCount, (count) => {
  if (page.value >= count) page.value = count - 1;
});

const tableHover = ref(false);
let pager: ReturnType<typeof setInterval> | undefined;
let lastPage = Date.now();

onMounted(() => {
  if (effectiveCtrl.value.type !== 'table') return;
  pager = setInterval(() => {
    const seconds = effectiveCtrl.value.props.autoPageSeconds ?? 0;
    if (
      pageMode.mode === 'viewer' &&
      seconds > 0 &&
      !tableHover.value &&
      pageCount.value > 1 &&
      !document.hidden &&
      Date.now() - lastPage >= seconds * 1000
    ) {
      page.value = (page.value + 1) % pageCount.value;
      lastPage = Date.now();
    }
  }, 1000);
});

onUnmounted(() => {
  if (pager) clearInterval(pager);
});

watch(tableHover, () => {
  lastPage = Date.now();
});

const shown = computed(() =>
  rows.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value),
);

/**
 * 根据列颜色规则或船舶状态选择单元格样式。
 *
 * @param row - 当前行实体数据。
 * @param column - 对应字段元信息。
 * @returns 命中的颜色与粗体样式；未命中返回 undefined。
 */
function getCellStyle(row: any, column: Field) {
  const rules = effectiveCtrl.value.props.tableColumnRules?.find((r) => r.field === column.key)?.rules;
  if (rules && rules.length) {
    const color = evaluateColorRule(row.record.data[column.key], rules);
    if (color) {
      return { color, fontWeight: 'bold' };
    }
  }
  return undefined;
}

/**
 * 历史走势微图弹层所需的数据与几何定义。
 */
interface SparklineData {
  /** 实体记录 ID */
  rowId: string;
  /** 实体展示名称（如船名或批号） */
  entityName: string;
  /** 字段键名 */
  fieldKey: string;
  /** 字段中文名称 */
  fieldName: string;
  /** 字段度量单位 */
  unit?: string;
  /** 最新采样值（已格式化） */
  latest: string | number | null;
  /** 窗口内最小值 */
  min: number | null;
  /** 窗口内最大值 */
  max: number | null;
  /** SVG 投影点集 */
  points: { x: number; y: number }[];
  /** 折线 SVG 路径 */
  svgPath: string;
  /** 面积闭合 SVG 路径 */
  svgAreaPath: string;
  /** 弹层横坐标 */
  x: number;
  /** 弹层纵坐标 */
  y: number;
}

const sparklineTarget = ref<SparklineData | null>(null);

/**
 * 点击或键盘操作数值型单元格打开轻量历史趋势浮层。
 *
 * @param event - 鼠标或键盘交互事件，用于定位浮层吸附锚点。
 * @param row - 当前表格行数据。
 * @param column - 当前被点击的列字段元数据。
 * @returns 无返回值（undefined）；结果通过 sparklineTarget 状态变更体现。
 */
function openSparkline(event: UIEvent, row: any, column: Field) {
  if (column.type !== 'number') return;
  const historyRaw = row.record.history?.[column.key] ?? [];
  const points = inWindow(historyRaw, dataState.now, 2);
  const validPoints = points.filter((p) => p.value !== null && Number.isFinite(p.value));

  const targetEl = (event.currentTarget as HTMLElement) || (event.target as HTMLElement);
  const rect = targetEl?.getBoundingClientRect?.() ?? { left: 100, bottom: 100, top: 100 };
  let x = rect.left;
  let y = rect.bottom + 8;
  if (y + 170 > window.innerHeight) {
    y = Math.max(10, rect.top - 170);
  }
  if (x + 280 > window.innerWidth) {
    x = Math.max(10, window.innerWidth - 290);
  }

  const latest: string | number | null = row.record.data[column.key] ?? null;
  const startTime = dataState.now - 2 * 60 * 1000;
  const durationMs = 2 * 60 * 1000;
  const geo = generateSparkline(validPoints, startTime, durationMs, 240, 50);

  const entityName = String(row.record.data.vessel_name ?? row.record.data.batch_no ?? row.id);

  sparklineTarget.value = {
    rowId: row.id,
    entityName,
    fieldKey: column.key,
    fieldName: column.name,
    unit: column.unit,
    latest: formatScalar(latest, column.precision, false),
    min:
      geo.min !== null
        ? column.precision !== undefined
          ? Number(geo.min.toFixed(column.precision))
          : geo.min
        : null,
    max:
      geo.max !== null
        ? column.precision !== undefined
          ? Number(geo.max.toFixed(column.precision))
          : geo.max
        : null,
    points: geo.points,
    svgPath: geo.svgPath,
    svgAreaPath: geo.svgAreaPath,
    x,
    y,
  };
}

const staleEnabled = computed(() => effectiveCtrl.value.props.staleEnabled !== false);

const staleSeconds = computed(() => effectiveCtrl.value.props.staleSeconds ?? 120);

/**
 * 结合表格开关和当前时钟判断一行实体是否过期。
 *
 * @param record - 含 timestamps 的实体记录。
 * @returns 已启用时效判定且整行超过阈值时为 true。
 */
const isRowStale = (record: any) =>
  staleEnabled.value && isRecordStale(record, staleSeconds.value, dataState.now);

/**
 * 当焦点移出历史微图浮层且未落在浮层内部时自动关闭。
 *
 * @param event - 焦点移出事件。
 * @returns 无返回值；通过清空 sparklineTarget 体现。
 */
function onSparklineFocusOut(event: FocusEvent) {
  const current = event.currentTarget as HTMLElement | null;
  const next = event.relatedTarget as HTMLElement | null;
  if (!current || !next || !current.contains(next)) {
    sparklineTarget.value = null;
  }
}
</script>
<template>
  <div
    class="table-control"
    @mouseenter="tableHover = true"
    @mouseleave="tableHover = false"
  >
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
            >
              {{ column.name }}<small v-if="column.unit"> / {{ column.unit }}</small>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in shown"
            :key="row.id"
            :class="{ 'row-stale': isRowStale(row.record) }"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              :class="{ 'numeric-cell': column.type === 'number' }"
              :style="getCellStyle(row, column)"
              :tabindex="column.type === 'number' ? 0 : undefined"
              :role="column.type === 'number' ? 'button' : undefined"
              :aria-haspopup="column.type === 'number' ? 'dialog' : undefined"
              :aria-label="
                column.type === 'number'
                  ? `${column.name}：${formatScalar(row.record.data[column.key], column.precision, false)} ${column.unit || ''}，按回车查看走势`
                  : undefined
              "
              :title="
                column.type === 'number'
                  ? '点击或按回车查看近 2 分钟历史趋势'
                  : formatScalar(
                      row.record.data[column.key],
                      column.precision,
                      column.type === 'datetime',
                    )
              "
              @click.stop="openSparkline($event, row, column)"
              @keydown.enter.stop="openSparkline($event, row, column)"
              @keydown.space.prevent.stop="openSparkline($event, row, column)"
            >
              {{
                formatScalar(
                  row.record.data[column.key],
                  column.precision,
                  column.type === 'datetime',
                )
              }}<span
                v-if="
                  (column.type === 'datetime' || column.key === 'update_time') &&
                  isRowStale(row.record)
                "
                class="stale-tag"
                >停更</span
              >
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="!rows.length"
        class="table-empty"
      >
        暂无符合条件的数据
      </div>
    </div>
    <div class="table-pagination">
      <span
        >{{ rows.length }} 条记录 ·
        {{ effectiveCtrl.props.filterField ? '已应用条件过滤' : '动态对象集合' }}</span
      >
      <div>
        <button
          :disabled="page === 0"
          aria-label="上一页"
          @click.stop="page--"
        >
          ‹</button
        ><span>{{ page + 1 }} / {{ pageCount }}</span
        ><button
          :disabled="page >= pageCount - 1"
          aria-label="下一页"
          @click.stop="page++"
        >
          ›
        </button>
      </div>
    </div>

    <!-- 单元格历史趋势微图浮层 (Sparkline Popover) -->
    <Teleport to="body">
      <div
        v-if="sparklineTarget"
        class="sparkline-backdrop"
        @click="sparklineTarget = null"
      >
        <div
          class="sparkline-popover"
          role="dialog"
          aria-label="历史走势"
          tabindex="-1"
          :style="{ left: sparklineTarget.x + 'px', top: sparklineTarget.y + 'px' }"
          @click.stop
          @focusout="onSparklineFocusOut"
          @keydown.esc="sparklineTarget = null"
        >
          <div class="popover-header">
            <span class="popover-title">
              {{ sparklineTarget.entityName ? `【${sparklineTarget.entityName}】` : '' }}{{ sparklineTarget.fieldName }}
              <small v-if="sparklineTarget.unit">/ {{ sparklineTarget.unit }}</small>
            </span>
            <button
              class="close-btn"
              aria-label="关闭"
              @click="sparklineTarget = null"
            >
              ×
            </button>
          </div>
          <div class="popover-stats">
            <span>最新: <strong>{{ sparklineTarget.latest ?? '--' }}</strong></span>
            <span>最高: <strong>{{ sparklineTarget.max ?? '--' }}</strong></span>
            <span>最低: <strong>{{ sparklineTarget.min ?? '--' }}</strong></span>
          </div>
          <svg
            class="sparkline-svg"
            viewBox="0 0 240 50"
          >
            <defs>
              <linearGradient
                id="sparkline-grad"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stop-color="#22D3EE"
                  stop-opacity="0.35"
                />
                <stop
                  offset="100%"
                  stop-color="#22D3EE"
                  stop-opacity="0.0"
                />
              </linearGradient>
            </defs>
            <path
              v-if="sparklineTarget.svgAreaPath"
              :d="sparklineTarget.svgAreaPath"
              fill="url(#sparkline-grad)"
            />
            <path
              v-if="sparklineTarget.svgPath"
              :d="sparklineTarget.svgPath"
              fill="none"
              stroke="#22D3EE"
              stroke-width="1.8"
            />
            <circle
              v-for="(pt, idx) in sparklineTarget.points"
              :key="idx"
              :cx="pt.x"
              :cy="pt.y"
              r="2.2"
              fill="#22D3EE"
            />
          </svg>
          <div class="popover-footer">近 2 分钟走势 · 采样 {{ sparklineTarget.points.length }} 点</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
<style scoped>
.table-control {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.numeric-cell {
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.numeric-cell:hover {
  background-color: rgba(34, 211, 238, 0.14) !important;
  text-decoration: underline;
  text-decoration-color: rgba(34, 211, 238, 0.5);
}
.numeric-cell:focus-visible {
  outline: 2px solid #38bdf8;
  outline-offset: -2px;
  background-color: rgba(34, 211, 238, 0.18) !important;
}
.sparkline-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99998;
  background: transparent;
}
.sparkline-popover {
  position: fixed;
  width: 260px;
  background: #0b132b;
  border: 1px solid rgba(34, 211, 238, 0.45);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 14px rgba(34, 211, 238, 0.2);
  padding: 10px 12px;
  font-family: inherit;
  color: #dbf4ff;
  user-select: none;
  z-index: 99999;
}
.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #22d3ee;
  margin-bottom: 6px;
}
.popover-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 210px;
}
.close-btn {
  background: transparent;
  border: none;
  color: #7995b1;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}
.close-btn:hover {
  color: #fff;
}
.popover-stats {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.popover-stats strong {
  color: #f8fafc;
}
.sparkline-svg {
  width: 100%;
  height: 50px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 4px;
  display: block;
}
.popover-footer {
  font-size: 10px;
  color: #64748b;
  text-align: right;
  margin-top: 4px;
}
</style>
