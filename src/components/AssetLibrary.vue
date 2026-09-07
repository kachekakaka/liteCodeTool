<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatControlDisplayName, formatControlSummary } from '../engine/core.ts';
import { useEditing } from '../composables/useEditing.ts';
const { addControl } = useEditing();
import { usePageMode } from '../composables/usePageMode.ts';
const page = usePageMode();
import { useNavigation } from '../composables/useNavigation.ts';
const { setView, loadScreen, newScreen, importConfiguration, editTemplate, saveTemplate } =
  useNavigation();
const search = ref('');
const atoms = computed(() => templateState.templates.filter((t) => t.category === '原子控件'));
const assets = computed(() =>
  templateState.templates.filter((t) => t.category !== '原子控件' && t.name.includes(search.value)),
);
/**
 * 将原子控件类型转换为资产库中的中文名称。
 *
 * @param type - 控件类型标识。
 * @returns 中文名称；未知类型返回原类型字符串。
 */
const controlLabel = (type: string) =>
  (
    ({
      text: '文本',
      number: '数值',
      time: '时间',
      light: '指示灯',
      table: '表格',
      line: '曲线',
      image: '图片',
    }) as Record<string, string>
  )[type] || type;
/**
 * 为资产库中的控件类型选择简洁图标字符。
 *
 * @param type - 控件类型标识。
 * @returns 对应图标字符；未知类型返回菱形占位符。
 */
const controlIcon = (type: string) =>
  (
    ({
      text: 'T',
      number: '#',
      time: '◷',
      light: '◉',
      table: '▤',
      line: '⌁',
      image: '▧',
    }) as Record<string, string>
  )[type] || '◇';
/**
 * 将模板 ID 写入拖拽载荷，声明为复制操作供画布接收。
 *
 * @param event - 资产项的拖拽开始事件。
 * @param id - 拖入画布的组件模板 ID。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function libraryDrag(event: DragEvent, id: string) {
  event.dataTransfer?.setData('application/litecode-template', id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
}
/**
 * 移除工坊草稿中选中的控件，并清空控件选中状态。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function removeControl() {
  if (!templateState.draft) return;
  templateState.draft.controls = templateState.draft.controls.filter(
    (c) => c.id !== screenState.selectedControl,
  );
  screenState.selectedControl = '';
}
import { uiState } from '../stores/application.ts';
import { screenState } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { addTemplate } from '../stores/screens.ts';
</script>
<template>
  <aside
    v-if="page.mode !== 'viewer' && uiState.leftOpen"
    class="asset-library"
  >
    <div class="aside-title">
      <span>{{ page.mode === 'workshop' ? '原子控件库' : '组件资产库' }}</span
      ><span class="asset-count">{{ page.mode === 'workshop' ? 7 : assets.length }}</span>
    </div>
    <div class="library-scroll">
      <input
        v-if="page.mode === 'editor'"
        v-model="search"
        class="library-search"
        placeholder="搜索组件模板…"
      />
      <h4 class="library-section-title">基础原子控件</h4>
      <div class="atom-grid">
        <button
          v-for="atom in atoms"
          :key="atom.id"
          :draggable="page.mode === 'editor'"
          @dragstart="libraryDrag($event, atom.id)"
          @click="
            page.mode === 'workshop' ? addControl(atom.controls[0].type) : addTemplate(atom.id)
          "
        >
          <span>{{ controlIcon(atom.controls[0].type) }}</span
          ><small>{{ controlLabel(atom.controls[0].type) }}</small>
        </button>
      </div>
      <template v-if="page.mode === 'editor'"
        ><h4 class="library-section-title">可复用业务组件</h4>
        <div
          v-for="asset in assets"
          :key="asset.id"
          class="asset-tile"
          draggable="true"
          @dragstart="libraryDrag($event, asset.id)"
        >
          <button
            class="asset-add"
            @click="addTemplate(asset.id)"
          >
            <span
              class="asset-preview"
              :class="'preview-' + asset.controls[0]?.type"
              ><i></i><i></i><i></i><i></i></span
            ><strong>{{ asset.name }}</strong
            ><small
              >{{ asset.controls.length }} 个控件 · {{ asset.slots.length }} 个对象槽位</small
            ></button
          ><button
            class="asset-edit"
            @click="editTemplate(asset)"
            title="在组件工坊编辑"
          >
            编辑模板 ↗
          </button>
        </div></template
      >
      <template v-else
        ><h4 class="library-section-title">
          控件树 <span>{{ templateState.draft?.controls.length }}</span>
        </h4>
        <button
          v-for="(c, index) in templateState.draft?.controls"
          :key="c.id"
          class="tree-item"
          :class="{ active: screenState.selectedControl === c.id }"
          @click="screenState.selectedControl = c.id"
        >
          <span>{{ controlIcon(c.type) }}</span>
          <div>
            <strong>{{ formatControlDisplayName(c, index) }}</strong
            ><small>{{ formatControlSummary(c) }}</small>
          </div>
        </button>
        <p
          v-if="!templateState.draft?.controls.length"
          class="empty-note"
        >
          点击上方原子控件，开始制作组件模板。
        </p>
        <button
          v-if="screenState.selectedControl"
          class="button danger full"
          @click="removeControl"
        >
          移除选中控件
        </button></template
      >
    </div>
  </aside>
</template>
