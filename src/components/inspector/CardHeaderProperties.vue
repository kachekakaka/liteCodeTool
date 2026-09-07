<script setup lang="ts">
import { templateState } from '../../stores/templates.ts';

import { usePageMode } from '../../composables/usePageMode.ts';
import { computed } from 'vue';

import { selectedInstance } from '../../stores/screens.ts';
import { checkpoint } from '../../stores/screens.ts';

import { useEditing } from '../../composables/useEditing.ts';
const page = usePageMode();
const { selectedTemplate } = useEditing();
const v = (e: Event) => (e.target as HTMLInputElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
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
function resetSubTitle() {
  if (page.mode === 'workshop' && templateState.draft) {
    delete templateState.draft.subTitle;
  } else if (selectedInstance.value) {
    checkpoint();
    delete selectedInstance.value.subTitle;
  }
}
function changeInstanceTitle(event: Event) {
  const val = v(event);
  if (page.mode === 'workshop' && templateState.draft) {
    templateState.draft.name = val.trim() || '未命名模板';
  } else if (selectedInstance.value) {
    checkpoint();
    selectedInstance.value.title = val.trim();
  }
}
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
