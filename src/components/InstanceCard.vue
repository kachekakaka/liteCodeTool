<script lang="ts">
import { computed, defineComponent, nextTick, onUnmounted, ref } from 'vue';
import type { PropType } from 'vue';
import type { ComponentInstance, ComponentTemplate, Control } from '../types.ts';
import { effectiveControl, effectiveSubTitle } from '../engine/core.ts';
import { state, select, openDrawer, retarget, checkpoint } from '../runtime.ts';
import ControlRenderer from './ControlRenderer.vue';
export default defineComponent({
  components: { ControlRenderer },
  props: { instance: { type: Object as PropType<ComponentInstance>, required: true }, template: { type: Object as PropType<ComponentTemplate>, required: true }, workshop: Boolean },
  emits: ['drag'],
  setup(props, { emit }) {
    const popover = ref(false); let touchTimer: ReturnType<typeof setTimeout> | undefined; let touchStart = { x: 0, y: 0 };
    const editingTitle = ref(false); const titleDraft = ref('');
    const editingSubTitle = ref(false); const subTitleDraft = ref('');
    const viewing = computed(() => state.view === 'viewer');
    const isSelected = computed(() => props.workshop || state.selectedInstance === props.instance.instanceId);
    const outer = computed(() => ({ '--accent': props.template.controls[0] ? effectiveControl(props.template.controls[0],props.instance).style.color ?? '#22D3EE' : '#22D3EE', left: props.instance.position.x+'px', top: props.instance.position.y+'px', width: props.instance.position.w+'px', height: props.instance.position.h+'px', zIndex: popover.value ? 3000 : isSelected.value && !viewing.value ? 2000 : props.instance.position.zIndex ?? 1 }));
    const showHeader = computed(() => props.instance.showHeader ?? props.template.showHeader ?? true);
    const currentSubTitle = computed(() => effectiveSubTitle(props.instance, props.template));
    const geometry = (control: Control) => {
      const c = effectiveControl(control, props.instance);
      const scaleRatio = Math.min(props.instance.position.w / (props.template.layout.width || 1), props.instance.position.h / (props.template.layout.height || 1));
      const baseSize = c.style.fontSize ?? 24;
      const effectiveFontSize = props.workshop
        ? Math.max(12, Math.min(48, Math.round(baseSize * Math.min(c.style.w / (control.style.w || 280), c.style.h / (control.style.h || 120)))))
        : Math.max(10, Math.round(baseSize * scaleRatio));
      return { left: (c.style.x/props.template.layout.width*100)+'%', top: (c.style.y/props.template.layout.height*100)+'%', width: (c.style.w/props.template.layout.width*100)+'%', height: (c.style.h/props.template.layout.height*100)+'%', fontSize: effectiveFontSize + 'px', color: c.style.color ?? '#DBF4FF' };
    };
    function startEditTitle() { editingTitle.value = true; titleDraft.value = props.instance.title ?? props.template.name; nextTick(() => { (document.querySelector(`[data-instance="${props.instance.instanceId}"] .inline-title-input`) as HTMLInputElement)?.focus(); }); }
    function commitTitle() { if (!editingTitle.value) return; editingTitle.value = false; const next = titleDraft.value.trim(); if (props.workshop) { if (state.draft) state.draft.name = next || '未命名模板'; } else { checkpoint(); props.instance.title = next; } }
    function cancelTitle() { editingTitle.value = false; }
    function startEditSubTitle() { editingSubTitle.value = true; subTitleDraft.value = props.instance.subTitle !== undefined ? props.instance.subTitle : (props.template.subTitle ?? (props.template.slots.length ? '目标监控' : '数据总览')); nextTick(() => { (document.querySelector(`[data-instance="${props.instance.instanceId}"] .inline-subtitle-input`) as HTMLInputElement)?.focus(); }); }
    function commitSubTitle() { if (!editingSubTitle.value) return; editingSubTitle.value = false; const next = subTitleDraft.value.trim(); if (props.workshop) { if (state.draft) state.draft.subTitle = next; } else { checkpoint(); props.instance.subTitle = next; } }
    function cancelSubTitle() { editingSubTitle.value = false; }
    function choose(controlId = '') { if (!viewing.value) { if (props.workshop) state.selectedControl = controlId; else select(props.instance.instanceId, controlId); } }
    function pointerDown(event: PointerEvent, controlId = '', resize = false) { if(event.button!==0)return; if (viewing.value) { touch(event); return; } if (controlId && !props.workshop) { choose(controlId); return; } event.preventDefault(); choose(controlId); emit('drag', { event, instanceId: props.instance.instanceId, controlId, resize }); }
    function enter() { /* 悬停仅浮现右上角切换按钮 ⇄，不自动弹出大面板 */ }
    function leave() { if (!document.activeElement?.closest(`[data-instance="${props.instance.instanceId}"]`)) popover.value = false; }
    function touch(event: PointerEvent) { if (props.workshop || event.pointerType !== 'touch' || !props.template.slots.length) return; touchStart = { x: event.clientX, y: event.clientY }; touchTimer = setTimeout(() => { popover.value = true; }, 500); }
    function move(event: PointerEvent) { if (Math.hypot(event.clientX-touchStart.x, event.clientY-touchStart.y)>8) clearTimeout(touchTimer); }
    const cancelTouch = () => clearTimeout(touchTimer);
    const options = (type: string) => state.store.list(type);
    const changeTarget = (slot: string, event: Event) => retarget(props.instance.instanceId, slot, (event.target as HTMLSelectElement).value);
    const popoverUp = computed(() => (props.instance.position?.y ?? 0) > 600);
    onUnmounted(() => { clearTimeout(touchTimer); });
    return { editingTitle, titleDraft, startEditTitle, commitTitle, cancelTitle, editingSubTitle, subTitleDraft, currentSubTitle, startEditSubTitle, commitSubTitle, cancelSubTitle, state, popover, popoverUp, viewing, isSelected, outer, showHeader, geometry, choose, pointerDown, enter, leave, touch, move, cancelTouch, options, changeTarget, openDrawer };
  }
});
</script>
<template>
  <section class="instance-card tech-panel" :class="{ selected: isSelected&&!viewing, 'banner-card': template.decoration==='banner', 'kpi-card': template.controls.some(c=>c.props.variant==='kpi'), 'has-slots': template.slots.length > 0 }" :data-instance="instance.instanceId" :style="outer" @click.stop="choose()" @pointerenter="enter" @pointerleave="leave" @pointerdown="touch" @pointermove="move" @pointerup="cancelTouch" @pointercancel="cancelTouch">
    <div v-if="showHeader" class="card-heading" @pointerdown.stop="pointerDown($event)"><span class="heading-mark"></span><input v-if="editingTitle" v-model="titleDraft" class="inline-title-input" autofocus @keydown.enter.stop="commitTitle" @keydown.esc.stop="cancelTitle" @blur="commitTitle" @pointerdown.stop @click.stop @dblclick.stop/><strong v-else :title="instance.title || template.name" @dblclick.stop="startEditTitle">{{ instance.title || template.name }}</strong><input v-if="editingSubTitle" v-model="subTitleDraft" class="inline-subtitle-input" autofocus @keydown.enter.stop="commitSubTitle" @keydown.esc.stop="cancelSubTitle" @blur="commitSubTitle" @pointerdown.stop @click.stop @dblclick.stop/><span v-else-if="currentSubTitle" class="card-meta" :title="currentSubTitle" @dblclick.stop="startEditSubTitle">{{ currentSubTitle }}</span></div>
    <div v-for="control in template.controls" :key="control.id" :data-control="control.id" class="control-position" :class="{ 'control-selected': isSelected&&!viewing&&state.selectedControl===control.id, 'workshop-control': workshop }" :style="geometry(control)" @click.stop="choose(control.id)" @pointerdown.stop="pointerDown($event,control.id)">
      <ControlRenderer :control="control" :template="template" :instance="instance"/>
      <span v-if="workshop&&state.selectedControl===control.id" class="control-resize" @pointerdown.stop="pointerDown($event,control.id,true)"></span>
    </div>
    <template v-if="!viewing&&!workshop"><button class="card-grip" aria-label="拖动组件实例" title="拖动组件实例" @pointerdown.stop="pointerDown($event)">⠿</button><span v-if="isSelected" class="card-resize" @pointerdown.stop="pointerDown($event,'',true)"></span></template>
    <button v-if="!workshop&&template.slots.length" class="view-retarget" aria-label="切换当前组件的监控对象" @click.stop="popover=!popover">⇄</button>
    <div v-if="!workshop&&popover&&template.slots.length" class="insitu-popover" :class="{ 'popover-up': popoverUp }" @click.stop @pointerdown.stop @keydown.esc.stop="popover=false"><header><strong>切换监控对象</strong><button @click="popover=false" aria-label="关闭就地面板">×</button></header><label v-for="slot in template.slots" :key="slot.id"><span>{{ slot.label }}</span><select :value="instance.slotBindings[slot.id] || ''" @change="changeTarget(slot.id,$event)"><option value="">未绑定对象</option><option v-for="item in options(slot.schemaType)" :key="item.id" :value="item.id">{{ item.record.data.vessel_name || item.id }} · {{ item.id }}</option></select></label><button class="link-button" @click="openDrawer(instance.instanceId);popover=false">搜索更多对象 →</button></div>
  </section>
</template>
