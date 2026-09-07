<script setup lang="ts">
import { dataState } from '../stores/entities.ts';
import { usePageMode } from '../composables/usePageMode.ts';
import { computed, nextTick, ref } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control } from '../types.ts';
import { effectiveControl, resolveValue } from '../engine/core.ts';
import { checkpoint } from '../stores/screens.ts';
import LineChart from './LineChart.vue';
const props = defineProps({
  control: { type: Object as PropType<Control>, required: true },
  template: { type: Object as PropType<ComponentTemplate>, required: true },
  instance: { type: Object as PropType<ComponentInstance>, required: true },
});

const pageMode = usePageMode();

const c = computed(() => effectiveControl(props.control, props.instance));

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

const statusColor = computed(
  () => c.value.props.colorRules?.find((r) => r.value === value.value.raw)?.color ?? '#7995B1',
);

const stamp = computed(() =>
  value.value.timestamp === null
    ? ''
    : new Date(value.value.timestamp).toLocaleTimeString('zh-CN', { hour12: false }),
);

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
  const fallback =
    (c.value.props.staticValue ?? props.control.props.staticValue ?? '请输入内容') + '';
  const finalValue = next || fallback;
  textDraft.value = finalValue;
  if (pageMode.mode === 'workshop') {
    props.control.props.staticValue = finalValue;
  } else {
    checkpoint();
    const old = props.instance.controlOverrides[props.control.id] ?? {};
    props.instance.controlOverrides[props.control.id] = {
      ...old,
      props: { ...old.props, staticValue: finalValue },
    };
  }
}

function cancelText() {
  editingText.value = false;
  textDraft.value = (c.value.props.staticValue ?? value.value.value ?? '') + '';
}

import ImageControl from './controls/ImageControl.vue';
import TableControl from './controls/TableControl.vue';
</script>
<template>
  <div
    class="atomic"
    :class="[
      'atomic-' + c.type,
      { 'is-stale': value.stale, 'atomic-kpi': c.props.variant === 'kpi' },
    ]"
  >
    <template v-if="c.type === 'number'"
      ><span
        v-if="c.props.variant === 'kpi' && c.props.iconType !== 'none'"
        class="kpi-emblem"
        aria-hidden="true"
        ><img
          v-if="c.props.imageUrl"
          :src="c.props.imageUrl"
          alt="KPI 徽标" /><svg
          v-else
          viewBox="0 0 80 80"
          fill="none"
        >
          <circle
            cx="40"
            cy="40"
            r="35"
            stroke="currentColor"
            opacity=".18"
          />
          <circle
            cx="40"
            cy="40"
            r="29"
            stroke="currentColor"
            stroke-dasharray="30 130"
            opacity=".45"
          />
          <g
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <template v-if="c.props.iconType === 'alert'">
              <path d="M40 21L61 57H19Z" />
              <path d="M40 33V43" />
              <circle
                cx="40"
                cy="50"
                r="1"
              />
            </template>
            <template v-else>
              <path d="M20 45L40 39L60 45L54 55H26Z" />
              <path d="M25 61Q33 55 40 61Q48 55 56 61" />
              <path
                v-if="c.props.iconType === 'cargo'"
                d="M26 43V29H54V43M35 29V40M44 29V40M26 35H54"
              />
              <path
                v-else-if="c.props.iconType === 'fishing'"
                d="M31 41V32H45V41M39 32V20L55 32H39"
              />
              <path
                v-else
                d="M29 42V31H51V42M34 31V24H46V31M40 24V18"
              />
            </template>
          </g></svg
      ></span>
      <div class="number-label">{{ value.label }}</div>
      <div class="number-line">
        <strong>{{ value.value }}</strong
        ><span>{{ value.unit }}</span>
      </div>
      <div
        class="number-caption"
        :class="{ 'quality-warning': value.stale }"
      >
        {{
          value.empty
            ? '暂无数据'
            : value.stale
              ? '已过期 · ' + stamp
              : value.timestamp
                ? '最新上报 ' + stamp
                : '固定值'
        }}
      </div></template
    >
    <template v-else-if="c.type === 'text'">
      <input
        v-if="editingText"
        ref="textInputRef"
        v-model="textDraft"
        class="inline-title-input inline-text-input"
        placeholder="请输入文本内容"
        autofocus
        @keydown.enter.stop="commitText"
        @keydown.esc.stop="cancelText"
        @blur="commitText"
        @pointerdown.stop
        @click.stop
        @dblclick.stop
        @dragstart.prevent
      />
      <span
        v-else
        class="text-value"
        :class="{ 'editable-text': c.props.sourceMode !== 'dynamic' && !c.props.clock }"
        :title="
          c.props.sourceMode !== 'dynamic' && !c.props.clock ? '双击就地修改文本' : value.value
        "
        @dblclick.stop="startEditText"
        @dragstart.prevent
        >{{ value.value }}</span
      >
      <small
        v-if="value.stale"
        class="quality-warning"
        >已过期</small
      >
    </template>
    <template v-else-if="c.type === 'time'"
      ><span class="time-mark">◷</span><span class="time-value">{{ value.value }}</span
      ><small
        v-if="value.stale"
        class="quality-warning"
        >已过期</small
      ></template
    >
    <template v-else-if="c.type === 'light'"
      ><span
        class="status-light"
        :style="{ '--status-color': statusColor }"
        ><i></i>{{ value.empty ? '状态未知' : value.value }}</span
      ><small
        v-if="value.stale"
        class="quality-warning"
        >已过期</small
      ></template
    >
    <LineChart
      v-else-if="c.type === 'line'"
      :control="c"
      :template="template"
      :instance="instance"
    />
    <TableControl
      v-else-if="c.type === 'table'"
      :control="control"
      :instance="instance"
      :template="template"
    />
    <ImageControl
      v-else-if="c.type === 'image'"
      :control="control"
      :instance="instance"
      :template="template"
    />
  </div>
</template>
