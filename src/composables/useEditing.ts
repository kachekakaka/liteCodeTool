import { computed } from 'vue';
import { clone, effectiveControl, fitGeometry } from '../engine/core.ts';
import type { ControlType, Override, Slot } from '../types.ts';
import { screenState } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { dataState } from '../stores/entities.ts';
import { uid } from '../utils/identity.ts';
import { notify } from '../stores/application.ts';
import { selectedInstance } from '../stores/screens.ts';
import { checkpoint } from '../stores/screens.ts';
import { usePageMode } from './usePageMode.ts';
export function useEditing() {
  const page = usePageMode();
  const selectedTemplate = computed(() =>
    page.mode === 'workshop'
      ? templateState.draft
      : templateState.templates.find((t) => t.id === selectedInstance.value?.templateId),
  );
  const selectedControl = computed(() =>
    selectedTemplate.value?.controls.find((c) => c.id === screenState.selectedControl),
  );
  const displayControl = computed(() =>
    selectedControl.value
      ? page.mode === 'workshop' || !selectedInstance.value
        ? selectedControl.value
        : effectiveControl(selectedControl.value, selectedInstance.value)
      : null,
  );
  function select(instanceId: string, controlId = ''): void {
    if (page.mode === 'viewer') return;
    screenState.selectedInstance = instanceId;
    screenState.selectedControl = controlId;
  }
  function createSlot(label?: string, schemaType?: string): Slot | null {
    const target = page.mode === 'workshop' ? templateState.draft : selectedTemplate.value;
    if (!target) return null;
    const schema =
      schemaType ||
      target.slots[0]?.schemaType ||
      dataState.schemas.find((s) => s.isEntity)?.type ||
      'vessel';
    const n = target.slots.length + 1;
    const slotName = (label && label.trim()) || `对象${n}`;
    const slot: Slot = { id: uid('slot'), label: slotName, schemaType: schema };
    target.slots.push(slot);
    if (selectedInstance.value && !selectedInstance.value.slotBindings[slot.id]) {
      checkpoint();
      selectedInstance.value.slotBindings[slot.id] = '';
    }
    return slot;
  }
  function renameSlot(slotId: string, newLabel: string): void {
    const target = page.mode === 'workshop' ? templateState.draft : selectedTemplate.value;
    if (!target) return;
    const s = target.slots.find((x) => x.id === slotId);
    if (s && newLabel.trim()) {
      if (page.mode !== 'workshop') checkpoint();
      s.label = newLabel.trim();
    }
  }
  function addSlot(): void {
    createSlot();
  }
  function removeSlot(slot: Slot): void {
    const target = page.mode === 'workshop' ? templateState.draft : selectedTemplate.value;
    if (!target) return;
    if (
      target.controls.some(
        (c) => c.binding?.slotId === slot.id || c.props.series?.some((s) => s.slotId === slot.id),
      )
    )
      return notify('该对象槽位仍被控件引用，请先修改相关绑定', true);
    if (page.mode !== 'workshop') checkpoint();
    target.slots = target.slots.filter((s) => s.id !== slot.id);
    if (selectedInstance.value) delete selectedInstance.value.slotBindings[slot.id];
  }
  function patchControl(patch: Override): void {
    const control = selectedControl.value;
    if (!control) return;
    if (page.mode === 'workshop') {
      Object.assign(control, patch, {
        style: { ...control.style, ...patch.style },
        props: { ...control.props, ...patch.props },
      });
      return;
    }
    if (!selectedInstance.value) return;
    checkpoint();
    const old = selectedInstance.value.controlOverrides[control.id] ?? {};
    selectedInstance.value.controlOverrides[control.id] = {
      ...old,
      ...(Object.hasOwn(patch, 'binding') ? { binding: patch.binding } : {}),
      style: { ...old.style, ...patch.style },
      props: { ...old.props, ...patch.props },
    };
  }
  function addControl(type: ControlType): void {
    if (!templateState.draft) return;
    const atom = templateState.templates.find((t) => t.id === `atom_${type}`)?.controls[0];
    if (!atom) return;
    const c = clone(atom);
    c.id = uid('ctrl');
    c.style = {
      ...c.style,
      ...fitGeometry(
        {
          ...c.style,
          x: 20 + (templateState.draft.controls.length % 4) * 12,
          y: 58 + (templateState.draft.controls.length % 4) * 12,
        },
        templateState.draft.layout.width,
        templateState.draft.layout.height,
      ),
    };
    if (type === 'line' && !templateState.draft.slots.length) addSlot();
    if (type === 'line' && c.props.series)
      c.props.series[0].slotId = templateState.draft.slots[0].id;
    templateState.draft.controls.push(c);
    screenState.selectedControl = c.id;
  }
  return {
    selectedTemplate,
    selectedControl,
    displayControl,
    select,
    createSlot,
    renameSlot,
    addSlot,
    removeSlot,
    patchControl,
    addControl,
  };
}
