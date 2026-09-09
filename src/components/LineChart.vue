<script setup lang="ts">
import { dataState } from '../stores/entities.ts';
import { usePageMode } from '../composables/usePageMode.ts';
import { computed, ref } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control, Point } from '../types.ts';
import {
  inWindow,
  DEFAULT_CHART_COLORS,
  alignTrajectoryPoints,
  formatAdaptiveTimeTick,
  calculateExtents,
  resolveEntityRecord,
  effectiveSource,
} from '../engine/core.ts';
import { templateState } from '../stores/templates.ts';
import type { TrajectoryPoint } from '../engine/core.ts';
const props = defineProps({
  control: { type: Object as PropType<Control>, required: true },
  template: { type: Object as PropType<ComponentTemplate>, required: true },
  instance: { type: Object as PropType<ComponentInstance>, required: true },
});

const page = usePageMode();

const hover = ref<number | null>(null);

const durationMs = computed(() => {
  if (props.control.props.lookbackUnit === 'second') {
    return (props.control.props.lookbackSeconds ?? 60) * 1000;
  }
  return (props.control.props.lookbackMinutes ?? 20) * 60 * 1000;
});

const minutes = computed(() => durationMs.value / 60000);

/**
 * 把历史点时间转换为坐标轴使用的时分文本。
 *
 * @param time - 时间戳，单位毫秒。
 * @returns 中文本地时间字符串。
 */
const timeLabel = (time: number) => formatAdaptiveTimeTick(time, durationMs.value);

const isGlobalMode = computed(
  () =>
    props.control.binding?.target === 'global' ||
    props.control.props.series?.some((s) => s.target === 'global'),
);

const isWorkshop = computed(
  () => page.mode === 'workshop' || props.instance.instanceId === 'preview',
);

// 自由双轴映射契约判定
const isFieldAxis = computed(
  () => props.control.props.xAxisMode === 'field' && !!props.control.props.xAxisField,
);

const xFieldName = computed(() => props.control.props.xAxisField || 'lon');

const xFieldSchema = computed(() => {
  const type =
    props.control.props.xAxisSchemaType || props.template.slots[0]?.schemaType || 'vessel';
  return dataState.schemas.find((s) => s.type === type);
});

const xFieldMeta = computed(() =>
  xFieldSchema.value?.fields.find((f) => f.key === xFieldName.value),
);

