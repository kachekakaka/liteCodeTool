<script setup lang="ts">
import { computed } from 'vue';
import { dataState } from '../../stores/entities.ts';
import { useEditing } from '../../composables/useEditing.ts';
import type { ControlProps } from '../../types.ts';

const { selectedTemplate, displayControl, patchControl } = useEditing();

/**
 * 读取检查器表单控件的字符串值。
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
 * 通过统一编辑入口合并当前控件属性，自动区分模板草稿与实例覆盖。
 *
 * @param patch - 待修改的控件属性子集；未提供的属性保留原值。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}

/**
 * 将输入转换为正有限数值后更新指定消息流控件属性。
 *
 * @param key - 数值属性名（当前为 streamMaxItems）。
 * @param event - 包含待转换字符串的输入或选择事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function numberProp(key: 'streamMaxItems', event: Event) {
  const n = Number(v(event));
  if (Number.isFinite(n) && n > 0) props({ [key]: n });
}
</script>

<template>
  <template v-if="selectedTemplate && displayControl">
    <section v-if="displayControl.type === 'stream'" class="property-section">
      <h4>消息流配置</h4>

      <label>
        数据模式 (Schema)
        <select
          aria-label="消息流数据模式"
          :value="displayControl.props.schemaType || 'event_log'"
          @change="props({ schemaType: v($event) })"
        >
          <option
            v-for="s in dataState.schemas"
            :key="s.type"
            :value="s.type"
          >
            {{ s.name }} ({{ s.type }})
          </option>
        </select>
      </label>

      <label>
        最大保留条数
        <select
          aria-label="最大保留条数"
          :value="displayControl.props.streamMaxItems ?? 50"
          @change="numberProp('streamMaxItems', $event)"
        >
          <option :value="30">30 条</option>
          <option :value="50">50 条（推荐）</option>
          <option :value="100">100 条</option>
          <option :value="200">200 条</option>
          <option :value="500">500 条</option>
        </select>
      </label>

      <label class="checkbox-row" style="margin-top: 6px">
        <input
          type="checkbox"
          :checked="displayControl.props.streamAutoScroll !== false"
          @change="props({ streamAutoScroll: checked($event) })"
        />
        来新消息时平滑自动上滚
      </label>

      <p class="field-help" style="margin-top: 8px">
        鼠标悬停消息流上方时会自动暂停滚动，便于指挥人员查阅关键告警；移出后恢复自动跟踪最新消息。
      </p>
    </section>
  </template>
</template>