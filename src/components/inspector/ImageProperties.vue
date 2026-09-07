<script setup lang="ts">
import type { ControlProps } from '../../types.ts';
import { notify } from '../../stores/application.ts';
import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, select, patchControl } = useEditing();
/**
 * 读取检查器表单控件的字符串值，数值转换由调用方按字段语义处理。
 *
 * @param e - 来自 input 或 select 的表单事件。
 * @returns 事件目标的 value 字符串。
 */
const v = (e: Event) => (e.target as HTMLInputElement).value;
/**
 * 通过统一编辑入口合并当前控件属性，自动区分模板草稿与实例覆盖。
 *
 * @param patch - 待修改的控件属性子集；未提供的属性保留原值。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}
/**
 * 校验图片类型及 1 MB 大小上限，再通过 FileReader 写入内嵌图片地址。
 *
 * @param event - 图片文件选择事件，读取首个文件。
 * @returns 启动读取后的 Promise，不等待 FileReader 的 load；图片属性稍后在回调中更新。
 */
async function imageUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (
    !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type) ||
    file.size > 1_000_000
  )
    return notify('请选择 1 MB 以内的 PNG/JPG/GIF/WebP/SVG 图片', true);
  const reader = new FileReader();
  reader.onload = () => props({ imageType: 'image', imageUrl: String(reader.result) });
  reader.onerror = () => notify('图片读取失败', true);
  reader.readAsDataURL(file);
}
</script>
<template>
  <template v-if="selectedTemplate && displayControl"
    ><section
      v-if="displayControl.type === 'image'"
      class="property-section"
    >
      <h4>图片与装饰动效</h4>
      <label
        >显示内容<select
          aria-label="显示内容"
          :value="displayControl.props.imageType || 'image'"
          @change="
            props({
              imageType:
                v($event) === 'radar' ? 'radar' : v($event) === 'sonar' ? 'sonar' : 'image',
            })
          "
        >
          <option value="radar">雷达扫描（装饰）</option>
          <option value="sonar">声纳波纹（装饰）</option>
          <option value="image">自定义图片</option>
        </select></label
      ><label v-if="displayControl.props.sourceMode !== 'dynamic'"
        >图片地址<input
          :value="displayControl.props.imageUrl"
          placeholder="https://…"
          @change="props({ imageUrl: v($event), imageType: 'image' })" /></label
      ><label
        >或上传图片<input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          @change="imageUpload"
      /></label>
      <p class="field-help">仅作为图片显示，不执行上传的 SVG 脚本。动效不代表业务测量。</p>
    </section></template
  >
</template>