const series = computed(() =>
  (props.control.props.series ?? []).map((seriesItem, index) => {
    const isGlobal = seriesItem.target === 'global' || isGlobalMode.value;
    if (isGlobal) {
      const schemaType = seriesItem.schemaType || props.control.binding?.schemaType || 'port_stats';
      const schema = dataState.schemas.find((s) => s.type === schemaType);
      const field = schema?.fields.find((f) => f.key === seriesItem.field);
      const record = dataState.store.get(schemaType, '_global');
      const points = inWindow(
        record?.history[seriesItem.field] ?? [],
        dataState.now,
        minutes.value,
      );
      const lastPt = points.length && points.at(-1)?.value !== null ? points.at(-1)!.value : null;

      let label = seriesItem.label || field?.name || seriesItem.field || '全局指标';
      if (isWorkshop.value) {
        label = `【${label}】`;
      }

      return {
        ...seriesItem,
        id: '_global',
        label,
        yAxis: seriesItem.yAxis || 'left',
        unit: field?.unit ?? '',
        fieldName: field?.name ?? seriesItem.field,
        color: seriesItem.color ?? DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
        points,
        trajectoryPoints: [] as TrajectoryPoint[],
        latest:
          lastPt !== null ? (Number.isInteger(lastPt) ? String(lastPt) : lastPt.toFixed(1)) : null,
      };
    }

    const slot = props.template.slots.find((s) => s.id === seriesItem.slotId);
    const slotId = seriesItem.slotId ?? '';
    // 严格槽位来源权威原则：大屏槽位指派来源优先于设计态静态配置
    const preview = isWorkshop.value
      ? templateState.preview[`${props.control.id}:${slotId}`]
      : undefined;
    const activeSource =
      preview?.source !== null && preview?.source !== undefined
        ? preview.source
        : effectiveSource(props.instance, slotId, seriesItem.filterSource);
    let id = props.instance.slotBindings[slotId];
    if (preview) id = preview.target;
    const schemaType = slot?.schemaType ?? 'vessel';
    const schema = dataState.schemas.find((s) => s.type === schemaType);
    const targetRecord = id
      ? resolveEntityRecord(dataState.store, schemaType, id, activeSource, schema)
      : undefined;
    const field = schema?.fields.find((f) => f.key === seriesItem.field);

    let points = inWindow(
      targetRecord?.history[seriesItem.field] ?? [],
      dataState.now,
      minutes.value,
    );
    const lastPt = points.length && points.at(-1)?.value !== null ? points.at(-1)!.value : null;

    // 工坊脱敏：工坊模式下强制使用占位符别名展示，杜绝写死实体误解
    let label =
      seriesItem.label ||
      String(
        targetRecord?.data.vessel_name ??
          targetRecord?.data.batch_no ??
          (id || slot?.label || '未绑定对象'),
      );
    if (isWorkshop.value) {
      label = `【${slot?.label || '对象' + (index + 1)}】`;
    }
    if (activeSource || targetRecord?.data[schema?.sourceField ?? 'source']) {
      label += ` [${activeSource || targetRecord?.data[schema?.sourceField ?? 'source']}]`;
    }

    // 双轴时序航迹提取（O(N) 线性纯函数匹配）：每条曲线天然使用自身对象的 X 轴度量
    let trajectoryPoints: TrajectoryPoint[] = [];
    if (isFieldAxis.value) {
      if (targetRecord) {
        const xPoints = inWindow(
          targetRecord.history[xFieldName.value] ?? [],
          dataState.now,
          minutes.value,
        );
        trajectoryPoints = alignTrajectoryPoints(xPoints, points);
      }
    }

    return {
      ...seriesItem,
      id,
      label,
      yAxis: seriesItem.yAxis || 'left',
      unit: field?.unit ?? '',
      fieldName: field?.name ?? seriesItem.field,
      color: seriesItem.color ?? DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
      points,
      trajectoryPoints,
      latest:
        lastPt !== null ? (Number.isInteger(lastPt) ? String(lastPt) : lastPt.toFixed(1)) : null,
    };
  }),
);

// 左轴曲线与右轴曲线
const leftSeries = computed(() => series.value.filter((s) => s.yAxis !== 'right'));
const rightSeries = computed(() => series.value.filter((s) => s.yAxis === 'right'));
const hasRightAxis = computed(() => !isFieldAxis.value && rightSeries.value.length > 0);

// X 轴右边界与绘图区宽度
const plotRight = computed(() => (hasRightAxis.value ? 1130 : 1174));
const plotWidth = computed(() => plotRight.value - 58);

// 左 Y 轴范围（时序模式与自由双轴模式复用）
const leftExtents = computed(() => {
  if (isFieldAxis.value) {
    const allY = series.value.flatMap((s) => s.trajectoryPoints.map((p) => p.yVal));
    return calculateExtents(allY, true);
  }
  const targetSeries = leftSeries.value.length ? leftSeries.value : series.value;
  const allVals = targetSeries.flatMap((s) => s.points.map((p) => p.value));
  return calculateExtents(allVals, false);
});

// 右 Y 轴范围
const rightExtents = computed(() => {
  if (!hasRightAxis.value) return { min: 0, max: 10 };
  const allVals = rightSeries.value.flatMap((s) => s.points.map((p) => p.value));
  return calculateExtents(allVals, false);
});

const max = computed(() => leftExtents.value.max);
const min = computed(() => leftExtents.value.min);
const rightMax = computed(() => rightExtents.value.max);
const rightMin = computed(() => rightExtents.value.min);

const leftUnit = computed(() => leftSeries.value.find((s) => s.unit)?.unit || '');
const rightUnit = computed(() => rightSeries.value.find((s) => s.unit)?.unit || '');

const incompatible = computed(() => {
  if (isFieldAxis.value) return false;
  const leftUnits = new Set(leftSeries.value.map((s) => s.unit).filter(Boolean));
  const rightUnits = new Set(rightSeries.value.map((s) => s.unit).filter(Boolean));
  return leftUnits.size > 1 || rightUnits.size > 1;
});

