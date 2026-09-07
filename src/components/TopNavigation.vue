<script setup lang="ts">
import { uiState } from '../stores/application.ts';
import { screenState } from '../stores/screens.ts';
import { dataState } from '../stores/entities.ts';
import { RouterLink } from 'vue-router';
import { usePageMode } from '../composables/usePageMode.ts';
const page = usePageMode();
</script>
<template>
  <header class="top-hub">
    <div class="brand">
      <span class="brand-symbol">◇</span>
      <div><strong>LiteCodeTool</strong><small>轻量化低代码大屏平台</small></div>
    </div>
    <nav>
      <RouterLink
        :to="screenState.screen ? '/screens/' + screenState.screen.id + '/edit' : '/'"
        :class="{ active: page.mode === 'editor' }"
        >大屏画布</RouterLink
      ><RouterLink
        :to="'/workshop'"
        :class="{ active: page.mode === 'workshop' }"
        >组件工坊</RouterLink
      ><RouterLink
        :to="'/data'"
        :class="{ active: page.mode === 'data' }"
        >数据状态</RouterLink
      >
    </nav>
    <div class="top-status">
      <button
        class="button help-button"
        @click="uiState.help = true"
      >
        使用说明</button
      ><span
        class="source-tag"
        :class="{ demo: dataState.sourceMode === 'demo' }"
        >{{
          dataState.sourceMode === 'demo'
            ? '演示数据 · 非生产'
            : dataState.sourceMode === 'live'
              ? '真实数据模式'
              : '等待数据连接'
        }}</span
      ><span
        class="transport-status"
        :class="{ connected: dataState.connected }"
        ><i></i>{{ dataState.connected ? '推流已连接' : '推流未连接' }}</span
      >
    </div>
  </header>
</template>
