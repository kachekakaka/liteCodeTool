<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';
import { computed } from 'vue';
import type { ControlProps } from '../../types.ts';

import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, select, patchControl } = useEditing();
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
 * 通过统一编辑入口合并当前控件属性，自动区分模板草稿与实例覆盖。
 *
 * @param patch - 待修改的控件属性子集；未提供的属性保留原值。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}
/**
 * 将输入转换为有限数值后更新指定控件属性。
 *
 * @param key - 数值属性名；lookbackMinutes 用分钟，gapSeconds、staleSeconds、autoPageSeconds 用秒，pageSize 为行数。
 * @param event - 包含待转换字符串的输入事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function numberProp(
  key: 'lookbackMinutes' | 'gapSeconds' | 'pageSize' | 'staleSeconds' | 'autoPageSeconds',
  event: Event,
) {
  const n = Number(v(event));
  if (Number.isFinite(n)) props({ [key]: n });
}
const tableSchema = computed(() =>
  dataState.schemas.find((s) => s.type === displayControl.value?.props.schemaType),
);
/**
 * 按过滤字段类型保存匹配值；数值字段的空输入保存为 null。
 *
 * @param event - 表格过滤值输入事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function filterValue(event: Event) {
  const f = tableSchema.value?.fields.find(
    (f) => f.key === displayControl.value?.props.filterField,
  );
  const value = v(event);
  props({ filterValue: f?.type === 'number' ? (value === '' ? null : Number(value)) : value });
}
/**
 * 根据复选框状态添加或移除表格展示列。
 *
 * @param key - 需要显示或隐藏的字段键名。
 * @param event - 列选择复选框事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function column(key: string, event: Event) {
  const list = displayControl.value?.props.columns ?? [];
  props({ columns: checked(event) ? [...list, key] : list.filter((k) => k !== key) });
}
</script>
<template>
  <template v-if="selectedTemplate && displayControl"
    ><section
      v-if="displayControl.type === 'table'"
      class="property-section"
    >
      <h4>动态对象集合</h4>
      <label class="checkbox-row">
        <input
          type="checkbox"
          :checked="displayControl.props.staleEnabled !== false"
          @change="props({ staleEnabled: checked($event) })"
        />
        启用停更时效弱化置灰
      </label>
      <label v-if="displayControl.props.staleEnabled !== false">
        超时门槛秒数
        <input
          type="number"
          min="0"
          max="3600"
          :value="displayControl.props.staleSeconds ?? 120"
          @change="numberProp('staleSeconds', $event)"
        />
      </label>
      <p class="field-help">
        超期未上报增量的船只将自动置灰弱化并标注[停更]，置 0 或关闭则常态高亮。
      </p>
      <label
        >自动翻页（显示态）<select
          aria-label="自动翻页（显示态）"
          :value="displayControl.props.autoPageSeconds ?? 0"
          @change="numberProp('autoPageSeconds', $event)"
        >
          <option :value="0">关闭</option>
          <option
            v-for="n in [5, 8, 10, 15, 30]"
            :key="n"
            :value="n"
          >
            每 {{ n }} 秒
          </option>
        </select></label
      >
      <label
        >数据模式<select
          aria-label="数据模式"
          :value="displayControl.props.schemaType"
          @change="props({ schemaType: v($event), columns: [], filterField: '', filterValue: '' })"
        >
          <option
            v-for="s in dataState.schemas.filter((s) => s.isEntity)"
            :key="s.type"
            :value="s.type"
          >
            {{ s.name }}
          </option>
        </select></label
      >
      <label
        v-for="field in tableSchema?.fields"
        :key="field.key"
        class="checkbox-row"
        ><input
          type="checkbox"
          :checked="displayControl.props.columns?.includes(field.key)"
          @change="column(field.key, $event)"
        />{{ field.name }}</label
      >
      <label
        >过滤字段<select
          aria-label="过滤字段"
          :value="displayControl.props.filterField || ''"
          @change="props({ filterField: v($event), filterValue: '' })"
        >
          <option value="">不过滤</option>
          <option
            v-for="field in tableSchema?.fields"
            :key="field.key"
            :value="field.key"
          >
            {{ field.name }}
          </option>
        </select></label
      >
      <label v-if="displayControl.props.filterField"
        >等于<input
          :value="displayControl.props.filterValue"
          @change="filterValue"
      /></label>
      <label
        >每页行数<input
          type="number"
          min="1"
          max="20"
          :value="displayControl.props.pageSize ?? 4"
          @change="numberProp('pageSize', $event)"
      /></label></section
  ></template>
</template>
