<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useTargetSelection } from '../composables/useTargetSelection.ts';
const props = defineProps<{
  schemaType: string;
  target: string;
  source: string | null;
  label: string;
  sourceOnly?: boolean;
}>();
const emit = defineEmits<{ change: [target: string, source: string | null] }>();
const { targets, sources, hint } = useTargetSelection(
  toRef(props, 'schemaType'),
  toRef(props, 'target'),
  toRef(props, 'source'),
);
// 选择值使用编码前缀，来源名称可自由扩展而不与界面选项冲突。
const selectedSource = computed(() =>
  props.source === null ? 'inherit' : props.source === '' ? 'auto' : `source:${props.source}`,
);
/**
 * 更新目标并保留来源意图。
 * @param event - 目标下拉事件。
 * @returns 无返回值，通过事件交给统一改绑入口。
 */
function changeTarget(event: Event) {
  emit('change', (event.target as HTMLSelectElement).value, props.source);
}
/**
 * 将界面选项解析为来源绑定语义。
 * @param event - 来源下拉事件。
 * @returns 无返回值，通过事件更新来源。
 */
function changeSource(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  emit('change', props.target, value === 'inherit' ? null : value === 'auto' ? '' : value.slice(7));
}
</script>
<template>
  <div class="target-selection">
    <label v-if="!sourceOnly"
      >{{ label }} 目标实体<select
        :aria-label="`${label} 目标实体`"
        :value="target"
        @change="changeTarget"
      >
        <option value="">未绑定对象</option>
        <option
          v-for="item in targets"
          :key="item.id"
          :value="item.id"
        >
          {{ item.label }}
        </option>
      </select></label
    >
    <label v-if="sources.length"
      >{{ label }} 数据来源<select
        :aria-label="`${label} 数据来源`"
        :value="selectedSource"
        @change="changeSource"
      >
        <option value="inherit">跟随曲线配置</option>
        <option value="auto">自动选择（单一来源）</option>
        <option
          v-for="item in sources"
          :key="item"
          :value="`source:${item}`"
        >
          {{ item }}
        </option>
      </select></label
    >
    <p class="field-help">{{ hint }}</p>
  </div>
</template>
<style scoped>
.target-selection {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.target-selection label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.target-selection select {
  width: 100%;
  min-width: 0;
}
.target-selection p {
  margin: 0;
}
</style>
