<script setup lang="ts">
import { screenState } from '../../stores/screens.ts';
import { dataState } from '../../stores/entities.ts';
import { usePageMode } from '../../composables/usePageMode.ts';

import type { Geometry } from '../../types.ts';
import { fitGeometry } from '../../engine/core.ts';
import { selectedInstance } from '../../stores/screens.ts';
import { checkpoint } from '../../stores/screens.ts';
import { retarget } from '../../stores/screens.ts';

import { alignInstance } from '../../stores/screens.ts';
import { moveLayer } from '../../stores/screens.ts';
import { useEditing } from '../../composables/useEditing.ts';
const page = usePageMode();
const { selectedTemplate, displayControl, select, patchControl } = useEditing();
const geometryKeys: (keyof Geometry)[] = ['x', 'y', 'w', 'h'];
/**
 * 读取检查器表单控件的字符串值，数值转换由调用方按字段语义处理。
 *
 * @param e - 来自 input 或 select 的表单事件。
 * @returns 事件目标的 value 字符串。
 */
const v = (e: Event) => (e.target as HTMLInputElement).value;
/**
 * 更新选中控件或实例的位置尺寸，并将结果约束到对应画布边界。
 *
 * @param key - 位置尺寸字段 x、y、w 或 h，均为逻辑像素。
 * @param event - 数值输入事件；非有限数值不应用。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
/**
 * 更新选中实例层级，将输入限制到 0～999。
 *
 * @param event - 层级数值输入事件；无效或 0 输入按现有逻辑回退为 1。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function layer(event: Event) {
  if (selectedInstance.value) {
    checkpoint();
    selectedInstance.value.position.zIndex = Math.max(0, Math.min(999, Number(v(event)) || 1));
  }
}
/**
 * 读取对象槽位可选的实体列表。
 *
 * @param type - 槽位的数据模式标识。
 * @returns 包含 id 和实体记录引用的数组。
 */
const targets = (type: string) => dataState.store.list(type);
/**
 * 将当前选中实例的槽位改绑为表单选中的对象。
 *
 * @param slot - 模板对象槽位 ID。
 * @param event - 实体选择事件，空值表示解除指派。
 * @returns 存在选中实例时返回改绑 Promise，否则返回 undefined。
 */
const assign = (slot: string, event: Event) =>
  selectedInstance.value && retarget(selectedInstance.value.instanceId, slot, v(event));
</script>
<template>
  <template v-if="selectedTemplate"
    ><section
      v-if="page.mode !== 'workshop' && selectedInstance"
      class="property-section"
    >
      <h4>实例布局与对齐</h4>
      <div class="alignment-tools">
        <button
          @click="alignInstance('left')"
          title="对齐画布左侧"
        >
          左</button
        ><button
          @click="alignInstance('center')"
          title="水平居中"
        >
          中</button
        ><button
          @click="alignInstance('right')"
          title="对齐画布右侧"
        >
          右</button
        ><button
          @click="alignInstance('top')"
          title="对齐画布顶部"
        >
          上</button
        ><button
          @click="alignInstance('middle')"
          title="垂直居中"
        >
          中</button
        ><button
          @click="alignInstance('bottom')"
          title="对齐画布底部"
        >
          下
        </button>
      </div>
      <div class="layer-actions">
        <button
          class="button"
          @click="moveLayer('front')"
        >
          置于顶层</button
        ><button
          class="button"
          @click="moveLayer('back')"
        >
          置于底层
        </button>
      </div>
      <div class="property-grid">
        <label
          v-for="key in geometryKeys"
          :key="key"
          >{{ key.toUpperCase()
          }}<input
            type="number"
            :value="selectedInstance.position[key]"
            @change="position(key, $event)"
        /></label>
      </div>
      <label
        >层级<input
          type="number"
          min="0"
          max="999"
          :value="selectedInstance.position.zIndex ?? 1"
          @change="layer"
      /></label>
      <h4>对象槽位指派</h4>
      <label
        v-for="slot in selectedTemplate.slots"
        :key="slot.id"
        >{{ slot.label
        }}<select
          :value="selectedInstance.slotBindings[slot.id] || ''"
          @change="assign(slot.id, $event)"
        >
          <option value="">未绑定对象</option>
          <option
            v-for="item in targets(slot.schemaType)"
            :key="item.id"
            :value="item.id"
          >
            {{ item.record.data.vessel_name || item.id }} · {{ item.id }}
          </option>
        </select></label
      >
      <p
        v-if="!selectedTemplate.slots.length"
        class="field-help"
      >
        该组件不依赖实体对象槽位。
      </p>
      <p class="field-help">点击组件内的具体控件，可独立修改字段；改动只保存在当前实例。</p>
    </section></template
  >
</template>
