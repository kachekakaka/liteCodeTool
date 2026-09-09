<script setup lang="ts">
import { uiState } from '../stores/application.ts';
import { screenState } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { dataState } from '../stores/entities.ts';
import { computed, nextTick, ref, watch } from 'vue';
import { dirty } from '../stores/screens.ts';
import { retarget } from '../stores/screens.ts';
import { saveScreen } from '../stores/screens.ts';
import { restoreBindings } from '../stores/screens.ts';
import { checkpoint } from '../stores/screens.ts';
import { extractUniqueTargets, resolveEntityRecord } from '../engine/core.ts';
import TargetSelection from './TargetSelection.vue';

const tab = ref<'objects' | 'text'>('objects');

const input = ref<HTMLInputElement | null>(null),
  dialog = ref<HTMLElement | null>(null);

const target = ref({ instanceId: '', slotId: '', schemaType: '' });
let previousFocus: HTMLElement | null = null;

const groups = computed(() =>
  (screenState.screen?.components ?? [])
    .map((instance) => ({
      instance,
      template: templateState.templates.find((t) => t.id === instance.templateId),
    }))
    .filter(
      (group) =>
        !!group.template?.slots.length &&
        (!uiState.drawerInstance || group.instance.instanceId === uiState.drawerInstance),
    ),
);

const candidates = computed(() =>
  extractUniqueTargets(dataState.store, target.value.schemaType, currentSchema.value)
    .filter(({ label }) =>
      label.toLocaleLowerCase().includes(uiState.search.trim().toLocaleLowerCase()),
    )
    .map((item) => ({
      ...item,
      record: resolveEntityRecord(
        dataState.store,
        target.value.schemaType,
        item.id,
        currentSource.value ?? undefined,
        currentSchema.value,
      ),
    })),
);
const currentSchema = computed(() =>
  dataState.schemas.find((s) => s.type === target.value.schemaType),
);
const currentSource = computed(
  () =>
    screenState.screen?.components.find((i) => i.instanceId === target.value.instanceId)
      ?.slotSourceBindings?.[target.value.slotId] ?? null,
);

const current = computed(
  () =>
    screenState.screen?.components.find((i) => i.instanceId === target.value.instanceId)
      ?.slotBindings[target.value.slotId],
);

/**
 * 按 ID 获取抽屉中实例对应的模板。
 *
 * @param id - 组件模板 ID。
 * @returns 匹配的模板；未找到时为 undefined。
 */
const templateOf = (id: string) => templateState.templates.find((t) => t.id === id);

/**
 * 为对象指派列表解析实体名称，缺少名称时回退实体 ID。
 *
 * @param type - 实体的数据模式标识。
 * @param id - 实体 ID；省略或为空时表示未绑定。
 * @returns 实体名称、ID 或未绑定对象文案。
 */
function name(type: string, id?: string): string {
  return id ? String(dataState.store.get(type, id)?.data.vessel_name ?? id) : '未绑定对象';
}

/**
 * 从抽屉输入框更新大屏名称，并保留撤销快照。
 *
 * @param event - 大屏名称输入事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function renameScreen(event: Event) {
  if (screenState.screen) {
    checkpoint();
    screenState.screen.name = (event.target as HTMLInputElement).value;
  }
}

/**
 * 修改指定实例的私有标题，并记录撤销快照。
 *
 * @param instanceId - 待修改的组件实例 ID。
 * @param event - 标题输入事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function updateInstanceTitle(instanceId: string, event: Event) {
  const inst = screenState.screen?.components.find((i) => i.instanceId === instanceId);
  if (inst) {
    checkpoint();
    inst.title = (event.target as HTMLInputElement).value;
  }
}

watch(
  () => uiState.drawer,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement as HTMLElement;
      const group = groups.value[0],
        slot = group?.template?.slots[0];
      target.value = {
        instanceId: group?.instance.instanceId ?? '',
        slotId: slot?.id ?? '',
        schemaType: slot?.schemaType ?? '',
      };
      await nextTick();
      input.value?.focus();
    } else previousFocus?.focus();
  },
);

/**
 * 将 Tab 焦点限制在抽屉内，按 Escape 关闭抽屉并避免向外层重复分发。
 *
 * @param event - 抽屉内部的键盘事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function trap(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    uiState.drawer = false;
    return;
  }
  if (event.key !== 'Tab') return;
  const nodes = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input,select,[tabindex="0"]',
    ) ?? [],
  );
  const first = nodes[0],
    last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

/**
 * 将抽屉当前目标槽位指派给选中的实体。
 *
 * @param id - 实体 ID；空字符串用于解除指派。
 * @returns 对象改绑及底账补查的 Promise，不携带业务返回值。
 */
