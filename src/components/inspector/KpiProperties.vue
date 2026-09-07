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
 * 读取检查器复选框是否选中。
 *
 * @param e - 复选框变化事件。
 * @returns 复选框 checked 布尔值。
 */
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
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
 * 校验并读取 1 MB 以内的图片，作为 KPI 指标卡自定义图标。
 *
 * @param event - 图片文件选择事件，读取首个文件。
 * @returns 启动读取后的 Promise，不等待 FileReader 的 load；读取失败通过提示反馈。
 */
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
/**
 * 切换 KPI 内置图标或自定义图片模式；选择内置图标时清空旧图片地址。
 *
 * @param event - 图标选项事件；custom 表示保留或上传自定义图片。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
