<script setup lang="ts">
import CanvasArea from '../components/CanvasArea.vue';
import ViewerHud from '../components/ViewerHud.vue';
import { useEditorKeyboard } from '../composables/useEditorKeyboard.ts';
useEditorKeyboard('viewer');
</script>
<template>
  <div class="workspace"><CanvasArea mode="viewer" /></div>
  <ViewerHud />
</template>
