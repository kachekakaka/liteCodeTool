<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';
import { usePageMode } from '../../composables/usePageMode.ts';
import { computed } from 'vue';
import type { ControlProps } from '../../types.ts';
import { resolveValue, sourceType } from '../../engine/core.ts';
import { selectedInstance } from '../../stores/screens.ts';
import { notify } from '../../stores/application.ts';
import { useEditing } from '../../composables/useEditing.ts';
const page = usePageMode();
const { selectedTemplate, selectedControl, displayControl, select, patchControl } = useEditing();
const v = (e: Event) => (e.target as HTMLInputElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
const schema = computed(() =>
  dataState.schemas.find(
    (s) => s.type === sourceType(displayControl.value?.binding, selectedTemplate.value!),
  ),
);
const fields = computed(
  () =>
    schema.value?.fields.filter((f) =>
      displayControl.value?.type === 'number'
        ? f.type === 'number'
        : displayControl.value?.type === 'time'
          ? f.type === 'datetime'
          : true,
    ) ?? [],
);
const scalar = computed(
  () => !!displayControl.value && !['table', 'line'].includes(displayControl.value.type),
);
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
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}
function mode(mode: 'static' | 'dynamic') {
  props({ sourceMode: mode });
  if (mode === 'dynamic' && !displayControl.value?.binding) bindTarget('slot');
}
function bindTarget(target: 'slot' | 'global', key = '') {
  const t = selectedTemplate.value;
  if (!t) return;
  const slot = t.slots.find((s) => s.id === key) ?? t.slots[0];
  const s =
    target === 'global'
      ? dataState.schemas.find((s) => !s.isEntity && (!key || s.type === key))
      : dataState.schemas.find((s) => s.type === slot?.schemaType);
  if (!s) return notify('请先在组件工坊声明对象槽位，或切换为全局数据', true);
  const field =
    s.fields.find((f) =>
      displayControl.value?.type === 'number'
        ? f.type === 'number'
        : displayControl.value?.type === 'time'
          ? f.type === 'datetime'
          : f.key === 'vessel_name',
    ) ?? s.fields[0];
  patchControl({
    binding:
      target === 'global'
        ? { target, schemaType: s.type, field: field.key }
        : { target, slotId: slot.id, field: field.key },
    props: { sourceMode: 'dynamic', labelMode: 'auto', unitMode: 'auto', precision: null },
  });
}
function changeField(event: Event) {
  if (!displayControl.value?.binding) return;
  patchControl({
    binding: { ...displayControl.value.binding, field: v(event) },
    props: { labelMode: 'auto', unitMode: 'auto', precision: null },
  });
}
function staticValue(event: Event) {
  const text = v(event);
  props({
    staticValue:
      displayControl.value?.type === 'number' ? (text === '' ? null : Number(text)) : text,
  });
}
function numberProp(
  key: 'lookbackMinutes' | 'gapSeconds' | 'pageSize' | 'staleSeconds' | 'autoPageSeconds',
  event: Event,
) {
  const n = Number(v(event));
  if (Number.isFinite(n)) props({ [key]: n });
}
function custom(event: Event) {
  const enabled = checked(event);
  props({
    labelMode: enabled ? 'custom' : 'auto',
    unitMode: enabled ? 'custom' : 'auto',
    label: resolved.value?.label ?? displayControl.value?.props.label ?? '',
    unit: resolved.value?.unit ?? displayControl.value?.props.unit ?? '',
  });
}
</script>
<template>
  <template v-if="selectedTemplate && displayControl"
    ><section
      v-if="scalar"
      class="property-section"
    >
      <h4>数据源模式</h4>
      <div class="segmented">
        <button
          :class="{ active: displayControl.props.sourceMode !== 'dynamic' }"
          @click="mode('static')"
        >
          固定内容</button
        ><button
          :class="{ active: displayControl.props.sourceMode === 'dynamic' }"
          @click="mode('dynamic')"
        >
          动态绑定
        </button>
      </div>
      <template v-if="displayControl.props.sourceMode !== 'dynamic'"
        ><label
          v-if="displayControl.type === 'time'"
          class="checkbox-row"
          ><input
            type="checkbox"
            :checked="displayControl.props.clock"
            @change="props({ clock: !displayControl.props.clock })"
          />显示当前时间</label
        ><label v-if="displayControl.type !== 'image' && !displayControl.props.clock"
          >固定内容<input
            :type="displayControl.type === 'number' ? 'number' : 'text'"
            :value="displayControl.props.staticValue"
            @change="staticValue"
        /></label>
        <p class="field-help">静态内容不会被实时推流改写。</p></template
      >
      <template v-else
        ><label
          >绑定范围<select
            aria-label="绑定范围"
            :value="displayControl.binding?.target || 'slot'"
            @change="bindTarget(v($event) === 'global' ? 'global' : 'slot')"
          >
            <option value="slot">对象槽位</option>
            <option value="global">全局数据</option>
          </select></label
        ><label v-if="displayControl.binding?.target === 'global'"
          >全局数据模式<select
            aria-label="全局数据模式"
            :value="displayControl.binding.schemaType"
            @change="bindTarget('global', v($event))"
          >
            <option
              v-for="s in dataState.schemas.filter((s) => !s.isEntity)"
              :key="s.type"
              :value="s.type"
            >
              {{ s.name }}
            </option>
          </select></label
        ><label v-else
          >归属对象槽位<select
            aria-label="归属对象槽位"
            :value="displayControl.binding?.slotId"
            @change="bindTarget('slot', v($event))"
          >
            <option
              v-for="slot in selectedTemplate.slots"
              :key="slot.id"
              :value="slot.id"
            >
              {{ slot.label }}
            </option>
          </select></label
        ><label
          >映射字段<select
            aria-label="映射字段"
            :value="displayControl.binding?.field"
            @change="changeField"
          >
            <option
              v-for="field in fields"
              :key="field.key"
              :value="field.key"
            >
              {{ field.name }}{{ field.unit ? ' / ' + field.unit : '' }}
            </option>
          </select></label
        >
        <p class="field-help">切换字段会同步标签、单位与默认精度。</p>
        <label class="checkbox-row"
          ><input
            type="checkbox"
            :checked="displayControl.props.labelMode === 'custom'"
            @change="custom"
          />自定义标签与单位</label
        ><template v-if="displayControl.props.labelMode === 'custom'"
          ><label
            >标签<input
              :value="displayControl.props.label"
              @change="props({ label: v($event) })" /></label
          ><label
            >单位<input
              :value="displayControl.props.unit"
              @change="props({ unit: v($event) })" /></label></template
        ><label v-if="displayControl.type === 'number'"
          >小数位数<select
            :value="displayControl.props.precision ?? ''"
            @change="props({ precision: v($event) === '' ? null : Number(v($event)) })"
          >
            <option value="">遵循数据模式</option>
            <option
              v-for="n in 7"
              :key="n"
              :value="n - 1"
            >
              {{ n - 1 }} 位
            </option>
          </select></label
        ><label
          >字段过期阈值（秒）<input
            type="number"
            min="10"
            max="86400"
            :value="displayControl.props.staleSeconds ?? 120"
            @change="numberProp('staleSeconds', $event)" /></label
      ></template></section
  ></template>
</template>
