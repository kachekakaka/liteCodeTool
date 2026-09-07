<script setup lang="ts">
import { ref } from 'vue';
import WorkspaceToolbar from '../components/WorkspaceToolbar.vue';
import AssetLibrary from '../components/AssetLibrary.vue';
import CanvasArea from '../components/CanvasArea.vue';
import Inspector from '../components/Inspector.vue';
import { uiState } from '../stores/application.ts';
import { useEditorKeyboard } from '../composables/useEditorKeyboard.ts';
useEditorKeyboard('editor');
const scale = ref(1);
</script>
<template>
  <WorkspaceToolbar :scale="scale" />
  <div class="workspace">
    <AssetLibrary /><CanvasArea
      mode="editor"
      @scale="scale = $event"
    /><Inspector v-if="uiState.rightOpen" />
  </div>
</template>
