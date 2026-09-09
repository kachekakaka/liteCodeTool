import { computed, type Ref } from 'vue';
import { dataState } from '../stores/entities.ts';
import { entityTarget, extractUniqueTargets, resolveEntityEntry } from '../engine/core.ts';

/**
 * 共用业务目标、来源候选与当前实际来源解析。
 * @param type - 模式标识。
 * @param target - 当前业务目标。
 * @param source - null 表示跟随配置，空串表示自动。
 * @returns 两处选择入口使用的响应式选项与提示。
 */
export function useTargetSelection(
  type: Ref<string>,
  target: Ref<string>,
  source: Ref<string | null>,
) {
  const schema = computed(() => dataState.schemas.find((s) => s.type === type.value));
  const targets = computed(() => {
    const values = extractUniqueTargets(dataState.store, type.value, schema.value);
    if (target.value && !values.some((v) => v.id === target.value))
      values.push({ id: target.value, label: `${target.value}（待底账）` });
    return values;
  });
  const sources = computed(() => {
    const field = schema.value?.sourceField ?? 'source';
    const values = new Set<string>();
    for (const row of dataState.store.list(type.value))
      if (
        !target.value ||
        entityTarget(row.id, row.record, type.value, schema.value) === target.value
      ) {
        if (row.record.data[field]) values.add(String(row.record.data[field]));
      }
    for (const value of schema.value?.fields.find((f) => f.key === field)?.options ?? [])
      values.add(String(value));
    if (source.value) values.add(source.value);
    return [...values];
  });
  const actual = computed(() =>
    resolveEntityEntry(
      dataState.store,
      type.value,
      target.value,
      source.value ?? undefined,
      schema.value,
    ),
  );
  const hint = computed(() =>
    !target.value
      ? '未绑定对象'
      : source.value === null
        ? '跟随各曲线的来源配置'
        : !actual.value
          ? '该目标暂无所选来源数据'
          : `实际来源：${actual.value.record.data[schema.value?.sourceField ?? 'source'] || '单源记录'}`,
  );
  return { targets, sources, hint };
}
