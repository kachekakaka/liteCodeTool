<script setup lang="ts">
import { computed, watch } from 'vue';
import InstanceCard from './InstanceCard.vue';
import type { ComponentInstance } from '../types.ts';
import { useCanvasViewport } from '../composables/useCanvasViewport.ts';
import { useCanvasDrag } from '../composables/useCanvasDrag.ts';
const props = defineProps<{ mode: 'editor' | 'viewer' | 'workshop' }>();
const page = {
  get mode() {
    return props.mode;
  },
};
const emit = defineEmits<{ scale: [value: number] }>();
const logical = computed(() =>
  props.mode === 'workshop'
    ? (templateState.draft?.layout ?? { width: 608, height: 320 })
    : (screenState.screen?.resolution ?? { width: 1920, height: 1080 }),
);
const { viewport, scale } = useCanvasViewport(logical, () => props.mode);
const { drag, drop } = useCanvasDrag(logical, scale, () => props.mode);
watch(scale, (value) => emit('scale', value), { immediate: true });
const templateOf = (id: string) => templateState.templates.find((t) => t.id === id)!;
const previewInstance = computed<ComponentInstance>(() => ({
  instanceId: 'workshop_preview',
  templateId: templateState.draft?.id ?? '',
  position: { x: 0, y: 0, w: logical.value.width, h: logical.value.height },
  slotBindings: Object.fromEntries(
    (templateState.draft?.slots ?? []).map((slot, index) => [
      slot.id,
      dataState.store.list(slot.schemaType)[index]?.id ?? '',
    ]),
  ),
  controlOverrides: {},
}));
import { screenState } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { dataState } from '../stores/entities.ts';
import { selectedInstance } from '../stores/screens.ts';
import { clearSelection } from '../stores/screens.ts';
import { removeInstance } from '../stores/screens.ts';
import { duplicateInstance } from '../stores/screens.ts';
</script>
<template>
  <div class="canvas-area">
    <div
      v-if="page.mode === 'workshop'"
      class="workshop-note"
    >
      <span>组件模板画布</span>实体数据仅用于预览；具体对象不会保存进模板。
    </div>
    <div
      ref="viewport"
      class="canvas-viewport"
      :class="{ 'viewer-viewport': page.mode === 'viewer' }"
      @click="clearSelection"
    >
      <div
        class="scaled-stage"
        :style="{ width: logical.width * scale + 'px', height: logical.height * scale + 'px' }"
      >
        <div
          class="screen-canvas"
          :class="{ 'workshop-canvas': page.mode === 'workshop' }"
          :style="{
            width: logical.width + 'px',
            height: logical.height + 'px',
            transform: 'scale(' + scale + ')',
            backgroundColor: screenState.screen?.background,
          }"
          @dragover.prevent
          @drop="drop"
        >
          <template v-if="page.mode === 'workshop' && templateState.draft"
            ><InstanceCard
              :instance="previewInstance"
              :template="templateState.draft"
              workshop
              @drag="drag"
          /></template>
          <template v-else
            ><template
              v-for="instance in screenState.screen?.components"
              :key="instance.instanceId"
              ><InstanceCard
                v-if="templateOf(instance.templateId)"
                :instance="instance"
                :template="templateOf(instance.templateId)"
                @drag="drag"
              />
              <div
                v-else
                class="missing-template"
                :style="{ left: instance.position.x + 'px', top: instance.position.y + 'px' }"
              >
                组件模板 {{ instance.templateId }} 不存在
              </div></template
            >
            <div
              v-if="!screenState.screen?.components.length"
              class="empty-canvas"
            >
              <span>＋</span>
              <h2>从左侧拖入组件模板</h2>
              <p>或直接添加原子控件，自动生成单控件组件实例</p>
            </div></template
          >
        </div>
      </div>
    </div>
    <div
      v-if="page.mode !== 'viewer'"
      class="canvas-bottom"
    >
      <span
        >{{ logical.width }} × {{ logical.height }}<i>·</i
        >{{ page.mode === 'workshop' ? '组件模板' : '大屏画布' }}</span
      ><span
        v-if="page.mode === 'editor' && selectedInstance"
        class="selection-actions"
        ><button @click="duplicateInstance">复制实例</button
        ><button @click="removeInstance">删除实例</button></span
      ><span>{{
        page.mode === 'workshop'
          ? '拖动控件调整位置 · 右下角调整尺寸'
          : '点击内部控件配置字段 · 选中时临时前置，投屏保持层级'
      }}</span>
    </div>
  </div>
</template>
