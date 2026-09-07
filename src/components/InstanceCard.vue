<script setup lang="ts">
import { screenState } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { dataState } from '../stores/entities.ts';
import { usePageMode } from '../composables/usePageMode.ts';
import { computed, nextTick, onUnmounted, ref } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control } from '../types.ts';
import { effectiveControl, effectiveSubTitle } from '../engine/core.ts';
import { openDrawer } from '../stores/application.ts';
import { retarget } from '../stores/screens.ts';
import { checkpoint } from '../stores/screens.ts';
import { useEditing } from '../composables/useEditing.ts';
import ControlRenderer from './ControlRenderer.vue';
const props = defineProps({
  instance: { type: Object as PropType<ComponentInstance>, required: true },
  template: { type: Object as PropType<ComponentTemplate>, required: true },
  workshop: Boolean,
});
const emit = defineEmits(['drag']);

const page = usePageMode();

const { selectedControl, select } = useEditing();

const popover = ref(false);
let touchTimer: ReturnType<typeof setTimeout> | undefined;
let touchStart = { x: 0, y: 0 };

const editingTitle = ref(false);
const titleDraft = ref('');
const titleInputRef = ref<HTMLInputElement | null>(null);

const editingSubTitle = ref(false);
const subTitleDraft = ref('');
const subTitleInputRef = ref<HTMLInputElement | null>(null);

const viewing = computed(() => page.mode === 'viewer');

const isSelected = computed(
  () => props.workshop || screenState.selectedInstance === props.instance.instanceId,
);

const outer = computed(() => ({
  '--accent': props.template.controls[0]
    ? (effectiveControl(props.template.controls[0], props.instance).style.color ?? '#22D3EE')
    : '#22D3EE',
  left: props.instance.position.x + 'px',
  top: props.instance.position.y + 'px',
  width: props.instance.position.w + 'px',
  height: props.instance.position.h + 'px',
  zIndex: popover.value
    ? 3000
    : isSelected.value && !viewing.value
      ? 2000
      : (props.instance.position.zIndex ?? 1),
}));

const showHeader = computed(() => props.instance.showHeader ?? props.template.showHeader ?? true);

const currentSubTitle = computed(() => effectiveSubTitle(props.instance, props.template));

/**
 * 把控件逻辑位置转换为卡片内百分比布局，并按实例或工坊尺寸计算显示字号。
 *
 * @param control - 模板中的原始控件；计算前会合并当前实例覆盖。
 * @returns 可绑定到 Vue style 的位置、尺寸、字号和颜色对象。
 */
const geometry = (control: Control) => {
  const c = effectiveControl(control, props.instance);
  const scaleRatio = Math.min(
    props.instance.position.w / (props.template.layout.width || 1),
    props.instance.position.h / (props.template.layout.height || 1),
  );
  const baseSize = c.style.fontSize ?? 24;
  const effectiveFontSize = props.workshop
    ? Math.max(
        12,
        Math.min(
          48,
          Math.round(
            baseSize *
              Math.min(c.style.w / (control.style.w || 280), c.style.h / (control.style.h || 120)),
          ),
        ),
      )
    : Math.max(10, Math.round(baseSize * scaleRatio));
  return {
    left: (c.style.x / props.template.layout.width) * 100 + '%',
    top: (c.style.y / props.template.layout.height) * 100 + '%',
    width: (c.style.w / props.template.layout.width) * 100 + '%',
    height: (c.style.h / props.template.layout.height) * 100 + '%',
    fontSize: effectiveFontSize + 'px',
    color: c.style.color ?? '#DBF4FF',
  };
};

