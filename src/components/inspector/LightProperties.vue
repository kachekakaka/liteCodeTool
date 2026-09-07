<script setup lang="ts">
import type { ControlProps } from '../../types.ts';
import { clone } from '../../engine/core.ts';
import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, patchControl } = useEditing();
const v = (e: Event) => (e.target as HTMLInputElement).value;
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}
function lightRule(index: number, key: 'value' | 'color', event: Event) {
  const rules = clone(displayControl.value?.props.colorRules ?? []);
  if (rules[index]) rules[index][key] = v(event);
  props({ colorRules: rules });
}
function addLightRule() {
  props({
    colorRules: [
      ...(displayControl.value?.props.colorRules ?? []),
      { value: '新状态', color: '#22D3EE' },
    ],
  });
}
function removeLightRule(index: number) {
  props({
    colorRules: (displayControl.value?.props.colorRules ?? []).filter((_, i) => i !== index),
  });
}
</script>
<template>
  <template v-if="selectedTemplate && displayControl"
    ><section
      v-if="displayControl.type === 'light'"
      class="property-section"
    >
      <h4>状态颜色规则</h4>
      <div
        v-for="(rule, index) in displayControl.props.colorRules"
        :key="index"
        class="light-rule"
      >
        <input
          :value="rule.value"
          aria-label="状态值"
          @change="lightRule(index, 'value', $event)"
        /><input
          type="color"
          :value="rule.color"
          aria-label="状态颜色"
          @change="lightRule(index, 'color', $event)"
        /><button
          class="link-button"
          @click="removeLightRule(index)"
          aria-label="移除颜色规则"
        >
          ×
        </button>
      </div>
      <button
        class="button full"
        @click="addLightRule"
      >
        ＋ 添加状态颜色
      </button>
      <p class="field-help">未命中的状态使用中性色，缺值保持“状态未知”，不推断为正常。</p>
    </section></template
  >
</template>
