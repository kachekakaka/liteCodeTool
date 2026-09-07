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
/**
 * 按当前页面模式提供控件编辑上下文：工坊修改模板草稿，大屏编辑记录实例私有覆盖。
 *
 * @returns 选中模板、原始及生效控件的计算引用，以及选中、槽位和控件编辑方法。
 */
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
  /**
   * 按页面模式更新实例和控件选中状态；显示态不接受选中操作。
   *
   * @param instanceId - 组件实例标识。
   * @param controlId - 控件标识；默认空字符串表示只选中实例。
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
  function select(instanceId: string, controlId = ''): void {
    if (page.mode === 'viewer') return;
    screenState.selectedInstance = instanceId;
    screenState.selectedControl = controlId;
  }
  /**
   * 在当前模板增加对象槽位，并为已选实例补充空指派。
   *
   * @param label - 显示名称；省略或为空白时按槽位数量生成对象序号。
   * @param schemaType - 实体数据模式；省略时依次采用已有槽位、首个实体模式或 vessel。
   * @returns 新建槽位对象；没有可编辑模板时返回 null。
   */
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
  /**
   * 修改当前模板中指定对象槽位的显示名称。
   *
   * @param slotId - 待修改的槽位 ID。
   * @param newLabel - 新名称；去除首尾空白后为空时不修改。
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
  function renameSlot(slotId: string, newLabel: string): void {
    const target = page.mode === 'workshop' ? templateState.draft : selectedTemplate.value;
    if (!target) return;
    const s = target.slots.find((x) => x.id === slotId);
    if (s && newLabel.trim()) {
      if (page.mode !== 'workshop') checkpoint();
      s.label = newLabel.trim();
    }
  }
  /**
   * 用默认名称和数据模式增加一个对象槽位。
   *
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
  function addSlot(): void {
    createSlot();
  }
  /**
   * 删除未被控件或曲线引用的对象槽位，并清理选中实例中的对应指派。
   *
   * @param slot - 待删除的槽位对象；仍被引用时只提示，不删除。
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
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
  /**
   * 提交控件局部修改；工坊直接更新草稿，大屏编辑只写入实例私有覆盖。
   *
   * @param patch - 样式、属性或绑定补丁；省略 binding 表示不变，null 表示清除绑定。
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
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
  /**
   * 从原子模板复制指定控件到工坊草稿，并调整位置、标识和曲线槽位。
   *
   * @param type - 需要新增的控件类型，必须在原子模板库中存在。
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
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
