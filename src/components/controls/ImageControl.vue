<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';

import { computed, ref, watch } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control } from '../../types.ts';
import { effectiveControl, resolveValue, safeImageUrl } from '../../engine/core.ts';

import LineChart from '../LineChart.vue';
const props = defineProps({
  control: { type: Object as PropType<Control>, required: true },
  template: { type: Object as PropType<ComponentTemplate>, required: true },
  instance: { type: Object as PropType<ComponentInstance>, required: true },
});

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

const image = computed(() =>
  safeImageUrl(
    c.value.props.sourceMode === 'dynamic'
      ? String(value.value.raw ?? '')
      : (c.value.props.imageUrl ?? ''),
  ),
);

const imageFailed = ref(false);
watch(image, () => {
  imageFailed.value = false;
});
</script>
<template>
  <svg
    v-if="c.props.imageType === 'radar' || c.props.imageType === 'sonar'"
    viewBox="0 0 100 100"
    class="decorative-emblem"
    role="img"
    aria-label="装饰性动态标识，不代表真实雷达测量"
  >
    <circle
      cx="50"
      cy="50"
      r="45"
      fill="none"
      stroke="#22638A"
      stroke-width="1.2"
    />
    <circle
      cx="50"
      cy="50"
      r="33"
      fill="none"
      stroke="#173E5D"
    />
    <path
      d="M5 50H95M50 5V95"
      stroke="#173E5D"
    />
    <path
      d="M20 20L28 28M72 72L80 80M20 80L28 72M72 28L80 20"
      stroke="#38ACD1"
      stroke-width="2"
    />
    <g
      v-if="c.props.imageType === 'radar'"
      class="radar-sweep"
    >
      <path
        d="M50 50L50 7A43 43 0 0 1 93 50Z"
        fill="#22D3EE"
        opacity=".12"
      />
      <path
        d="M50 50V7"
        stroke="#22D3EE"
        stroke-width="2"
      />
    </g>
    <circle
      v-else
      cx="50"
      cy="50"
      r="15"
      class="sonar-pulse"
      fill="none"
      stroke="#22D3EE"
      stroke-width="2"
    />
    <circle
      cx="50"
      cy="50"
      r="8"
      fill="#0B2E46"
      stroke="#22D3EE"
      stroke-width="2"
    />
    <circle
      cx="50"
      cy="50"
      r="3"
      fill="#DBF4FF"
    /></svg
  ><img
    v-else-if="image && !imageFailed"
    :src="image"
    :alt="c.props.alt || '自定义图片'"
    referrerpolicy="no-referrer"
    @error="imageFailed = true"
  />
  <div
    v-else
    class="image-empty"
  >
    {{ imageFailed ? '图片未载入' : '请配置图片或动效' }}
  </div>
</template>
