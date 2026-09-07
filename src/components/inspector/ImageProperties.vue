<script setup lang="ts">
import type { ControlProps } from '../../types.ts';
import { notify } from '../../stores/application.ts';
import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, select, patchControl } = useEditing();
const v = (e: Event) => (e.target as HTMLInputElement).value;
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}
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
