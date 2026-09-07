<script setup lang="ts">
import { screenState } from '../../stores/screens.ts';
import { checkpoint } from '../../stores/screens.ts';
const v = (e: Event) => (e.target as HTMLInputElement).value;
function renameScreen(event: Event) {
  if (screenState.screen) {
    checkpoint();
    screenState.screen.name = v(event);
  }
}
</script>
<template>
  <template v-if="screenState.screen"
    ><section
      v-if="screenState.screen"
      class="property-section"
    >
      <h4>画布配置</h4>
      <label
        >大屏名称<input
          :value="screenState.screen.name"
          maxlength="120"
          @change="renameScreen" /></label
      ><label
        >基准分辨率<input
          value="1920 × 1080（标准基准）"
          disabled
      /></label>
      <p class="field-help">
        固定 1920×1080 标准基准；投屏自动等比适配视口，非 16:9 屏幕保留必要留白，不裁切业务内容。
      </p>
    </section></template
  >
</template>
