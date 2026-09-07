<script lang="ts">
import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control, Field } from '../types.ts';
import { effectiveControl, formatScalar, isRecordStale, resolveValue, safeImageUrl } from '../engine/core.ts';
import { state, checkpoint } from '../runtime.ts';
import LineChart from './LineChart.vue';
export default defineComponent({
  components: { LineChart },
  props: { control: { type: Object as PropType<Control>, required: true }, template: { type: Object as PropType<ComponentTemplate>, required: true }, instance: { type: Object as PropType<ComponentInstance>, required: true } },
  setup(props) {
    const c = computed(() => effectiveControl(props.control, props.instance));
    const value = computed(() => resolveValue(props.control, props.template, props.instance, state.store, state.schemas, state.now));
    const statusColor = computed(() => c.value.props.colorRules?.find(r => r.value === value.value.raw)?.color ?? '#7995B1');
    const tableSchema = computed(() => state.schemas.find(s => s.type === c.value.props.schemaType));
    const columns = computed(() => (c.value.props.columns ?? []).map(key => tableSchema.value?.fields.find(f => f.key === key)).filter((field): field is Field => !!field));
    const rows = computed(() => state.store.list(c.value.props.schemaType ?? '').filter(({ record }) => !c.value.props.filterField || record.data[c.value.props.filterField] === c.value.props.filterValue).sort((a, b) => a.id.localeCompare(b.id)));
    const page = ref(0), pageSize = computed(() => Math.max(1, Math.min(20, c.value.props.pageSize ?? 4)));
    const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)));
    watch(pageCount, count => { if (page.value >= count) page.value = count - 1; });
    const tableHover = ref(false); let pager: ReturnType<typeof setInterval> | undefined; let lastPage = Date.now();
    onMounted(()=>{if(c.value.type!=='table')return;pager=setInterval(()=>{const seconds=c.value.props.autoPageSeconds ?? 0;if(state.view==='viewer' && seconds>0 && !tableHover.value && pageCount.value>1 && !document.hidden && Date.now()-lastPage>=seconds*1000){page.value=(page.value+1)%pageCount.value;lastPage=Date.now();}},1000);});
    onUnmounted(()=>{if(pager)clearInterval(pager);});
    watch(tableHover,()=>{lastPage=Date.now();});
    const shown = computed(() => rows.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value));
    const image = computed(() => safeImageUrl(c.value.props.sourceMode === 'dynamic' ? String(value.value.raw ?? '') : c.value.props.imageUrl ?? ''));
    const imageFailed = ref(false); watch(image, () => { imageFailed.value = false; });
    const stamp = computed(() => value.value.timestamp === null ? '' : new Date(value.value.timestamp).toLocaleTimeString('zh-CN', { hour12: false }));
    const statusClass = (value: unknown) => value==='告警'?'cell-danger':value==='在航'||value==='巡航'?'cell-ok':value==='作业'?'cell-warning':'';
    const staleEnabled = computed(() => c.value.props.staleEnabled !== false);
    const staleSeconds = computed(() => c.value.props.staleSeconds ?? 120);
    const isRowStale = (record: any) => staleEnabled.value && isRecordStale(record, staleSeconds.value, state.now);
    const editingText = ref(false);
    const textDraft = ref('');
    const textInputRef = ref<HTMLInputElement | null>(null);
    function startEditText() {
      if (c.value.props.sourceMode === 'dynamic' || c.value.props.clock) return;
      editingText.value = true;
      textDraft.value = String(c.value.props.staticValue ?? value.value.value ?? '');
      nextTick(() => {
        textInputRef.value?.focus();
        textInputRef.value?.select();
      });
    }
    function commitText() {
      if (!editingText.value) return;
      editingText.value = false;
      const next = textDraft.value.trim();
      const fallback = (c.value.props.staticValue ?? props.control.props.staticValue ?? '请输入内容') + '';
      const finalValue = next || fallback;
      textDraft.value = finalValue;
      if (state.view === 'workshop') {
        props.control.props.staticValue = finalValue;
      } else {
        checkpoint();
        const old = props.instance.controlOverrides[props.control.id] ?? {};
        props.instance.controlOverrides[props.control.id] = {
          ...old,
          props: { ...old.props, staticValue: finalValue }
        };
      }
    }
    function cancelText() {
      editingText.value = false;
      textDraft.value = (c.value.props.staticValue ?? value.value.value ?? '') + '';
    }
    return { textInputRef, editingText, textDraft, startEditText, commitText, cancelText, tableHover, statusClass, state, c, value, statusColor, columns, rows, page, pageSize, pageCount, shown, image, imageFailed, stamp, formatScalar, isRowStale };
  }
});
</script>
<template>
  <div class="atomic" :class="['atomic-'+c.type, { 'is-stale': value.stale, 'atomic-kpi': c.props.variant==='kpi' }]" @mouseenter="tableHover=true" @mouseleave="tableHover=false">
    <template v-if="c.type==='number'"><span v-if="c.props.variant==='kpi'&&c.props.iconType!=='none'" class="kpi-emblem" aria-hidden="true"><img v-if="c.props.imageUrl" :src="c.props.imageUrl" alt="KPI 徽标"/><svg v-else viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="35" stroke="currentColor" opacity=".18"/><circle cx="40" cy="40" r="29" stroke="currentColor" stroke-dasharray="30 130" opacity=".45"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><template v-if="c.props.iconType==='alert'"><path d="M40 21L61 57H19Z"/><path d="M40 33V43"/><circle cx="40" cy="50" r="1"/></template><template v-else><path d="M20 45L40 39L60 45L54 55H26Z"/><path d="M25 61Q33 55 40 61Q48 55 56 61"/><path v-if="c.props.iconType==='cargo'" d="M26 43V29H54V43M35 29V40M44 29V40M26 35H54"/><path v-else-if="c.props.iconType==='fishing'" d="M31 41V32H45V41M39 32V20L55 32H39"/><path v-else d="M29 42V31H51V42M34 31V24H46V31M40 24V18"/></template></g></svg></span><div class="number-label">{{ value.label }}</div><div class="number-line"><strong>{{ value.value }}</strong><span>{{ value.unit }}</span></div><div class="number-caption" :class="{ 'quality-warning': value.stale }">{{ value.empty ? '暂无数据' : value.stale ? '已过期 · '+stamp : value.timestamp ? '最新上报 '+stamp : '固定值' }}</div></template>
    <template v-else-if="c.type==='text'">
      <input v-if="editingText" ref="textInputRef" v-model="textDraft" class="inline-title-input inline-text-input" placeholder="请输入文本内容" autofocus @keydown.enter.stop="commitText" @keydown.esc.stop="cancelText" @blur="commitText" @pointerdown.stop @click.stop @dblclick.stop @dragstart.prevent/>
      <span v-else class="text-value" :class="{ 'editable-text': c.props.sourceMode !== 'dynamic' && !c.props.clock }" :title="c.props.sourceMode !== 'dynamic' && !c.props.clock ? '双击就地修改文本' : value.value" @dblclick.stop="startEditText" @dragstart.prevent>{{ value.value }}</span>
      <small v-if="value.stale" class="quality-warning">已过期</small>
    </template>
    <template v-else-if="c.type==='time'"><span class="time-mark">◷</span><span class="time-value">{{ value.value }}</span><small v-if="value.stale" class="quality-warning">已过期</small></template>
    <template v-else-if="c.type==='light'"><span class="status-light" :style="{ '--status-color': statusColor }"><i></i>{{ value.empty ? '状态未知' : value.value }}</span><small v-if="value.stale" class="quality-warning">已过期</small></template>
    <LineChart v-else-if="c.type==='line'" :control="c" :template="template" :instance="instance"/>
    <template v-else-if="c.type==='table'">
      <div class="table-scroll"><table><thead><tr><th v-for="column in columns" :key="column.key">{{ column.name }}<small v-if="column.unit"> / {{ column.unit }}</small></th></tr></thead><tbody><tr v-for="row in shown" :key="row.id" :class="{ 'row-stale': isRowStale(row.record) }"><td v-for="column in columns" :key="column.key" :class="column.key==='status'?statusClass(row.record.data[column.key]):''" :title="formatScalar(row.record.data[column.key], column.precision, column.type==='datetime')">{{ formatScalar(row.record.data[column.key], column.precision, column.type==='datetime') }}<span v-if="(column.type==='datetime'||column.key==='update_time') && isRowStale(row.record)" class="stale-tag">停更</span></td></tr></tbody></table><div v-if="!rows.length" class="table-empty">暂无符合条件的数据</div></div>
      <div class="table-pagination"><span>{{ rows.length }} 条记录 · {{ c.props.filterField ? '已应用条件过滤' : '动态对象集合' }}</span><div><button :disabled="page===0" aria-label="上一页" @click.stop="page--">‹</button><span>{{ page+1 }} / {{ pageCount }}</span><button :disabled="page>=pageCount-1" aria-label="下一页" @click.stop="page++">›</button></div></div>
    </template>
    <template v-else-if="c.type==='image'">
      <svg v-if="c.props.imageType==='radar' || c.props.imageType==='sonar'" viewBox="0 0 100 100" class="decorative-emblem" role="img" aria-label="装饰性动态标识，不代表真实雷达测量">
        <circle cx="50" cy="50" r="45" fill="none" stroke="#22638A" stroke-width="1.2"/><circle cx="50" cy="50" r="33" fill="none" stroke="#173E5D"/>
        <path d="M5 50H95M50 5V95" stroke="#173E5D"/><path d="M20 20L28 28M72 72L80 80M20 80L28 72M72 28L80 20" stroke="#38ACD1" stroke-width="2"/>
        <g v-if="c.props.imageType==='radar'" class="radar-sweep"><path d="M50 50L50 7A43 43 0 0 1 93 50Z" fill="#22D3EE" opacity=".12"/><path d="M50 50V7" stroke="#22D3EE" stroke-width="2"/></g>
        <circle v-else cx="50" cy="50" r="15" class="sonar-pulse" fill="none" stroke="#22D3EE" stroke-width="2"/>
        <circle cx="50" cy="50" r="8" fill="#0B2E46" stroke="#22D3EE" stroke-width="2"/><circle cx="50" cy="50" r="3" fill="#DBF4FF"/>
      </svg>
      <img v-else-if="image && !imageFailed" :src="image" :alt="c.props.alt || '自定义图片'" referrerpolicy="no-referrer" @error="imageFailed=true"/>
      <div v-else class="image-empty">{{ imageFailed ? '图片未载入' : '请配置图片或动效' }}</div>
    </template>
  </div>
</template>
