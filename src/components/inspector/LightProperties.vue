<script setup lang="ts">
import type { ControlProps } from '../../types.ts';
import { clone } from '../../engine/core.ts';
import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, patchControl } = useEditing();
/**
 * 读取检查器表单控件的字符串值，数值转换由调用方按字段语义处理。
 *
 * @param e - 来自 input 或 select 的表单事件。
 * @returns 事件目标的 value 字符串。
 */
const v = (e: Event) => (e.target as HTMLInputElement).value;
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
 * 复制并修改指定指示灯规则，避免直接修改旧规则数组。
 *
 * @param index - 规则下标，从 0 开始。
 * @param key - value 为匹配值，color 为颜色字符串。
 * @param event - 规则值或颜色输入事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function lightRule(index: number, key: 'value' | 'color', event: Event) {
  const rules = clone(displayControl.value?.props.colorRules ?? []);
  if (rules[index]) rules[index][key] = v(event);
  props({ colorRules: rules });
}
/**
 * 在指示灯规则末尾添加使用默认青色的新状态规则。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function addLightRule() {
  props({
    colorRules: [
      ...(displayControl.value?.props.colorRules ?? []),
      { value: '新状态', color: '#22D3EE' },
    ],
  });
}
/**
 * 移除指定指示灯规则，并保留其他规则原有顺序。
 *
 * @param index - 待删除规则的下标，从 0 开始。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
          placeholder="值或表达式，如 >30 或 10..20"
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
      <p class="field-help">
        支持文本匹配（如“告警”）、比较符（如“> 30”、“<= 10”）或区间（如“10..20”）。未命中的状态使用中性色，缺值保持“状态未知”，不推断为正常。
      </p>
    </section></template
  >
</template>
