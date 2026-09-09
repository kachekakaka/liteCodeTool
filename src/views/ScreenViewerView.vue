<script setup lang="ts">
import CanvasArea from '../components/CanvasArea.vue';
import ViewerHud from '../components/ViewerHud.vue';
import { screenState } from '../stores/screens.ts';
import { useEditorKeyboard } from '../composables/useEditorKeyboard.ts';
useEditorKeyboard('viewer');
</script>
<template>
  <div class="workspace">
    <CanvasArea
      :key="`${screenState.screen?.id}:${screenState.embedded}`"
      mode="viewer"
    />
  </div>
  <ViewerHud />
</template>
