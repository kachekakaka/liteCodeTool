<script setup lang="ts">
import type { ControlProps } from '../../types.ts';

import { notify } from '../../stores/application.ts';
import { useEditing } from '../../composables/useEditing.ts';
const { selectedTemplate, displayControl, select, patchControl } = useEditing();
const v = (e: Event) => (e.target as HTMLInputElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
function props(patch: Partial<ControlProps>) {
  patchControl({ props: patch });
}
async function kpiEmblemUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (
    !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type) ||
    file.size > 1_000_000
  )
    return notify('请选择 1 MB 以内的 PNG/JPG/GIF/WebP/SVG 图片', true);
  const reader = new FileReader();
  reader.onload = () =>
    props({ variant: 'kpi', imageUrl: String(reader.result), iconType: 'vessel' });
  reader.onerror = () => notify('图片读取失败', true);
  reader.readAsDataURL(file);
}
function changeKpiIcon(event: Event) {
  const val = v(event);
  props({
    iconType:
      val === 'custom' ? 'vessel' : (val as 'vessel' | 'cargo' | 'fishing' | 'alert' | 'none'),
    imageUrl: val === 'custom' ? displayControl.value?.props.imageUrl : '',
  });
}
</script>
<template>
  <template v-if="selectedTemplate && displayControl"
    ><section
      v-if="displayControl.type === 'number'"
      class="property-section"
    >
      <h4>KPI 样式与右侧徽标</h4>
      <label class="checkbox-row"
        ><input
          type="checkbox"
          :checked="displayControl.props.variant === 'kpi'"
          @change="props({ variant: checked($event) ? 'kpi' : 'standard' })"
        />启用 KPI 科技指标卡片风格</label
      >
      <template v-if="displayControl.props.variant === 'kpi'">
        <label
          >预设徽标图标<select
            :value="
              displayControl.props.imageUrl ? 'custom' : displayControl.props.iconType || 'vessel'
            "
            @change="changeKpiIcon"
          >
            <option value="vessel">商船（默认）</option>
            <option value="cargo">货船</option>
            <option value="fishing">渔船</option>
            <option value="alert">告警三角</option>
            <option value="none">无徽标（关闭隐藏）</option>
            <option
              v-if="displayControl.props.imageUrl"
              value="custom"
            >
              ★ 已上传自定义图片
            </option>
          </select></label
        >
        <label
          >或上传图片替换徽标<input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            @change="kpiEmblemUpload"
        /></label>
        <button
          v-if="displayControl.props.imageUrl"
          class="link-button"
          @click="props({ imageUrl: '' })"
        >
          清除自定义图片，使用预设图标
        </button>
      </template>
    </section></template
  >
</template>