// X 轴范围（自由双轴航迹模式）
const xExtents = computed(() => {
  if (!isFieldAxis.value) return { min: 0, max: 1 };
  const allX = series.value.flatMap((s) => s.trajectoryPoints.map((p) => p.xVal));
  return calculateExtents(allX, true);
});

// 坐标映射
/**
 * 将滑动时间窗口内的时间映射到 SVG 横坐标。
 *
 * @param time - 数据点时间戳，单位毫秒。
 * @returns SVG 逻辑横坐标。
 */
const x = (time: number) => {
  const startTime = dataState.now - durationMs.value;
  return 58 + ((time - startTime) / (durationMs.value || 1)) * plotWidth.value;
};

/**
 * 将时序曲线数值映射到 SVG 纵坐标，按指定轴的值域反向映射。
 *
 * @param value - 数据点数值。
 * @param isRight - 是否使用右轴值域。
 * @returns SVG 逻辑纵坐标。
 */
const y = (value: number, isRight = false) => {
  const ext = isRight ? rightExtents.value : leftExtents.value;
  return 284 - ((value - ext.min) / (ext.max - ext.min || 1)) * 238;
};

/**
 * 按字段值域将双轴航迹 X 值映射到 SVG 横坐标。
 *
 * @param xVal - 航迹 X 轴原始数值。
 * @returns SVG 逻辑横坐标。
 */
const mapFieldX = (xVal: number) =>
  58 +
  ((xVal - xExtents.value.min) / (xExtents.value.max - xExtents.value.min || 1)) * plotWidth.value;

/**
 * 按字段值域将双轴航迹 Y 值映射到 SVG 纵坐标。
 *
 * @param yVal - 航迹 Y 轴原始数值。
 * @returns SVG 逻辑纵坐标。
 */
const mapFieldY = (yVal: number) =>
  284 -
  ((yVal - leftExtents.value.min) / (leftExtents.value.max - leftExtents.value.min || 1)) * 238;

// 时序折线路径
/**
 * 将有序时序点拆成连续线段，遇到 null 或超出断线阈值时留白。
 *
 * @param points - 按时间升序排列的历史点。
 * @param isRight - 是否按右 Y 轴进行纵坐标映射。
 * @returns 各连续段的折线路径、面积路径和末点坐标。
 */
const paths = (points: Point[], isRight = false) => {
  const result: { d: string; areaD: string; lastX: number; lastY: number }[] = [];
  let current: Point[] = [];
  const flush = () => {
    if (current.length) {
      const lineD = current
        .map(
          (p, i) =>
            `${i ? 'L' : 'M'} ${x(p.timestamp).toFixed(2)} ${y(p.value!, isRight).toFixed(2)}`,
        )
        .join(' ');
      const firstX = x(current[0].timestamp).toFixed(2);
      const lastX = x(current.at(-1)!.timestamp).toFixed(2);
      const areaD = `${lineD} L ${lastX} 284 L ${firstX} 284 Z`;
      result.push({
        d: lineD,
        areaD,
        lastX: Number(lastX),
        lastY: y(current.at(-1)!.value!, isRight),
      });
    }
    current = [];
  };
  for (const point of points) {
    if (point.value === null) {
      flush();
      continue;
    }
    if (
      current.length &&
      point.timestamp - current.at(-1)!.timestamp > (props.control.props.gapSeconds ?? 120) * 1000
    )
      flush();
    current.push(point);
  }
  flush();
  return result;
};

// 空间航迹路径（按时间顺序连接采样对）
/**
 * 按时间排序双轴航迹，生成 SVG 路径及最新坐标标记。
 *
 * @param s - 包含已对齐 trajectoryPoints 的曲线数据。
 * @returns 路径、最新点屏幕坐标和原始 X/Y 值；无航迹点时返回 null。
 */
