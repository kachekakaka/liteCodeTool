import { reactive } from 'vue';
import { EntityStore } from '../engine/core.ts';
import type { Schema } from '../types.ts';
export const dataState = reactive({
  schemas: [] as Schema[],
  sourceMode: 'unknown',
  connected: false,
  lastUpdate: null as number | null,
  paused: false,
  now: Date.now(),
  store: new EntityStore(),
});
