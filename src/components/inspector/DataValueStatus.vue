<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';
import { usePageMode } from '../../composables/usePageMode.ts';
import { computed } from 'vue';

import { resolveValue } from '../../engine/core.ts';
import { selectedInstance } from '../../stores/screens.ts';

import { useEditing } from '../../composables/useEditing.ts';
const page = usePageMode();
const { selectedTemplate, selectedControl } = useEditing();
const resolved = computed(() =>
  selectedControl.value &&
  selectedTemplate.value &&
  selectedInstance.value &&
  page.mode !== 'workshop'
    ? resolveValue(
        selectedControl.value,
        selectedTemplate.value,
        selectedInstance.value,
        dataState.store,
        dataState.schemas,
        dataState.now,
      )
    : null,
);
</script>
<template>
  <template v-if="selectedTemplate"
    ><section
      v-if="resolved"
      class="resolved-preview"
    >
      <small>解析预览</small
      ><strong
        >{{ resolved.value }} <span>{{ resolved.unit }}</span></strong
      >
      <p>
        {{ resolved.label }} ·
        {{ resolved.empty ? '暂无数据' : resolved.stale ? '已过期' : '已有数据' }}
      </p>
    </section></template
  >
</template>
