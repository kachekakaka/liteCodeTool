import { onUnmounted, type ComputedRef } from 'vue';
import { clone, fitGeometry } from '../engine/core.ts';
import { screenState, checkpoint, addTemplate } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import type { Geometry } from '../types.ts';
/**
 * 统一处理资产投放、实例拖动和工坊控件缩放，卸载时释放全局指针监听。
 *
 * @param logical - 当前逻辑画布宽高的计算引用，单位像素。
 * @param scale - 显示尺寸与逻辑尺寸比例的计算引用，必须为正数。
 * @param mode - 读取当前 editor、workshop 或 viewer 模式的函数，避免捕获过期模式。
 * @returns 可绑定到画布和卡片事件的 drag、drop 处理方法。
 */
export function useCanvasDrag(
  logical: ComputedRef<{ width: number; height: number }>,
  scale: ComputedRef<number>,
  mode: () => string,
) {
  let cleanup: (() => void) | undefined;
  /**
   * 将资产库拖入画布的模板转换为实例，并将屏幕坐标换算为逻辑坐标。
   *
   * @param event - 画布放置事件，dataTransfer 中应包含 application/litecode-template 标识。
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
  function drop(event: DragEvent) {
    if (mode() !== 'editor') return;
    event.preventDefault();
    const id = event.dataTransfer?.getData('application/litecode-template');
    if (!id) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    addTemplate(
      id,
      (event.clientX - rect.left) / scale.value,
      (event.clientY - rect.top) / scale.value,
    );
  }
  /**
   * 启动一次受画布边界约束的拖动或缩放；大屏实例操作会先记录撤销快照。
   *
   * @param payload - 起始事件及目标信息：event 为指针按下事件，instanceId 为实例 ID，controlId 为工坊控件 ID，resize 为是否缩放。
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
  function drag(payload: {
    event: PointerEvent;
    instanceId: string;
    controlId: string;
    resize: boolean;
  }) {
    cleanup?.();
    const workshop = mode() === 'workshop';
    const target = workshop
      ? templateState.draft?.controls.find((c) => c.id === payload.controlId)?.style
      : screenState.screen?.components.find((i) => i.instanceId === payload.instanceId)?.position;
    if (!target || (!workshop && mode() !== 'editor')) return;
    if (!workshop) checkpoint();
    const original = clone(target),
      start = { x: payload.event.clientX, y: payload.event.clientY },
      ratio = scale.value;
    /**
     * 跟踪当前指针，将位移换算为 4 逻辑像素网格并更新拖动目标。
     *
     * @param event - 全局指针移动事件；与起始 pointerId 不一致时忽略。
     * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
     */
    const move = (event: PointerEvent) => {
      if (event.pointerId !== payload.event.pointerId) return;
      const dx = Math.round((event.clientX - start.x) / ratio / 4) * 4,
        dy = Math.round((event.clientY - start.y) / ratio / 4) * 4;
      const geometry: Geometry = payload.resize
        ? { ...original, w: original.w + dx, h: original.h + dy }
        : { ...original, x: original.x + dx, y: original.y + dy };
      Object.assign(target, fitGeometry(geometry, logical.value.width, logical.value.height));
    };
    /**
     * 结束当前拖动，移除全局指针事件和拖动中的页面样式。
     *
     * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
     */
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.body.classList.remove('dragging');
      cleanup = undefined;
    };
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    cleanup = end;
  }
  onUnmounted(() => cleanup?.());
  return { drag, drop };
}
