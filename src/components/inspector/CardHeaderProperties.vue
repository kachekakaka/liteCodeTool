<script setup lang="ts">
import { templateState } from '../../stores/templates.ts';

import { usePageMode } from '../../composables/usePageMode.ts';
import { computed } from 'vue';

import { selectedInstance } from '../../stores/screens.ts';
import { checkpoint } from '../../stores/screens.ts';

import { useEditing } from '../../composables/useEditing.ts';
const page = usePageMode();
const { selectedTemplate } = useEditing();
/**
 * 读取检查器表单控件的字符串值，数值转换由调用方按字段语义处理。
 *
 * @param e - 来自 input 或 select 的表单事件。
 * @returns 事件目标的 value 字符串。
 */
const v = (e: Event) => (e.target as HTMLInputElement).value;
/**
 * 读取检查器复选框是否选中。
 *
 * @param e - 复选框变化事件。
 * @returns 复选框 checked 布尔值。
 */
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
/**
 * 修改工坊模板或选中实例的标题栏显示开关。
 *
 * @param event - 标题栏显示复选框事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function header(event: Event) {
  if (page.mode === 'workshop' && templateState.draft)
    templateState.draft.showHeader = checked(event);
  else if (selectedInstance.value) {
    checkpoint();
    selectedInstance.value.showHeader = checked(event);
  }
}
const headerChecked = computed(() => {
  if (page.mode === 'workshop') return templateState.draft?.showHeader ?? true;
  return selectedInstance.value?.showHeader ?? selectedTemplate.value?.showHeader ?? true;
});
const instanceTitle = computed(() => {
  if (page.mode === 'workshop') return templateState.draft?.name ?? '';
  return selectedInstance.value?.title ?? '';
});
const instanceSubTitle = computed(() => {
  if (page.mode === 'workshop') return templateState.draft?.subTitle ?? '';
  return selectedInstance.value?.subTitle ?? '';
});
const defaultSubTitlePlaceholder = computed(() => {
  const slotsCount = selectedTemplate.value?.slots.length ?? 0;
  return `默认：${slotsCount ? '目标监控' : '数据总览'}（清空则隐藏）`;
});
const showResetSubTitle = computed(() => {
  if (page.mode === 'workshop') return templateState.draft?.subTitle !== undefined;
  return selectedInstance.value?.subTitle !== undefined;
});
/**
 * 移除显式副标题配置；实例恢复继承模板，模板恢复按槽位生成的默认文案。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function resetSubTitle() {
  if (page.mode === 'workshop' && templateState.draft) {
    delete templateState.draft.subTitle;
  } else if (selectedInstance.value) {
    checkpoint();
    delete selectedInstance.value.subTitle;
  }
}
/**
 * 修改工坊模板名称或实例私有标题，模板空名称回退为未命名模板。
 *
 * @param event - 标题输入事件；首尾空白会被去除。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function changeInstanceTitle(event: Event) {
  const val = v(event);
  if (page.mode === 'workshop' && templateState.draft) {
    templateState.draft.name = val.trim() || '未命名模板';
  } else if (selectedInstance.value) {
    checkpoint();
    selectedInstance.value.title = val.trim();
  }
}
/**
 * 更新模板或实例副标题，允许空字符串显式隐藏。
 *
 * @param event - 副标题输入事件；首尾空白会被去除。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function changeInstanceSubTitle(event: Event) {
  const val = v(event);
  if (page.mode === 'workshop' && templateState.draft) {
    templateState.draft.subTitle = val.trim();
  } else if (selectedInstance.value) {
    checkpoint();
    selectedInstance.value.subTitle = val.trim();
  }
}
</script>
<template>
  <template v-if="selectedTemplate"
    ><section class="property-section card-header-pinned">
      <h4>组件卡头设置</h4>
      <label class="checkbox-row"
        ><input
          type="checkbox"
          :checked="headerChecked"
          @change="header"
        />显示组件卡头</label
      >
      <template v-if="headerChecked">
        <label
          >主标题<input
            :value="instanceTitle"
            :placeholder="selectedTemplate.name"
            maxlength="120"
            @change="changeInstanceTitle"
        /></label>
        <label
          >副标题<input
            :value="instanceSubTitle"
            :placeholder="defaultSubTitlePlaceholder"
            maxlength="120"
            @change="changeInstanceSubTitle"
        /></label>
        <button
          v-if="showResetSubTitle"
          class="link-button"
          @click="resetSubTitle"
        >
          恢复默认副标题
        </button>
      </template>
    </section></template
  >
</template>