const choose = (id: string) => retarget(target.value.instanceId, target.value.slotId, id);
</script>
<template>
  <div
    v-if="uiState.drawer"
    class="drawer-layer"
  >
    <div
      class="drawer-mask"
      @click="uiState.drawer = false"
    ></div>
    <section
      ref="dialog"
      class="object-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      @keydown="trap"
    >
      <header>
        <div>
          <span class="eyebrow">MONITOR OBJECTS</span>
          <h2 id="drawer-title">{{ tab === 'objects' ? '监控对象调度' : '大屏文本管理' }}</h2>
        </div>
        <button
          class="icon-button"
          @click="uiState.drawer = false"
          aria-label="关闭抽屉"
        >
          ×
        </button>
      </header>
      <div class="drawer-tabs">
        <button
          :class="{ active: tab === 'objects' }"
          @click="tab = 'objects'"
        >
          🎯 监控对象调度</button
        ><button
          :class="{ active: tab === 'text' }"
          @click="tab = 'text'"
        >
          📝 大屏文本管理
        </button>
      </div>
      <div
        v-if="tab === 'objects'"
        class="drawer-scroll"
      >
        <p class="drawer-hint">
          先选择对象槽位，再搜索业务目标与选择来源。切换即时生效，不改变控件的字段绑定。
        </p>
        <button
          v-if="uiState.drawerInstance"
          class="link-button"
          @click="uiState.drawerInstance = ''"
        >
          ← 查看大屏全部组件
        </button>
        <div class="slot-groups">
          <section
            v-for="group in groups"
            :key="group.instance.instanceId"
            class="slot-group"
          >
            <h3>{{ group.instance.title || group.template?.name }}</h3>
            <button
              v-for="slot in group.template?.slots"
              :key="slot.id"
              class="slot-choice"
              :class="{
                active:
                  target.instanceId === group.instance.instanceId && target.slotId === slot.id,
              }"
              @click="
                target = {
                  instanceId: group.instance.instanceId,
                  slotId: slot.id,
                  schemaType: slot.schemaType,
                }
              "
            >
              <span>{{ slot.label }}</span
              ><strong>{{ name(slot.schemaType, group.instance.slotBindings[slot.id]) }}</strong
              ><span>›</span>
            </button>
          </section>
          <p
            v-if="!groups.length"
            class="empty-note"
          >
            当前大屏没有需要指派的对象槽位
          </p>
        </div>
        <TargetSelection
          v-if="target.slotId"
          source-only
          label="当前槽位"
          :schema-type="target.schemaType"
          :target="current ?? ''"
          :source="currentSource"
          @change="(id, source) => retarget(target.instanceId, target.slotId, id, source)"
        />
        <div class="search-heading">搜索目标名称 / 编号</div>
        <input
          ref="input"
          v-model="uiState.search"
          class="object-search"
          placeholder="输入名称、MMSI 或批号…"
          aria-label="搜索监控对象"
        />
        <div class="candidate-meta">
          <span>{{ candidates.length }} 个候选对象</span
          ><button
            v-if="current"
            class="link-button"
            @click="choose('')"
          >
            清空当前槽位
          </button>
        </div>
        <button
          v-for="item in candidates"
          :key="item.id"
          class="object-candidate"
          :class="{ chosen: current === item.id }"
          :disabled="!target.slotId"
          @click="choose(item.id)"
        >
          <span class="candidate-icon">◇</span>
          <div>
            <strong>{{ item.label }}</strong
            ><small
              >{{ item.id }} ·
              {{ item.record?.data.vessel_type || currentSchema?.name || '对象' }}</small
            >
          </div>
          <span class="candidate-state">{{
            current === item.id ? '已绑定' : item.record?.data.status || '暂无该来源数据'
          }}</span>
        </button>
        <p
          v-if="!candidates.length"
          class="empty-note"
        >
          没有匹配对象。未上报实体不会被虚构生成。
        </p>
      </div>
      <div
        v-else
        class="drawer-scroll"
      >
        <p class="drawer-hint">
          在此修改大屏总名称与各卡片标题。修改后点击底部“保存为大屏默认”即可持久化生效。
        </p>
        <div class="drawer-text-list">
          <div class="text-item-box">
            <label><span>大屏总标题</span><small>Screen Name</small></label
            ><input
              :value="screenState.screen?.name"
              @change="renameScreen($event)"
              placeholder="输入大屏标题..."
            />
          </div>
          <div
            v-for="inst in screenState.screen?.components"
            :key="inst.instanceId"
            class="text-item-box"
          >
            <label
              ><span>{{ templateOf(inst.templateId)?.name || '组件' }}</span
              ><small>#{{ inst.instanceId.slice(0, 8) }}</small></label
            >
            <input
              :value="inst.title || ''"
              :placeholder="templateOf(inst.templateId)?.name || '自定义卡片标题...'"
              @change="updateInstanceTitle(inst.instanceId, $event)"
            />
          </div>
        </div>
      </div>
      <footer>
        <span :class="dirty ? 'dirty-state' : 'muted'">{{
          dirty ? '● 当前大屏有未保存修改' : '已与默认配置一致'
        }}</span>
        <div>
          <button
            class="button"
            @click="restoreBindings"
          >
            恢复默认配置</button
          ><button
            class="button primary"
            :disabled="screenState.saving || !dirty"
            @click="saveScreen"
          >
            {{ screenState.saving ? '保存中…' : '保存为大屏默认' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
