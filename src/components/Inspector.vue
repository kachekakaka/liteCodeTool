<script setup lang="ts">
import { screenState } from '../stores/screens.ts';

import { usePageMode } from '../composables/usePageMode.ts';
import { ref } from 'vue';

import { formatControlOption, formatControlTag } from '../engine/core.ts';
import { selectedInstance } from '../stores/screens.ts';
import { checkpoint } from '../stores/screens.ts';

import { useEditing } from '../composables/useEditing.ts';
import InstanceProperties from './inspector/InstanceProperties.vue';
import TemplateProperties from './inspector/TemplateProperties.vue';
import KpiProperties from './inspector/KpiProperties.vue';
import GeometryProperties from './inspector/GeometryProperties.vue';
import DataValueStatus from './inspector/DataValueStatus.vue';
import TableProperties from './inspector/TableProperties.vue';
import LineProperties from './inspector/LineProperties.vue';
import ImageProperties from './inspector/ImageProperties.vue';
import LightProperties from './inspector/LightProperties.vue';
import DataBindingProperties from './inspector/DataBindingProperties.vue';
import CardHeaderProperties from './inspector/CardHeaderProperties.vue';
import CanvasProperties from './inspector/CanvasProperties.vue';
const page = usePageMode();
const { selectedTemplate, selectedControl, displayControl, select } = useEditing();
const tab = ref('data');
function resetOverride() {
  if (!selectedInstance.value || !selectedControl.value) return;
  checkpoint();
  delete selectedInstance.value.controlOverrides[selectedControl.value.id];
}
</script>
<template>
  <aside class="inspector">
    <div class="aside-title"><span>属性检查器</span><span class="eyebrow">INSPECTOR</span></div>
    <div class="inspector-scroll">
      <template v-if="!selectedTemplate"
        ><div class="inspector-context">
          <small>当前选中</small>
          <h3>大屏画布</h3>
        </div>
        <CanvasProperties />
        <div class="inspector-tip">
          点击组件选择实例，点击内部数值或文本选择具体控件。
        </div></template
      >
      <template v-else
        ><div class="inspector-context">
          <small>{{
            page.mode === 'workshop' ? '组件模板（源资产）' : '组件实例（私有配置）'
          }}</small>
          <h3>{{ selectedTemplate.name }}</h3>
          <select
            aria-label="选中控件"
            v-model="screenState.selectedControl"
          >
            <option value="">整个组件{{ page.mode === 'workshop' ? '模板' : '实例' }}</option>
            <option
              v-for="(c, index) in selectedTemplate.controls"
              :key="c.id"
              :value="c.id"
            >
              {{ formatControlOption(c, index) }}
            </option>
          </select>
          <p
            v-if="displayControl"
            class="selected-path"
          >
            {{ selectedTemplate.name }} <b>›</b>
            {{ formatControlTag(displayControl, selectedTemplate) }}
            <button
              class="link-button"
              style="margin-left: 6px"
              @click="screenState.selectedControl = ''"
            >
              [选整个组件]
            </button>
          </p>
        </div>
        <CardHeaderProperties />
        <template v-if="displayControl"
          ><div class="property-tabs">
            <button
              :class="{ active: tab === 'data' }"
              @click="tab = 'data'"
            >
              数据绑定</button
            ><button
              :class="{ active: tab === 'style' }"
              @click="tab = 'style'"
            >
              外观布局
            </button>
          </div>
          <div v-if="tab === 'data'">
            <DataBindingProperties />
            <LightProperties />
            <ImageProperties />
            <LineProperties />
            <TableProperties />
            <DataValueStatus />
          </div>
          <div v-else>
            <GeometryProperties />
            <KpiProperties />
          </div>
          <button
            v-if="page.mode !== 'workshop'"
            class="button full"
            @click="resetOverride"
          >
            恢复该控件的模板默认值
          </button>
        </template>
        <template v-else>
          <TemplateProperties />
          <InstanceProperties />
        </template>
      </template>
    </div>
  </aside>
</template>
