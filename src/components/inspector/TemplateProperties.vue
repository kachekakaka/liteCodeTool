<script setup lang="ts">
import { templateState } from '../../stores/templates.ts';
import { dataState } from '../../stores/entities.ts';
import { usePageMode } from '../../composables/usePageMode.ts';

import { fitGeometry } from '../../engine/core.ts';

import { useEditing } from '../../composables/useEditing.ts';
const page = usePageMode();
const { selectedTemplate, select, addSlot, removeSlot } = useEditing();
/**
 * 读取检查器表单控件的字符串值，数值转换由调用方按字段语义处理。
 *
 * @param e - 来自 input 或 select 的表单事件。
 * @returns 事件目标的 value 字符串。
 */
const v = (e: Event) => (e.target as HTMLInputElement).value;
/**
 * 修改工坊画布宽高，并重新约束每个控件，避免尺寸缩小后越界。
 *
 * @param key - width 为宽度（80～3840），height 为高度（60～2160），单位逻辑像素。
 * @param event - 画布尺寸输入事件；非有限值或超出范围时忽略。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function dimension(key: 'width' | 'height', event: Event) {
  if (!templateState.draft) return;
  const n = Number(v(event));
  if (!Number.isFinite(n) || n < (key === 'width' ? 80 : 60) || n > (key === 'width' ? 3840 : 2160))
    return;
  templateState.draft.layout[key] = n;
  for (const c of templateState.draft.controls)
    Object.assign(
      c.style,
      fitGeometry(c.style, templateState.draft.layout.width, templateState.draft.layout.height),
    );
}
</script>
<template>
  <template v-if="selectedTemplate"
    ><section
      v-if="page.mode === 'workshop' && templateState.draft"
      class="property-section"
    >
      <h4>组件模板尺寸与槽位</h4>
      <div class="property-grid">
        <label
          >宽度<input
            type="number"
            :value="templateState.draft.layout.width"
            @change="dimension('width', $event)" /></label
        ><label
          >高度<input
            type="number"
            :value="templateState.draft.layout.height"
            @change="dimension('height', $event)"
        /></label>
      </div>
      <h4>对象槽位声明</h4>
      <div
        v-for="slot in templateState.draft.slots"
        :key="slot.id"
        class="slot-declaration"
      >
        <input
          v-model="slot.label"
          aria-label="槽位名称"
        /><select
          v-model="slot.schemaType"
          aria-label="槽位数据模式"
        >
          <option
            v-for="s in dataState.schemas.filter((s) => s.isEntity)"
            :key="s.type"
            :value="s.type"
          >
            {{ s.name }}
          </option></select
        ><button
          class="link-button"
          @click="removeSlot(slot)"
        >
          删除槽位
        </button>
      </div>
      <button
        class="button full"
        @click="addSlot"
      >
        ＋ 声明对象槽位
      </button>
      <p class="field-help">只声明抽象槽位，不保存具体船舶。预览数据不会写入模板。</p>
    </section></template
  >
</template>
