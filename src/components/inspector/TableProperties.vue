<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';
import { computed, ref, watchEffect } from 'vue';
import type { ControlProps } from '../../types.ts';
import { clone } from '../../engine/core.ts';

import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, select, patchControl } = useEditing();

const selectedRuleColumn = ref<string>('');

watchEffect(() => {
  const cols = displayControl.value?.props.columns ?? [];
  const configuredRules = displayControl.value?.props.tableColumnRules ?? [];
  if (!selectedRuleColumn.value || !cols.includes(selectedRuleColumn.value)) {
    if (cols.length) {
      // 优先选中已有规则配置的列（如 status），提升工坊用户可见性
      const matchedCol = cols.find((c) =>
        configuredRules.some((r) => r.field === c && r.rules?.length > 0),
      );
      selectedRuleColumn.value = matchedCol || cols[0];
    } else {
      selectedRuleColumn.value = '';
    }
  }
});

const currentColumnRules = computed(() => {
  const all = displayControl.value?.props.tableColumnRules ?? [];
  return all.find((r) => r.field === selectedRuleColumn.value)?.rules ?? [];
});

/**
 * 为当前选中的列字段添加一条默认的数值告警染色规则（默认 > 30，红色）。
 *
 * @returns 无返回值（undefined）；通过更新 tableColumnRules 属性体现。
 */
function addTableColumnRule() {
  if (!selectedRuleColumn.value) return;
  const all = clone(displayControl.value?.props.tableColumnRules ?? []);
  let colRule = all.find((r: any) => r.field === selectedRuleColumn.value);
  if (!colRule) {
    colRule = { field: selectedRuleColumn.value, rules: [] };
    all.push(colRule);
  }
  colRule.rules.push({ value: '> 30', color: '#EF4444' });
  props({ tableColumnRules: all });
}

/**
 * 更新当前列指定序号告警规则的匹配表达式或高亮色值。
 *
 * @param index - 规则在当前列规则列表中的下标索引。
 * @param key - 需更新的属性键名（'value' 为表达式，'color' 为色值）。
 * @param event - 表单输入变更事件。
 * @returns 无返回值（undefined）；通过更新 tableColumnRules 属性体现。
 */
function updateTableColumnRule(index: number, key: 'value' | 'color', event: Event) {
  const all = clone(displayControl.value?.props.tableColumnRules ?? []);
  const colRule = all.find((r: any) => r.field === selectedRuleColumn.value);
  if (colRule && colRule.rules[index]) {
    colRule.rules[index][key] = v(event);
    props({ tableColumnRules: all });
  }
}

/**
 * 删除当前列指定序号的告警染色规则，若列规则已清空则自动移除该列配置项。
 *
 * @param index - 待删除规则在当前列规则列表中的下标索引。
 * @returns 无返回值（undefined）；通过更新 tableColumnRules 属性体现。
 */
function removeTableColumnRule(index: number) {
  const all = clone(displayControl.value?.props.tableColumnRules ?? []);
  const colRule = all.find((r: any) => r.field === selectedRuleColumn.value);
  if (colRule) {
    colRule.rules.splice(index, 1);
    props({ tableColumnRules: all.filter((r: any) => r.rules.length > 0) });
  }
}
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
      /></label>
      <div v-if="displayControl.props.columns?.length" style="margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
        <h4>列状态颜色规则</h4>
        <label>选择配置列<select
          :value="selectedRuleColumn"
          @change="selectedRuleColumn = v($event)"
        >
          <option
            v-for="key in displayControl.props.columns"
            :key="key"
            :value="key"
          >
            {{ tableSchema?.fields.find((f) => f.key === key)?.name || key }}
          </option>
        </select></label>
        <div
          v-for="(rule, index) in currentColumnRules"
          :key="index"
          class="light-rule"
        >
          <input
            :value="rule.value"
            aria-label="规则值"
            placeholder="如 >30 或 10..20"
            @change="updateTableColumnRule(index, 'value', $event)"
          /><input
            type="color"
            :value="rule.color"
            aria-label="颜色"
            @change="updateTableColumnRule(index, 'color', $event)"
          /><button
            class="link-button"
            @click="removeTableColumnRule(index)"
            aria-label="移除规则"
          >
            ×
          </button>
        </div>
        <button
          class="button full"
          style="margin-top: 6px;"
          @click="addTableColumnRule"
        >
          ＋ 添加列颜色规则
        </button>
        <p class="field-help">
          支持数值区间（如 >30、10..20）或文本匹配。命中后该列单元格文字呈现告警/状态染色。
        </p>
      </div>
    </section></template
  >
</template>
