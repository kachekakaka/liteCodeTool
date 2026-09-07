<script setup lang="ts">
import { dataState } from '../../stores/entities.ts';
import { usePageMode } from '../../composables/usePageMode.ts';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control, Field } from '../../types.ts';
import { effectiveControl, formatScalar, isRecordStale, resolveValue } from '../../engine/core.ts';

import LineChart from '../LineChart.vue';
const props = defineProps({
  control: { type: Object as PropType<Control>, required: true },
  template: { type: Object as PropType<ComponentTemplate>, required: true },
  instance: { type: Object as PropType<ComponentInstance>, required: true },
});

const c = computed(() => effectiveControl(props.control, props.instance));

const value = computed(() =>
  resolveValue(
    props.control,
    props.template,
    props.instance,
    dataState.store,
    dataState.schemas,
    dataState.now,
  ),
);

const pageMode = usePageMode();
const tableSchema = computed(() =>
  dataState.schemas.find((s) => s.type === c.value.props.schemaType),
);

const columns = computed(() =>
  (c.value.props.columns ?? [])
    .map((key) => tableSchema.value?.fields.find((f) => f.key === key))
    .filter((field): field is Field => !!field),
);

const rows = computed(() =>
  dataState.store
    .list(c.value.props.schemaType ?? '')
    .filter(
      ({ record }) =>
        !c.value.props.filterField ||
        record.data[c.value.props.filterField] === c.value.props.filterValue,
    )
    .sort((a, b) => a.id.localeCompare(b.id)),
);

const page = ref(0),
  pageSize = computed(() => Math.max(1, Math.min(20, c.value.props.pageSize ?? 4)));

const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)));

watch(pageCount, (count) => {
  if (page.value >= count) page.value = count - 1;
});

const tableHover = ref(false);
let pager: ReturnType<typeof setInterval> | undefined;
let lastPage = Date.now();

onMounted(() => {
  if (c.value.type !== 'table') return;
  pager = setInterval(() => {
    const seconds = c.value.props.autoPageSeconds ?? 0;
    if (
      pageMode.mode === 'viewer' &&
      seconds > 0 &&
      !tableHover.value &&
      pageCount.value > 1 &&
      !document.hidden &&
      Date.now() - lastPage >= seconds * 1000
    ) {
      page.value = (page.value + 1) % pageCount.value;
      lastPage = Date.now();
    }
  }, 1000);
});

onUnmounted(() => {
  if (pager) clearInterval(pager);
});

watch(tableHover, () => {
  lastPage = Date.now();
});

const shown = computed(() =>
  rows.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value),
);

const statusClass = (value: unknown) =>
  value === '告警'
    ? 'cell-danger'
    : value === '在航' || value === '巡航'
      ? 'cell-ok'
      : value === '作业'
        ? 'cell-warning'
        : '';

const staleEnabled = computed(() => c.value.props.staleEnabled !== false);

const staleSeconds = computed(() => c.value.props.staleSeconds ?? 120);

const isRowStale = (record: any) =>
  staleEnabled.value && isRecordStale(record, staleSeconds.value, dataState.now);
</script>
<template>
  <div
    class="table-control"
    @mouseenter="tableHover = true"
    @mouseleave="tableHover = false"
  >
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
            >
              {{ column.name }}<small v-if="column.unit"> / {{ column.unit }}</small>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in shown"
            :key="row.id"
            :class="{ 'row-stale': isRowStale(row.record) }"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              :class="column.key === 'status' ? statusClass(row.record.data[column.key]) : ''"
              :title="
                formatScalar(
                  row.record.data[column.key],
                  column.precision,
                  column.type === 'datetime',
                )
              "
            >
              {{
                formatScalar(
                  row.record.data[column.key],
                  column.precision,
                  column.type === 'datetime',
                )
              }}<span
                v-if="
                  (column.type === 'datetime' || column.key === 'update_time') &&
                  isRowStale(row.record)
                "
                class="stale-tag"
                >停更</span
              >
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="!rows.length"
        class="table-empty"
      >
        暂无符合条件的数据
      </div>
    </div>
    <div class="table-pagination">
      <span
        >{{ rows.length }} 条记录 ·
        {{ c.props.filterField ? '已应用条件过滤' : '动态对象集合' }}</span
      >
      <div>
        <button
          :disabled="page === 0"
          aria-label="上一页"
          @click.stop="page--"
        >
          ‹</button
        ><span>{{ page + 1 }} / {{ pageCount }}</span
        ><button
          :disabled="page >= pageCount - 1"
          aria-label="下一页"
          @click.stop="page++"
        >
          ›
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.table-control {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
</style>
