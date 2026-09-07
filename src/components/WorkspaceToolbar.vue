<script setup lang="ts">
import { uiState } from '../stores/application.ts';
import { screenState } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { draftDirty } from '../stores/templates.ts';
import { dirty } from '../stores/screens.ts';
import { undo } from '../stores/screens.ts';
import { redo } from '../stores/screens.ts';
import { saveScreen } from '../stores/screens.ts';
import { exportScreen } from '../stores/screens.ts';
import { useNavigation } from '../composables/useNavigation.ts';
const { setView, loadScreen, newScreen, importConfiguration, editTemplate, saveTemplate } =
  useNavigation();
import { usePageMode } from '../composables/usePageMode.ts';
const page = usePageMode();
defineProps<{ scale: number }>();
const valueOf = (e: Event) => (e.target as HTMLInputElement).value;
</script>
<template>
  <div
    v-if="page.mode !== 'viewer'"
    class="workspace-toolbar"
  >
    <div class="toolbar-title">
      <button
        class="icon-button"
        @click="uiState.leftOpen = !uiState.leftOpen"
        aria-label="展开或收起组件库"
      >
        ☷</button
      ><template v-if="page.mode === 'editor'"
        ><select
          :value="screenState.screen?.id"
          class="screen-picker"
          aria-label="当前大屏"
          @change="loadScreen(valueOf($event))"
        >
          <option
            v-for="screen in screenState.screens"
            :key="screen.id"
            :value="screen.id"
          >
            {{ screen.name }}
          </option></select
        ><span
          class="save-indicator"
          :class="{ dirty }"
          >{{ dirty ? '● 未保存' : '已保存' }}</span
        ></template
      ><template v-else
        ><strong>{{ templateState.draft?.name || '组件模板' }}</strong
        ><span
          class="save-indicator"
          :class="{ dirty: draftDirty }"
          >{{ draftDirty ? '● 未保存' : '模板编辑' }}</span
        ></template
      >
    </div>
    <div class="toolbar-actions">
      <template v-if="page.mode === 'editor'"
        ><button
          class="icon-button"
          :disabled="!screenState.undo.length"
          @click="undo"
          title="撤销 Ctrl+Z"
        >
          ↶</button
        ><button
          class="icon-button"
          :disabled="!screenState.redo.length"
          @click="redo"
          title="重做 Ctrl+Shift+Z"
        >
          ↷</button
        ><span class="toolbar-separator"></span
        ><select
          v-model="screenState.zoom"
          aria-label="画布缩放"
        >
          <option value="fit">适应画布</option>
          <option value="50">50%</option>
          <option value="75">75%</option>
          <option value="100">100%</option></select
        ><span class="zoom-label">{{ Math.round(scale * 100) }}%</span
        ><button
          class="button"
          @click="newScreen"
        >
          新建</button
        ><button
          class="button"
          @click="exportScreen"
        >
          导出</button
        ><label
          class="button import-button"
          :class="{ disabled: uiState.importing }"
          >{{ uiState.importing ? '导入中…' : '导入'
          }}<input
            type="file"
            accept=".json"
            :disabled="uiState.importing"
            @change="importConfiguration" /></label
        ><button
          class="button"
          :disabled="screenState.saving || !dirty"
          @click="saveScreen"
        >
          {{ screenState.saving ? '保存中…' : '保存' }}</button
        ><button
          class="button primary"
          @click="setView('viewer')"
        >
          ▸ 显示态
        </button></template
      ><template v-else
        ><button
          class="button"
          @click="editTemplate()"
        >
          新建模板</button
        ><button
          class="button"
          :disabled="templateState.draftSaving"
          @click="saveTemplate(true)"
        >
          另存为新模板</button
        ><button
          class="button primary"
          :disabled="templateState.draftSaving"
          @click="saveTemplate()"
        >
          {{ templateState.draftSaving ? '保存中…' : '保存入库' }}
        </button></template
      ><button
        class="icon-button"
        @click="uiState.rightOpen = !uiState.rightOpen"
        aria-label="展开或收起属性面板"
      >
        ▥
      </button>
    </div>
  </div>
</template>
