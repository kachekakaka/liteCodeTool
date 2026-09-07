<script setup lang="ts">
import { screenState } from '../../stores/screens.ts';
import { checkpoint } from '../../stores/screens.ts';
/**
 * 读取检查器表单控件的字符串值，数值转换由调用方按字段语义处理。
 *
 * @param e - 来自 input 或 select 的表单事件。
 * @returns 事件目标的 value 字符串。
 */
const v = (e: Event) => (e.target as HTMLInputElement).value;
/**
 * 修改当前大屏名称，并记录修改前快照。
 *
 * @param event - 大屏名称输入事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
