import { ref, computed, onMounted, onUnmounted, type ComputedRef } from 'vue';
import { screenState } from '../stores/screens.ts';
export function useCanvasViewport(
  logical: ComputedRef<{ width: number; height: number }>,
  mode: () => string,
) {
  const viewport = ref<HTMLElement | null>(null),
    dimensions = ref({ width: 1000, height: 700 });
  let observer: ResizeObserver | undefined;
  const scale = computed(() => {
    const pad = mode() === 'viewer' ? 0 : 64;
    const fit = Math.min(
      (dimensions.value.width - pad) / logical.value.width,
      (dimensions.value.height - pad) / logical.value.height,
    );
    return Math.max(
      0.08,
      mode() === 'workshop'
        ? Math.min(1.25, fit)
        : mode() === 'viewer' || screenState.zoom === 'fit'
          ? fit
          : Number(screenState.zoom) / 100,
    );
  });
  onMounted(() => {
    observer = new ResizeObserver(() => {
      if (viewport.value)
        dimensions.value = {
          width: viewport.value.clientWidth,
          height: viewport.value.clientHeight,
        };
    });
    if (viewport.value) observer.observe(viewport.value);
  });
  onUnmounted(() => observer?.disconnect());
  return { viewport, scale };
}
