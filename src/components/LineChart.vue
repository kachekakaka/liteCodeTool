<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control, Point } from '../types.ts';
import { state } from '../runtime.ts';
import { inWindow, DEFAULT_CHART_COLORS } from '../engine/core.ts';

interface TrajectoryPoint {
  xVal: number;
  yVal: number;
  timestamp: number;
}

export default defineComponent({
  props: { control: { type: Object as PropType<Control>, required: true }, template: { type: Object as PropType<ComponentTemplate>, required: true }, instance: { type: Object as PropType<ComponentInstance>, required: true } },
  setup(props) {
    const hover = ref<number | null>(null);
    const minutes = computed(() => props.control.props.lookbackMinutes ?? 20);
    const timeLabel = (time: number) => new Date(time).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const isGlobalMode = computed(() => props.control.binding?.target === 'global' || props.control.props.series?.some(s => s.target === 'global'));
    const isWorkshop = computed(() => state.view === 'workshop' || props.instance.instanceId === 'preview');

    // 自由双轴映射契约判定
    const isFieldAxis = computed(() => props.control.props.xAxisMode === 'field' && !!props.control.props.xAxisField);
    const xFieldName = computed(() => props.control.props.xAxisField || 'lon');
    const xFieldSchema = computed(() => {
      const type = props.control.props.xAxisSchemaType || props.template.slots[0]?.schemaType || 'vessel';
      return state.schemas.find(s => s.type === type);
    });
    const xFieldMeta = computed(() => xFieldSchema.value?.fields.find(f => f.key === xFieldName.value));

    const series = computed(() => (props.control.props.series ?? []).map((seriesItem, index) => {
      const isGlobal = seriesItem.target === 'global' || isGlobalMode.value;
      if (isGlobal) {
        const schemaType = seriesItem.schemaType || props.control.binding?.schemaType || 'port_stats';
        const schema = state.schemas.find(s => s.type === schemaType);
        const field = schema?.fields.find(f => f.key === seriesItem.field);
        const record = state.store.get(schemaType, '_global');
        const points = inWindow(record?.history[seriesItem.field] ?? [], state.now, minutes.value);
        const lastPt = points.length && points.at(-1)?.value !== null ? points.at(-1)!.value : null;
        
        let label = seriesItem.label || field?.name || seriesItem.field || '全局指标';
        if (isWorkshop.value) {
          label = `【${label}】`;
        }

        return {
          ...seriesItem,
          id: '_global',
          label,
          unit: field?.unit ?? '',
          fieldName: field?.name ?? seriesItem.field,
          color: seriesItem.color ?? DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
          points,
          trajectoryPoints: [] as TrajectoryPoint[],
          latest: lastPt !== null ? (Number.isInteger(lastPt) ? String(lastPt) : lastPt.toFixed(1)) : null
        };
      }

      const slot = props.template.slots.find(s => s.id === seriesItem.slotId);
      const id = props.instance.slotBindings[seriesItem.slotId ?? ''];
      const field = state.schemas.find(s => s.type === slot?.schemaType)?.fields.find(f => f.key === seriesItem.field);
      const record = id ? state.store.get(slot?.schemaType, id) : undefined;
      const points = inWindow(record?.history[seriesItem.field] ?? [], state.now, minutes.value);
      const lastPt = points.length && points.at(-1)?.value !== null ? points.at(-1)!.value : null;

      // 工坊脱敏：工坊模式下强制使用占位符别名展示，杜绝写死实体误解
      let label = seriesItem.label || String(record?.data.vessel_name ?? (id || slot?.label || '未绑定对象'));
      if (isWorkshop.value) {
        label = `【${slot?.label || '对象' + (index + 1)}】`;
      }

      // 双轴时序航迹提取
      const trajectoryPoints: TrajectoryPoint[] = [];
      if (isFieldAxis.value && record) {
        const xPoints = inWindow(record.history[xFieldName.value] ?? [], state.now, minutes.value);
        const yPoints = points;
        // 按时间戳顺序将 x 与 y 对齐（容差 5 秒内）
        for (const yPt of yPoints) {
          if (yPt.value === null) continue;
          let bestX: Point | null = null;
          let bestDiff = 5000;
          for (const xPt of xPoints) {
            if (xPt.value === null) continue;
            const diff = Math.abs(xPt.timestamp - yPt.timestamp);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestX = xPt;
            }
          }
          if (bestX && bestX.value !== null) {
            trajectoryPoints.push({
              xVal: bestX.value,
              yVal: yPt.value,
              timestamp: yPt.timestamp
            });
          }
        }
      }

      return {
        ...seriesItem,
        id,
        label,
        unit: field?.unit ?? '',
        fieldName: field?.name ?? seriesItem.field,
        color: seriesItem.color ?? DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
        points,
        trajectoryPoints,
        latest: lastPt !== null ? (Number.isInteger(lastPt) ? String(lastPt) : lastPt.toFixed(1)) : null
      };
    }));

    const incompatible = computed(() => !isFieldAxis.value && new Set(series.value.map(s => s.unit)).size > 1);

    // Y 轴范围（时序模式与自由双轴模式复用）
    const yExtents = computed(() => {
      if (isFieldAxis.value) {
        const allY = series.value.flatMap(s => s.trajectoryPoints.map(p => p.yVal));
        if (!allY.length) return { min: 0, max: 10 };
        const rawMin = Math.min(...allY);
        const rawMax = Math.max(...allY);
        const span = rawMax - rawMin || (Math.abs(rawMax) * 0.1 || 1);
        return { min: rawMin - span * 0.08, max: rawMax + span * 0.08 };
      }
      const maxVal = Math.max(5, Math.ceil(series.value.reduce((a, s) => s.points.reduce((n, p) => Math.max(n, p.value ?? 0), a), 0) / 5) * 5);
      const minVal = Math.min(0, Math.floor(series.value.reduce((a, s) => s.points.reduce((n, p) => Math.min(n, p.value ?? 0), a), 0) / 5) * 5);
      return { min: minVal, max: maxVal };
    });

    const max = computed(() => yExtents.value.max);
    const min = computed(() => yExtents.value.min);

    // X 轴范围（自由双轴航迹模式）
    const xExtents = computed(() => {
      if (!isFieldAxis.value) return { min: 0, max: 1 };
      const allX = series.value.flatMap(s => s.trajectoryPoints.map(p => p.xVal));
      if (!allX.length) return { min: 0, max: 10 };
      const rawMin = Math.min(...allX);
      const rawMax = Math.max(...allX);
      const span = rawMax - rawMin || (Math.abs(rawMax) * 0.1 || 1);
      return { min: rawMin - span * 0.08, max: rawMax + span * 0.08 };
    });

    // 坐标映射
    const x = (time: number) => 58 + ((time - (state.now - minutes.value * 60000)) / (minutes.value * 60000)) * 1116;
    const y = (value: number) => 284 - ((value - min.value) / (max.value - min.value || 1)) * 238;

    const mapFieldX = (xVal: number) => 58 + ((xVal - xExtents.value.min) / (xExtents.value.max - xExtents.value.min || 1)) * 1116;
    const mapFieldY = (yVal: number) => 284 - ((yVal - yExtents.value.min) / (yExtents.value.max - yExtents.value.min || 1)) * 238;

    // 时序折线路径
    const paths = (points: Point[]) => {
      const result: { d: string; areaD: string; lastX: number; lastY: number }[] = [];
      let current: Point[] = [];
      const flush = () => {
        if (current.length) {
          const lineD = current.map((p, i) => `${i ? 'L' : 'M'} ${x(p.timestamp).toFixed(2)} ${y(p.value!).toFixed(2)}`).join(' ');
          const firstX = x(current[0].timestamp).toFixed(2);
          const lastX = x(current.at(-1)!.timestamp).toFixed(2);
          const areaD = `${lineD} L ${lastX} 284 L ${firstX} 284 Z`;
          result.push({ d: lineD, areaD, lastX: Number(lastX), lastY: y(current.at(-1)!.value!) });
        }
        current = [];
      };
      for (const point of points) {
        if (point.value === null) { flush(); continue; }
        if (current.length && point.timestamp - current.at(-1)!.timestamp > (props.control.props.gapSeconds ?? 120) * 1000) flush();
        current.push(point);
      }
      flush();
      return result;
    };

    // 空间航迹路径（按时间顺序连接采样对）
    const trajectoryPath = (s: { trajectoryPoints: TrajectoryPoint[] }) => {
      const tPoints = s.trajectoryPoints;
      if (!tPoints || !tPoints.length) return null;
      const sorted = [...tPoints].sort((a, b) => a.timestamp - b.timestamp);
      const d = sorted.map((p, i) => `${i ? 'L' : 'M'} ${mapFieldX(p.xVal).toFixed(2)} ${mapFieldY(p.yVal).toFixed(2)}`).join(' ');
      const last = sorted.at(-1);
      if (!last) return null;
      return {
        d,
        lastX: Number(mapFieldX(last.xVal).toFixed(2)),
        lastY: Number(mapFieldY(last.yVal).toFixed(2)),
        lastXVal: last.xVal,
        lastYVal: last.yVal
      };
    };

    const pointCount = computed(() => {
      if (isFieldAxis.value) {
        return series.value.reduce((n, s) => n + s.trajectoryPoints.length, 0);
      }
      return series.value.reduce((n, s) => n + s.points.length, 0);
    });

    const tooltip = computed(() => {
      if (hover.value === null) return [];
      if (isFieldAxis.value) {
        const targetX = xExtents.value.min + hover.value * (xExtents.value.max - xExtents.value.min);
        return series.value.map(s => {
          const nearest = s.trajectoryPoints.reduce<TrajectoryPoint | null>((best, p) => !best || Math.abs(p.xVal - targetX) < Math.abs(best.xVal - targetX) ? p : best, null);
          return {
            label: s.label,
            color: s.color,
            value: nearest ? `X:${nearest.xVal.toFixed(2)} / Y:${nearest.yVal.toFixed(2)}` : '--'
          };
        });
      }
      const target = state.now - (1 - hover.value) * minutes.value * 60000;
      return series.value.map(s => {
        const nearest = s.points.reduce<Point | null>((best, p) => !best || Math.abs(p.timestamp - target) < Math.abs(best.timestamp - target) ? p : best, null);
        return {
          label: s.label,
          color: s.color,
          value: nearest && Math.abs(nearest.timestamp - target) < 30000 && nearest.value !== null ? `${nearest.value.toFixed(1)} ${s.unit}` : '--'
        };
      });
    });

    function move(event: MouseEvent) {
      const box = (event.currentTarget as SVGElement).getBoundingClientRect();
      hover.value = Math.max(0, Math.min(1, ((event.clientX - box.left) / box.width * 1200 - 58) / 1116));
    }

    const currentHeight = computed(() => {
      const ratio = props.instance.position.h / (props.template.layout.height || 1);
      return (props.control.style.h ?? 220) * (ratio || 1);
    });
    const isCompact = computed(() => currentHeight.value < 135);

    const xFieldLabel = (n: number) => {
      const val = xExtents.value.min + ((n - 1) / 4) * (xExtents.value.max - xExtents.value.min);
      const prec = xFieldMeta.value?.precision ?? 2;
      return `${val.toFixed(prec)}${xFieldMeta.value?.unit ? ' ' + xFieldMeta.value.unit : ''}`;
    };

    return {
      isCompact, state, minutes, timeLabel, isGlobalMode, isWorkshop,
      isFieldAxis, xFieldName, xFieldMeta, xFieldLabel,
      series, max, min, xExtents, paths, trajectoryPath, pointCount, incompatible, hover, tooltip, move, y, mapFieldY
    };
  }
});
</script>
<template>
  <div class="line-chart" :class="{ 'is-compact': isCompact, 'is-trajectory-chart': isFieldAxis }">
    <div class="chart-meta">
      <span v-if="isFieldAxis">
        双轴航迹 <i>·</i> X: {{ xFieldMeta?.name || xFieldName }} <i>·</i> Y: {{ series[0]?.fieldName || '未配置' }}
        <span v-if="isWorkshop" class="workshop-chart-hint">模具预览中</span>
      </span>
      <span v-else>
        近 {{ minutes }} 分钟 <i>·</i> {{ series[0]?.fieldName || '未配置字段' }}（{{ series[0]?.unit || '数值' }}）
        <span v-if="isWorkshop" class="workshop-chart-hint">模具预览中</span>
      </span>
      <div class="chart-legend">
        <span v-for="(s, index) in series" :key="index">
          <b :style="{ background: s.color }"></b>{{ s.label }}
          <template v-if="s.latest !== null && !isFieldAxis">
            <i style="font-style:normal;margin-left:4px;color:#DBF4FF">{{ s.latest }} {{ s.unit }}</i>
          </template>
        </span>
      </div>
    </div>
    <div class="chart-plot">
      <svg viewBox="0 0 1200 332" preserveAspectRatio="none" role="img" :aria-label="isFieldAxis ? '双轴轨迹空间折线图' : '基于实际接收时间点绘制的时序曲线'" @mousemove="move" @mouseleave="hover = null">
        <defs>
          <linearGradient v-for="(s, index) in series" :id="'areaGrad-' + index" :key="'grad-' + index" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :stop-color="s.color" stop-opacity="0.3" />
            <stop offset="100%" :stop-color="s.color" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <!-- Y 轴网格与刻度 -->
        <g v-for="n in 6" :key="'y'+n">
          <line x1="58" :y1="46+(n-1)*47.6" x2="1174" :y2="46+(n-1)*47.6" class="chart-grid"/>
          <text x="43" :y="51+(n-1)*47.6" text-anchor="end">{{ (max-(max-min)*(n-1)/5).toFixed(isFieldAxis ? 2 : 0) }}</text>
        </g>
        <!-- X 轴网格与刻度（时间轴或数值字段刻度） -->
        <g v-for="n in 5" :key="'x'+n">
          <line :x1="58+(n-1)*279" y1="46" :x2="58+(n-1)*279" y2="284" class="chart-grid vertical"/>
          <text :x="58+(n-1)*279" y="316" :text-anchor="n===1?'start':n===5?'end':'middle'">
            {{ isFieldAxis ? xFieldLabel(n) : timeLabel(state.now-(5-n)*minutes*15000) }}
          </text>
        </g>
        <line x1="58" y1="284" x2="1174" y2="284" stroke="#24547B"/>

        <!-- 航迹模式渲染 -->
        <template v-if="isFieldAxis">
          <g v-for="(s, index) in series" :key="'traj-'+index">
            <g v-for="traj in [trajectoryPath(s)]" :key="'tp-'+index">
              <template v-if="traj">
                <path :d="traj.d" fill="none" :stroke="s.color" stroke-width="3" class="trajectory-line" vector-effect="non-scaling-stroke"/>
                <!-- 最新点脉冲发光动效 -->
                <circle class="trajectory-pulse" :cx="traj.lastX" :cy="traj.lastY" r="5" :fill="s.color" />
                <circle :cx="traj.lastX" :cy="traj.lastY" r="3.5" fill="#FFF" />
              </template>
            </g>
          </g>
        </template>

        <!-- 标准时序模式渲染 -->
        <template v-else-if="!incompatible">
          <g v-for="(s, index) in series" :key="index">
            <g v-for="(path, p) in paths(s.points)" :key="p">
              <path v-if="series.length === 1 || isGlobalMode || s.target === 'global'" :d="path.areaD" :fill="'url(#areaGrad-' + index + ')'" />
              <path :d="path.d" fill="none" :stroke="s.color" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
              <circle :cx="path.lastX" :cy="path.lastY" r="3.4" :fill="s.color"/>
            </g>
          </g>
        </template>

        <line v-if="hover !== null" :x1="58+hover*1116" y1="46" :x2="58+hover*1116" y2="284" stroke="#7295B5" stroke-dasharray="4 5"/>
      </svg>
      <div v-if="incompatible || !pointCount" class="chart-empty">
        <span class="empty-cross">＋</span>
        <strong>{{ incompatible ? '请为对比曲线配置相同单位的字段' : isFieldAxis ? '等待双轴采样点位对齐' : '等待累计时序数据' }}</strong>
        <span>{{ isFieldAxis ? '需至少存在有效的时间对齐经纬度或数值采样' : '初始底账不包含历史，尚未采集的区间保持留白' }}</span>
      </div>
      <div v-if="hover !== null && pointCount" class="chart-tooltip" :style="{ left: Math.min(hover*80, 70)+'%' }">
        <strong>{{ isFieldAxis ? '当前光标位置' : timeLabel(state.now-(1-hover)*minutes*60000) }}</strong>
        <div v-for="s in tooltip" :key="s.label">
          <span :style="{ color: s.color }">{{ s.label }}</span>
          <b>{{ s.value }}</b>
        </div>
      </div>
    </div>
    <div class="chart-foot">
      <span class="tiny-dot"></span>
      {{ isFieldAxis ? '按时间顺次连线 · 末端发光点指示最新位置' : '实际采样 · 缺值和断流不连线' }}
      <span>{{ pointCount }} 个采样点{{ isWorkshop ? ' · 模具预览模式' : ' · 历史不足的区间保持留白' }}</span>
    </div>
  </div>
</template>
