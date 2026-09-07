<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';
import { computed } from 'vue';
import type { ControlProps } from '../../types.ts';

import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, select, patchControl } = useEditing();
const v = (e: Event) => (e.target as HTMLInputElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}
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
function filterValue(event: Event) {
  const f = tableSchema.value?.fields.find(
    (f) => f.key === displayControl.value?.props.filterField,
  );
  const value = v(event);
  props({ filterValue: f?.type === 'number' ? (value === '' ? null : Number(value)) : value });
}
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