/**
 * 开始就地编辑卡片标题，使用实例覆盖或模板名作为初始内容并聚焦输入框。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function startEditTitle() {
  editingTitle.value = true;
  titleDraft.value = props.instance.title ?? props.template.name;
  nextTick(() => {
    titleInputRef.value?.focus();
    titleInputRef.value?.select();
  });
}

/**
 * 提交标题到工坊模板或大屏实例；空白输入回退模板名，并在大屏模式记录撤销。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function commitTitle() {
  if (!editingTitle.value) return;
  editingTitle.value = false;
  const next = titleDraft.value.trim();
  const fallback = props.template.name || '未命名组件';
  const finalValue = next || fallback;
  titleDraft.value = finalValue;
  if (props.workshop) {
    if (templateState.draft) templateState.draft.name = finalValue;
  } else {
    checkpoint();
    props.instance.title = finalValue;
  }
}

/**
 * 取消标题编辑，恢复实例标题或模板名称。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function cancelTitle() {
  editingTitle.value = false;
  titleDraft.value = props.instance.title ?? props.template.name;
}

/**
 * 开始就地编辑副标题，按实例覆盖、模板配置和默认文案填充输入框。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function startEditSubTitle() {
  editingSubTitle.value = true;
  subTitleDraft.value =
    props.instance.subTitle !== undefined
      ? props.instance.subTitle
      : (props.template.subTitle ?? (props.template.slots.length ? '目标监控' : '数据总览'));
  nextTick(() => {
    subTitleInputRef.value?.focus();
    subTitleInputRef.value?.select();
  });
}

/**
 * 提交去除首尾空白的副标题；允许空字符串以显式隐藏副标题。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function commitSubTitle() {
  if (!editingSubTitle.value) return;
  editingSubTitle.value = false;
  const next = subTitleDraft.value.trim();
  if (props.workshop) {
    if (templateState.draft) templateState.draft.subTitle = next;
  } else {
    checkpoint();
    props.instance.subTitle = next;
  }
}

/**
 * 取消副标题编辑并恢复当前生效文案。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function cancelSubTitle() {
  editingSubTitle.value = false;
  subTitleDraft.value = currentSubTitle.value;
}

/**
 * 按工坊或大屏模式选中控件或实例；显示态不修改选中状态。
 *
 * @param controlId - 控件 ID；默认空字符串表示选中整张卡片。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function choose(controlId = '') {
  if (!viewing.value) {
    if (props.workshop) screenState.selectedControl = controlId;
    else select(props.instance.instanceId, controlId);
  }
}

/**
 * 分发主指针按下操作：显示态处理触摸长按，编辑态选中或发出拖动事件。
 *
 * @param event - 指针按下事件；非主按键忽略。
 * @param controlId - 目标控件 ID；默认空字符串表示卡片实例。
 * @param resize - 是否请求尺寸缩放，默认 false 表示移动。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function pointerDown(event: PointerEvent, controlId = '', resize = false) {
  if (event.button !== 0) return;
  if (viewing.value) {
    touch(event);
    return;
  }
  if (controlId && !props.workshop) {
    choose(controlId);
    return;
  }
  event.preventDefault();
  choose(controlId);
  emit('drag', { event, instanceId: props.instance.instanceId, controlId, resize });
}

/**
 * 保留卡片悬停事件入口；按钮显隐由样式负责，此方法不自动弹出对象面板。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function enter() {
  /* 悬停仅浮现右上角切换按钮 ⇄，不自动弹出大面板 */
}

/**
 * 指针离开卡片且焦点不在卡片内部时关闭对象切换浮层。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function leave() {
  if (!document.activeElement?.closest(`[data-instance="${props.instance.instanceId}"]`))
    popover.value = false;
}

/**
 * 在显示态为触摸长按设置 500 毫秒计时器，用于打开对象切换浮层。
 *
 * @param event - 触摸指针事件；工坊、非触摸或无槽位卡片不启动计时。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function touch(event: PointerEvent) {
  if (props.workshop || event.pointerType !== 'touch' || !props.template.slots.length) return;
  touchStart = { x: event.clientX, y: event.clientY };
  touchTimer = setTimeout(() => {
    popover.value = true;
  }, 500);
}

/**
 * 触摸移动超过 8 屏幕像素时取消长按，避免拖动手势误弹浮层。
 *
 * @param event - 指针移动事件，其屏幕坐标与长按起点比较。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function move(event: PointerEvent) {
  if (Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 8)
    clearTimeout(touchTimer);
}

/**
 * 清除尚未触发的触摸长按计时器。
 *
 * @returns 无返回值（undefined）。
 */
const cancelTouch = () => clearTimeout(touchTimer);

/**
 * 读取卡片槽位可切换的实体候选项。
 *
 * @param type - 槽位所使用的数据模式标识。
 * @returns 实体 ID 与记录引用组成的数组，排除全局数据。
 */
const options = (type: string) => dataState.store.list(type);

/**
 * 读取槽位下拉框的值并切换当前实例的对象指派。
 *
 * @param slot - 待切换的模板槽位 ID。
 * @param event - 目标实体选择事件，空值表示解除指派。
 * @returns 对象改绑和底账补查的 Promise，不携带业务返回值。
 */
const changeTarget = (slot: string, event: Event) =>
  retarget(props.instance.instanceId, slot, (event.target as HTMLSelectElement).value);

