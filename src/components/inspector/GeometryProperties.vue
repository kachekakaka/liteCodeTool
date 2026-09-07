<script setup lang="ts">
import { screenState } from '../../stores/screens.ts';
import type { Geometry } from '../../types.ts';
import { fitGeometry } from '../../engine/core.ts';
import { selectedInstance } from '../../stores/screens.ts';
import { checkpoint } from '../../stores/screens.ts';

import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, patchControl } = useEditing();
const geometryKeys: (keyof Geometry)[] = ['x', 'y', 'w', 'h'];
const v = (e: Event) => (e.target as HTMLInputElement).value;
function position(key: keyof Geometry, event: Event) {
  const n = Number(v(event));
  if (!Number.isFinite(n)) return;
  if (displayControl.value && selectedTemplate.value)
    patchControl({
      style: fitGeometry(
        { ...displayControl.value.style, [key]: n },
        selectedTemplate.value.layout.width,
        selectedTemplate.value.layout.height,
      ),
    });
  else if (selectedInstance.value && screenState.screen) {
    checkpoint();
    Object.assign(
      selectedInstance.value.position,
      fitGeometry(
        { ...selectedInstance.value.position, [key]: n },
        screenState.screen.resolution.width,
        screenState.screen.resolution.height,
      ),
    );
  }
}
</script>
<template>
  <template v-if="selectedTemplate && displayControl"
    ><section class="property-section">
      <h4>控件几何位置</h4>
      <div class="property-grid">
        <label
          v-for="key in geometryKeys"
          :key="key"
          >{{ key.toUpperCase()
          }}<input
            type="number"
            :value="displayControl.style[key]"
            @change="position(key, $event)"
        /></label>
      </div>
      <label
        >字号<input
          type="number"
          min="10"
          max="96"
          :value="displayControl.style.fontSize ?? 24"
          @change="
            patchControl({
              style: { fontSize: Math.min(96, Math.max(10, Number(v($event)) || 24)) },
            })
          " /></label
      ><label
        >文字 / 指标颜色<input
          type="color"
          :value="displayControl.style.color || '#DBF4FF'"
          @change="patchControl({ style: { color: v($event) } })"
      /></label></section
  ></template>
</template>