const trajectoryPath = (s: { trajectoryPoints: TrajectoryPoint[] }) => {
  const tPoints = s.trajectoryPoints;
  if (!tPoints || !tPoints.length) return null;
  const sorted = [...tPoints].sort((a, b) => a.timestamp - b.timestamp);
  const d = sorted
    .map(
      (p, i) => `${i ? 'L' : 'M'} ${mapFieldX(p.xVal).toFixed(2)} ${mapFieldY(p.yVal).toFixed(2)}`,
    )
    .join(' ');
  const last = sorted.at(-1);
  if (!last) return null;
  return {
    d,
    lastX: Number(mapFieldX(last.xVal).toFixed(2)),
    lastY: Number(mapFieldY(last.yVal).toFixed(2)),
    lastXVal: last.xVal,
    lastYVal: last.yVal,
  };
};

const pointCount = computed(() => {
  if (isFieldAxis.value) {
    return series.value.reduce((n, s) => n + s.trajectoryPoints.length, 0);
  }
  return series.value.reduce((n, s) => n + s.points.length, 0);
});

const lookbackText = computed(() => {
  if (props.control.props.lookbackUnit === 'second') {
    const s = props.control.props.lookbackSeconds ?? 60;
    return s >= 60 && s % 60 === 0 ? `${s / 60} 分钟` : `${s} 秒`;
  }
  return `${minutes.value} 分钟`;
});

const tooltip = computed(() => {
  if (hover.value === null) return [];
  if (isFieldAxis.value) {
    const targetX = xExtents.value.min + hover.value * (xExtents.value.max - xExtents.value.min);
    return series.value.map((s) => {
      const nearest = s.trajectoryPoints.reduce<TrajectoryPoint | null>(
        (best, p) =>
          !best || Math.abs(p.xVal - targetX) < Math.abs(best.xVal - targetX) ? p : best,
        null,
      );
      return {
        label: s.label,
        color: s.color,
        value: nearest ? `X:${nearest.xVal.toFixed(2)} / Y:${nearest.yVal.toFixed(2)}` : '--',
      };
    });
  }
  const target = dataState.now - (1 - hover.value) * durationMs.value;
  const timeThreshold = Math.max(2000, durationMs.value / 20);
  return series.value.map((s) => {
    const nearest = s.points.reduce<Point | null>(
      (best, p) =>
        !best || Math.abs(p.timestamp - target) < Math.abs(best.timestamp - target) ? p : best,
      null,
    );
    const axisTag = hasRightAxis.value ? (s.yAxis === 'right' ? ' [右轴]' : ' [左轴]') : '';
    return {
      label: s.label + axisTag,
      color: s.color,
      value:
        nearest && Math.abs(nearest.timestamp - target) <= timeThreshold && nearest.value !== null
          ? `${nearest.value.toFixed(1)} ${s.unit}`
          : '--',
    };
  });
});

/**
 * 将鼠标在 SVG 中的位置转换为绘图区内的悬停比例。
 *
 * @param event - 图表鼠标移动事件，使用 currentTarget 获取 SVG 显示边界。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function move(event: MouseEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect();
  hover.value = Math.max(
    0,
    Math.min(1, (((event.clientX - box.left) / box.width) * 1200 - 58) / plotWidth.value),
  );
}

const currentHeight = computed(() => {
  const ratio = props.instance.position.h / (props.template.layout.height || 1);
  return (props.control.style.h ?? 220) * (ratio || 1);
});

const isCompact = computed(() => currentHeight.value < 135);

/**
 * 生成字段横轴五个等距刻度的标签，使用字段精度和单位。
 *
 * @param n - 从 1 到 5 的刻度序号。
 * @returns 格式化后的刻度值及可选单位。
 */
