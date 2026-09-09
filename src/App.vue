<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { uiState } from './stores/application.ts';
import { dirty } from './stores/screens.ts';
import { draftDirty } from './stores/templates.ts';
import { resourceState } from './router/guards.ts';
import { dispose, initialize } from './services/application.ts';
import { startRealtime } from './services/realtime.ts';
import HelpDialog from './components/HelpDialog.vue';
import ObjectDrawer from './components/ObjectDrawer.vue';
const router = useRouter(),
  route = useRoute();
/**
 * 保留当前路径、查询和 hash，强制重新进入守卫以重试失败的资源加载。
 *
 * @returns 路由导航的 Promise；完成时为 undefined 或 Vue Router 的导航失败对象。
 */
const retry = () =>
  router.replace({ path: route.path, query: route.query, hash: route.hash, force: true });
/**
 * 大屏或模板仍有未保存修改时，触发浏览器原生离开保护。
 *
 * @param event - 刷新、关闭标签页或离开文档时触发的事件。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function beforeUnload(event: BeforeUnloadEvent) {
  if (!route.meta.embedded && (dirty.value || draftDirty.value)) event.preventDefault();
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload);
  void initialize()
    .then(startRealtime)
    .catch(() => {});
});
onUnmounted(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  dispose();
});
</script>
<template>
  <div
    class="application"
    :class="{ 'mode-viewer': route.meta.mode === 'viewer' }"
  >
    <div
      class="application-content"
      :inert="
        uiState.drawer ||
        uiState.help ||
        resourceState.loading ||
        uiState.importing ||
        uiState.creating ||
        undefined
      "
    >
      <main
        v-if="uiState.loading || uiState.error || resourceState.error"
        class="startup"
      >
        <span class="startup-emblem">◇</span>
        <h1>
          {{
            uiState.loading
              ? '正在载入大屏配置'
              : resourceState.missing
                ? '资源不存在'
                : '暂时无法打开页面'
          }}
        </h1>
        <p>{{ uiState.error || resourceState.error || '读取组件模板与初始底账' }}</p>
        <div
          class="toolbar-actions"
          v-if="!uiState.loading"
        >
          <button
            class="button primary"
            @click="retry"
          >
            重新载入</button
          ><RouterLink
            v-if="!route.meta.embedded"
            class="button"
            to="/"
            >返回大屏</RouterLink
          >
        </div>
      </main>
      <RouterView v-else />
    </div>
    <ObjectDrawer /><HelpDialog />
    <div
      v-if="uiState.notice"
      class="toast"
      :class="{ 'toast-error': uiState.noticeError }"
      role="status"
    >
      {{ uiState.notice }}
    </div>
  </div>
</template>