const popoverUp = computed(() => (props.instance.position?.y ?? 0) > 600);

onUnmounted(() => {
  clearTimeout(touchTimer);
});
</script>
<template>
  <section
    class="instance-card tech-panel"
    :class="{
      selected: isSelected && !viewing,
      'banner-card': template.decoration === 'banner',
      'kpi-card': template.controls.some((c) => c.props.variant === 'kpi'),
      'has-slots': template.slots.length > 0,
    }"
    :data-instance="instance.instanceId"
    :style="outer"
    @click.stop="choose()"
    @pointerenter="enter"
    @pointerleave="leave"
    @pointerdown="touch"
    @pointermove="move"
    @pointerup="cancelTouch"
    @pointercancel="cancelTouch"
  >
    <div
      v-if="showHeader"
      class="card-heading"
      @pointerdown.stop="pointerDown($event)"
    >
      <span class="heading-mark"></span
      ><input
        v-if="editingTitle"
        ref="titleInputRef"
        v-model="titleDraft"
        class="inline-title-input"
        :placeholder="template.name"
        autofocus
        @keydown.enter.stop="commitTitle"
        @keydown.esc.stop="cancelTitle"
        @blur="commitTitle"
        @pointerdown.stop
        @click.stop
        @dblclick.stop
        @dragstart.prevent
      /><strong
        v-else
        :title="instance.title || template.name"
        @dblclick.stop="startEditTitle"
        >{{ instance.title || template.name }}</strong
      ><input
        v-if="editingSubTitle"
        ref="subTitleInputRef"
        v-model="subTitleDraft"
        class="inline-subtitle-input"
        placeholder="输入副标题"
        autofocus
        @keydown.enter.stop="commitSubTitle"
        @keydown.esc.stop="cancelSubTitle"
        @blur="commitSubTitle"
        @pointerdown.stop
        @click.stop
        @dblclick.stop
        @dragstart.prevent
      /><span
        v-else-if="currentSubTitle"
        class="card-meta"
        :title="currentSubTitle"
        @dblclick.stop="startEditSubTitle"
        >{{ currentSubTitle }}</span
      >
    </div>
    <div
      v-for="control in template.controls"
      :key="control.id"
      :data-control="control.id"
      class="control-position"
      :class="{
        'control-selected': isSelected && !viewing && screenState.selectedControl === control.id,
        'workshop-control': workshop,
      }"
      :style="geometry(control)"
      @click.stop="choose(control.id)"
      @pointerdown.stop="pointerDown($event, control.id)"
    >
      <ControlRenderer
        :control="control"
        :template="template"
        :instance="instance"
      />
      <span
        v-if="workshop && screenState.selectedControl === control.id"
        class="control-resize"
        @pointerdown.stop="pointerDown($event, control.id, true)"
      ></span>
    </div>
    <template v-if="!viewing && !workshop"
      ><button
        class="card-grip"
        aria-label="拖动组件实例"
        title="拖动组件实例"
        @pointerdown.stop="pointerDown($event)"
      >
        ⠿</button
      ><span
        v-if="isSelected"
        class="card-resize"
        @pointerdown.stop="pointerDown($event, '', true)"
      ></span
    ></template>
    <button
      v-if="!workshop && template.slots.length"
      class="view-retarget"
      aria-label="切换当前组件的监控对象"
      @click.stop="popover = !popover"
    >
      ⇄
    </button>
    <div
      v-if="!workshop && popover && template.slots.length"
      class="insitu-popover"
      :class="{ 'popover-up': popoverUp }"
      @click.stop
      @pointerdown.stop
      @keydown.esc.stop="popover = false"
    >
      <header>
        <strong>切换监控对象</strong
        ><button
          @click="popover = false"
          aria-label="关闭就地面板"
        >
          ×
        </button>
      </header>
      <label
        v-for="slot in template.slots"
        :key="slot.id"
        ><span>{{ slot.label }}</span
        ><select
          :value="instance.slotBindings[slot.id] || ''"
          @change="changeTarget(slot.id, $event)"
        >
          <option value="">未绑定对象</option>
          <option
            v-for="item in options(slot.schemaType)"
            :key="item.id"
            :value="item.id"
          >
            {{ item.record.data.vessel_name || item.id }} · {{ item.id }}
          </option>
        </select></label
      ><button
        class="link-button"
        @click="
          openDrawer(instance.instanceId);
          popover = false;
        "
      >
        搜索更多对象 →
      </button>
    </div>
  </section>
</template>
