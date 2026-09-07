import { uiState } from '../stores/application.ts';
import { dataState } from '../stores/entities.ts';
import { screenState } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { request } from './http.ts';
import { startRealtime, stopRealtime } from './realtime.ts';
import type { ComponentTemplate, Envelope, Schema, ScreenConfig } from '../types.ts';

interface Bootstrap {
  mode: string;
  paused: boolean;
  schemas: Schema[];
  templates: { data: ComponentTemplate; revision: string }[];
  screens: { id: string; name: string }[];
  screen: { data: ScreenConfig; revision: string };
  snapshots: Envelope[];
  lastUpdate: number | null;
}

let pending: Promise<void> | undefined;
let initialized = false;
export let defaultScreenId = '';

// 路由与入口共享此服务，初始化不依赖任何组件挂载。
export function initialize(): Promise<void> {
  if (initialized) return Promise.resolve();
  if (pending) return pending;
  uiState.loading = true;
  uiState.error = '';
  pending = request<Bootstrap>('/api/bootstrap')
    .then(({ data }) => {
      dataState.schemas = data.schemas;
      dataState.sourceMode = data.mode;
      dataState.paused = data.paused;
      dataState.lastUpdate = data.lastUpdate;
      templateState.templates = data.templates.map((row) => row.data);
      templateState.templateRevisions = Object.fromEntries(
        data.templates.map((row) => [row.data.id, row.revision]),
      );
      screenState.screens = data.screens;
      defaultScreenId = data.screen.data.id;
      for (const envelope of data.snapshots) dataState.store.apply(envelope, true);
      initialized = true;
      startRealtime();
    })
    .catch((error) => {
      uiState.error = `无法加载平台数据：${error.message}`;
      throw error;
    })
    .finally(() => {
      pending = undefined;
      uiState.loading = false;
    });
  return pending;
}

export function dispose() {
  stopRealtime();
}
if (import.meta.hot) import.meta.hot.dispose(dispose);
