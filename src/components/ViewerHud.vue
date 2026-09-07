<script setup lang="ts">
import { uiState } from '../stores/application.ts';
import { dataState } from '../stores/entities.ts';
import { openDrawer } from '../stores/application.ts';
import { fullscreen } from '../stores/application.ts';
import { dirty } from '../stores/screens.ts';
import { useNavigation } from '../composables/useNavigation.ts';
const { setView, loadScreen, newScreen, importConfiguration, editTemplate, saveTemplate } =
  useNavigation();
import { usePageMode } from '../composables/usePageMode.ts';
const page = usePageMode();
</script>
<template>
  <div
    v-if="page.mode === 'viewer' && !uiState.loading && !uiState.error"
    class="viewer-status"
  >
    <span :class="dataState.sourceMode === 'demo' ? 'demo-text' : ''">{{
      dataState.sourceMode === 'demo' ? '演示数据 · 不用于生产决策' : '真实数据模式'
    }}</span
    ><i></i><span>{{ dataState.connected ? 'WebSocket 已连接' : 'WebSocket 已断开' }}</span
    ><span v-if="dataState.lastUpdate"
      >·
      {{ Math.max(0, Math.floor((dataState.now - dataState.lastUpdate) / 1000)) }}
      秒前收到增量</span
    ><span v-else>· 尚未收到增量</span>
  </div>
  <div
    v-if="page.mode === 'viewer'"
    class="viewer-hud"
  >
    <span
      v-if="dirty"
      class="dirty-state"
      >● 未保存</span
    ><span class="layout-locked">排版已锁定</span
    ><button
      class="button"
      @click="fullscreen"
    >
      ⛶ 全屏</button
    ><button
      class="button primary"
      @click="openDrawer()"
    >
      ⇄ 监控对象</button
    ><button
      class="button subtle"
      @click="setView('editor')"
    >
      返回编辑
    </button>
  </div>
</template>
