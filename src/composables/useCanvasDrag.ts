import { onUnmounted, type ComputedRef } from 'vue';
import { clone, fitGeometry } from '../engine/core.ts';
import { screenState, checkpoint, addTemplate } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import type { Geometry } from '../types.ts';
export function useCanvasDrag(
  logical: ComputedRef<{ width: number; height: number }>,
  scale: ComputedRef<number>,
  mode: () => string,
) {
  let cleanup: (() => void) | undefined;
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
    const move = (event: PointerEvent) => {
      if (event.pointerId !== payload.event.pointerId) return;
      const dx = Math.round((event.clientX - start.x) / ratio / 4) * 4,
        dy = Math.round((event.clientY - start.y) / ratio / 4) * 4;
      const geometry: Geometry = payload.resize
        ? { ...original, w: original.w + dx, h: original.h + dy }
        : { ...original, x: original.x + dx, y: original.y + dy };
      Object.assign(target, fitGeometry(geometry, logical.value.width, logical.value.height));
    };
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