const xFieldLabel = (n: number) => {
  const val = xExtents.value.min + ((n - 1) / 4) * (xExtents.value.max - xExtents.value.min);
  const prec = xFieldMeta.value?.precision ?? 2;
  return `${val.toFixed(prec)}${xFieldMeta.value?.unit ? ' ' + xFieldMeta.value.unit : ''}`;
};
</script>
<template>
  <div
    class="line-chart"
    :class="{ 'is-compact': isCompact, 'is-trajectory-chart': isFieldAxis }"
  >
    <div class="chart-meta">
      <span v-if="isFieldAxis">
        双轴航迹 <i>·</i> X: {{ xFieldMeta?.name || xFieldName }} <i>·</i> Y:
        {{ series[0]?.fieldName || '未配置' }}
        <span
          v-if="isWorkshop"
          class="workshop-chart-hint"
          >模具预览中 · 实际实体在投屏大屏中指派</span
        >
      </span>
      <span v-else>
        近 {{ lookbackText }} <i>·</i>
        <template v-if="hasRightAxis">
          左轴: {{ leftUnit || '数值' }} <i>·</i> 右轴: {{ rightUnit || '数值' }}
        </template>
        <template v-else>
          {{ series[0]?.fieldName || '未配置字段' }}（{{ series[0]?.unit || '数值' }}）
        </template>
        <span
          v-if="isWorkshop"
          class="workshop-chart-hint"
          >模具预览中 · 实际实体在投屏大屏中指派</span
        >
      </span>
      <div class="chart-legend">
        <span
          v-for="(s, index) in series"
          :key="index"
        >
          <b :style="{ background: s.color }"></b>{{ s.label }}
          <span
            v-if="hasRightAxis"
            class="axis-tag"
            >{{ s.yAxis === 'right' ? '右' : '左' }}</span
          >
          <template v-if="s.latest !== null && !isFieldAxis">
            <i style="font-style: normal; margin-left: 4px; color: #dbf4ff"
              >{{ s.latest }} {{ s.unit }}</i
            >
          </template>
        </span>
      </div>
    </div>
    <div class="chart-plot">
      <svg
        viewBox="0 0 1200 332"
        preserveAspectRatio="none"
        role="img"
        :aria-label="isFieldAxis ? '双轴轨迹空间折线图' : '基于实际接收时间点绘制的时序曲线'"
        @mousemove="move"
        @mouseleave="hover = null"
      >
        <defs>
          <linearGradient
            v-for="(s, index) in series"
            :id="'areaGrad-' + index"
            :key="'grad-' + index"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              :stop-color="s.color"
              stop-opacity="0.3"
            />
            <stop
              offset="100%"
              :stop-color="s.color"
              stop-opacity="0.0"
            />
          </linearGradient>
        </defs>
        <!-- Y 轴顶部量纲单位说明 -->
        <text
          v-if="leftUnit"
          x="54"
          y="34"
          text-anchor="end"
          class="chart-axis-unit"
        >
          ({{ leftUnit }})
        </text>
        <text
          v-if="hasRightAxis && rightUnit"
          :x="plotRight + 12"
          y="34"
          text-anchor="start"
          class="chart-axis-unit"
        >
          ({{ rightUnit }})
        </text>

        <!-- Y 轴网格与刻度 -->
        <g
          v-for="n in 6"
          :key="'y' + n"
        >
          <line
            x1="58"
            :y1="46 + (n - 1) * 47.6"
            :x2="plotRight"
            :y2="46 + (n - 1) * 47.6"
            class="chart-grid"
          />
          <text
            x="43"
            :y="51 + (n - 1) * 47.6"
            text-anchor="end"
          >
            {{ (max - ((max - min) * (n - 1)) / 5).toFixed(isFieldAxis ? 2 : 0) }}
          </text>
          <text
            v-if="hasRightAxis"
            :x="plotRight + 12"
            :y="51 + (n - 1) * 47.6"
            text-anchor="start"
            fill="#8ebad9"
          >
            {{ (rightMax - ((rightMax - rightMin) * (n - 1)) / 5).toFixed(0) }}
          </text>
        </g>
        <!-- X 轴网格与刻度（时间轴或数值字段刻度） -->
        <g
          v-for="n in 5"
          :key="'x' + n"
        >
          <line
            :x1="58 + (n - 1) * (plotWidth / 4)"
            y1="46"
            :x2="58 + (n - 1) * (plotWidth / 4)"
            y2="284"
            class="chart-grid vertical"
          />
          <text
            :x="58 + (n - 1) * (plotWidth / 4)"
            y="316"
            :text-anchor="n === 1 ? 'start' : n === 5 ? 'end' : 'middle'"
          >
            {{
              isFieldAxis ? xFieldLabel(n) : timeLabel(dataState.now - (5 - n) * (durationMs / 4))
            }}
          </text>
        </g>
        <!-- 坐标轴物理基线：左 Y 轴基线、右 Y 轴基线（双轴时渲染）与 X 轴底线 -->
        <line
          x1="58"
          y1="46"
          x2="58"
          y2="284"
          stroke="#24547B"
        />
        <line
          v-if="hasRightAxis"
          :x1="plotRight"
          y1="46"
          :x2="plotRight"
          y2="284"
          stroke="#24547B"
        />
        <line
          x1="58"
          y1="284"
          :x2="plotRight"
          y2="284"
          stroke="#24547B"
        />

        <!-- 航迹模式渲染 -->
        <template v-if="isFieldAxis">
          <g
            v-for="(s, index) in series"
            :key="'traj-' + index"
          >
            <g
              v-for="traj in [trajectoryPath(s)]"
              :key="'tp-' + index"
            >
              <template v-if="traj">
                <path
                  :d="traj.d"
                  fill="none"
                  :stroke="s.color"
                  stroke-width="3"
                  class="trajectory-line"
                  vector-effect="non-scaling-stroke"
                />
                <!-- 最新点脉冲发光动效 -->
                <circle
                  class="trajectory-pulse"
                  :cx="traj.lastX"
                  :cy="traj.lastY"
                  r="5"
                  :fill="s.color"
                />
                <circle
                  :cx="traj.lastX"
                  :cy="traj.lastY"
                  r="3.5"
                  fill="#FFF"
                />
              </template>
            </g>
          </g>
        </template>

        <!-- 标准时序模式渲染 -->
        <template v-else-if="!incompatible">
          <g
            v-for="(s, index) in series"
            :key="index"
          >
            <g
              v-for="(path, p) in paths(s.points, s.yAxis === 'right')"
              :key="p"
            >
              <path
                v-if="series.length === 1 || isGlobalMode || s.target === 'global'"
                :d="path.areaD"
                :fill="'url(#areaGrad-' + index + ')'"
              />
              <path
                :d="path.d"
                fill="none"
                :stroke="s.color"
                stroke-width="2.5"
                vector-effect="non-scaling-stroke"
              />
              <circle
                :cx="path.lastX"
                :cy="path.lastY"
                r="3.4"
                :fill="s.color"
              />
            </g>
          </g>
        </template>

        <line
          v-if="hover !== null"
          :x1="58 + hover * plotWidth"
          y1="46"
          :x2="58 + hover * plotWidth"
          y2="284"
          stroke="#7295B5"
          stroke-dasharray="4 5"
        />
      </svg>
      <div
        v-if="incompatible || !pointCount"
        class="chart-empty"
      >
        <span class="empty-cross">＋</span>
        <strong>{{
          incompatible
            ? '请为同一轴向配置相同单位的字段'
            : isFieldAxis
              ? '等待双轴采样点位对齐'
              : '等待累计时序数据'
        }}</strong>
        <span>{{
          isFieldAxis
            ? '需至少存在有效的时间对齐经纬度或数值采样'
            : '初始底账不包含历史，尚未采集的区间保持留白'
        }}</span>
      </div>
      <div
        v-if="hover !== null && pointCount"
        class="chart-tooltip"
        :style="{ left: Math.min(hover * 80, 70) + '%' }"
      >
        <strong>{{
          isFieldAxis ? '当前光标位置' : timeLabel(dataState.now - (1 - hover) * durationMs)
        }}</strong>
        <div
          v-for="s in tooltip"
          :key="s.label"
        >
          <span :style="{ color: s.color }">{{ s.label }}</span>
          <b>{{ s.value }}</b>
        </div>
      </div>
    </div>
    <div class="chart-foot">
      <span class="tiny-dot"></span>
      {{ isFieldAxis ? '按时间顺次连线 · 末端发光点指示最新位置' : '实际采样 · 缺值和断流不连线' }}
      <span
        >{{ pointCount }} 个采样点{{
          isWorkshop ? ' · 模具预览模式' : ' · 历史不足的区间保持留白'
        }}</span
      >
    </div>
  </div>
</template>
