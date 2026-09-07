import { computed, reactive } from 'vue';
import { clone, fitGeometry, validateScreen } from '../engine/core.ts';
import type { ComponentInstance, ComponentTemplate, Envelope, ScreenConfig } from '../types.ts';
import { uiState } from './application.ts';
import { templateState } from './templates.ts';
import { dataState } from './entities.ts';
import { uid } from '../utils/identity.ts';
import { notify } from './application.ts';
import { request } from '../services/http.ts';
export const screenState = reactive({
  screen: null as ScreenConfig | null,
  screens: [] as { id: string; name: string }[],
  savedScreen: '',
  screenRevision: '',
  saving: false,
  selectedInstance: '',
  selectedControl: '',
  zoom: 'fit',
  undo: [] as string[],
  redo: [] as string[],
});
export const dirty = computed(
  () => !!screenState.screen && JSON.stringify(screenState.screen) !== screenState.savedScreen,
);
export const selectedInstance = computed(() =>
  screenState.screen?.components.find((i) => i.instanceId === screenState.selectedInstance),
);
export function checkpoint(): void {
  if (!screenState.screen) return;
  screenState.undo.push(JSON.stringify(screenState.screen));
  if (screenState.undo.length > 50) screenState.undo.shift();
  screenState.redo = [];
}
export function undo(): void {
  if (!screenState.screen || !screenState.undo.length) return;
  screenState.redo.push(JSON.stringify(screenState.screen));
  screenState.screen = JSON.parse(screenState.undo.pop()!);
  clearSelection();
}
export function redo(): void {
  if (!screenState.screen || !screenState.redo.length) return;
  screenState.undo.push(JSON.stringify(screenState.screen));
  screenState.screen = JSON.parse(screenState.redo.pop()!);
  clearSelection();
}
export function clearSelection(): void {
  screenState.selectedInstance = '';
  screenState.selectedControl = '';
}
function select(instanceId: string) {
  screenState.selectedInstance = instanceId;
  screenState.selectedControl = '';
}
export function applyScreen(data: ScreenConfig, revision: string): void {
  screenState.screen = data;
  screenState.savedScreen = JSON.stringify(data);
  screenState.screenRevision = revision;
  screenState.undo = [];
  screenState.redo = [];
  clearSelection();
  try {
    localStorage.setItem('litecode.screen.' + dataState.sourceMode, data.id);
  } catch {}
}
export async function loadScreen(id: string): Promise<void> {
  const result = await request<ScreenConfig>(`/api/screens/${encodeURIComponent(id)}`);
  applyScreen(result.data, result.revision);
}
export async function saveScreen(): Promise<void> {
  if (!screenState.screen || screenState.saving) return;
  const submitted = clone(screenState.screen);
  screenState.saving = true;
  try {
    validateScreen(submitted, templateState.templates, dataState.schemas);
    const { revision } = await request<ScreenConfig>(`/api/screens/${submitted.id}`, {
      method: 'PUT',
      headers: { 'If-Match': screenState.screenRevision },
      body: JSON.stringify(submitted),
    });
    if (screenState.screen?.id === submitted.id) {
      screenState.screenRevision = revision;
      screenState.savedScreen = JSON.stringify(submitted);
    }
    const item = screenState.screens.find((x) => x.id === submitted.id);
    if (item) item.name = submitted.name;
    notify('大屏默认配置已保存；之后的临时修改仍会单独标记');
  } catch (e) {
    notify(`保存失败：${(e as Error).message}`, true);
  } finally {
    screenState.saving = false;
  }
}
export async function newScreen(): Promise<string | undefined> {
  if (dirty.value && !confirm('新建前将离开当前大屏，未保存修改不会保留。是否继续？')) return;
  const name = prompt('输入新大屏名称', '新建监控大屏');
  if (!name?.trim()) return;
  const screen: ScreenConfig = {
    id: uid('screen'),
    name: name.trim(),
    resolution: { width: 1920, height: 1080 },
    background: '#030B17',
    components: [],
  };
  try {
    const result = await request<ScreenConfig>(`/api/screens/${screen.id}`, {
      method: 'POST',
      headers: { 'If-None-Match': '*' },
      body: JSON.stringify(screen),
    });
    screenState.screens.push({ id: screen.id, name: screen.name });
    applyScreen(result.data, result.revision);
    return screen.id;
  } catch (e) {
    notify((e as Error).message, true);
  }
}
export function exportScreen(): void {
  if (!screenState.screen) return;
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            format: 'litecode.screen.v1',
            screen: screenState.screen,
            templates: templateState.templates.filter((t) =>
              screenState.screen!.components.some((i) => i.templateId === t.id),
            ),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${screenState.screen.id}.litecode.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importConfiguration(event: Event): Promise<string | undefined> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || uiState.importing) return;
  input.value = '';
  if (file.size > 2_000_000) {
    notify('配置包超过 2 MB，请减少内嵌图片后重试', true);
    return;
  }
  if (dirty.value && !confirm('导入会打开一个新的大屏副本，是否放弃当前未保存修改？')) return;
  uiState.importing = true;
  try {
    const bundle = JSON.parse(await file.text());
    const result = await request<{
      screen: { data: ScreenConfig; revision: string };
      templates: { data: ComponentTemplate; revision: string }[];
    }>('/api/import', { method: 'POST', body: JSON.stringify(bundle) });
    for (const row of result.data.templates) {
      templateState.templates.push(row.data);
      templateState.templateRevisions[row.data.id] = row.revision;
    }
    screenState.screens.push({
      id: result.data.screen.data.id,
      name: result.data.screen.data.name,
    });
    applyScreen(result.data.screen.data, result.data.screen.revision);
    notify('配置包已导入为独立副本；原有大屏与模板未被修改');
    return result.data.screen.data.id;
  } catch (e) {
    notify(`导入失败：${(e as Error).message}`, true);
  } finally {
    uiState.importing = false;
  }
}
export function moveLayer(where: 'front' | 'back'): void {
  if (!selectedInstance.value || !screenState.screen) return;
  checkpoint();
  const sorted = [...screenState.screen.components].sort(
    (a, b) => (a.position.zIndex ?? 1) - (b.position.zIndex ?? 1),
  );
  const current = selectedInstance.value;
  const list = sorted.filter((i) => i !== current);
  where === 'front' ? list.push(current) : list.unshift(current);
  list.forEach((i, n) => {
    i.position.zIndex = n + 1;
  });
}
export function alignInstance(
  direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
): void {
  if (!selectedInstance.value || !screenState.screen) return;
  checkpoint();
  const p = selectedInstance.value.position,
    r = screenState.screen.resolution;
  if (direction === 'left') p.x = 0;
  if (direction === 'center') p.x = (r.width - p.w) / 2;
  if (direction === 'right') p.x = r.width - p.w;
  if (direction === 'top') p.y = 0;
  if (direction === 'middle') p.y = (r.height - p.h) / 2;
  if (direction === 'bottom') p.y = r.height - p.h;
}
export function addTemplate(templateId: string, x = 80, y = 320): void {
  if (!screenState.screen) return;
  const t = templateState.templates.find((t) => t.id === templateId);
  if (!t) return;
  checkpoint();
  const p = fitGeometry(
    { x: Math.round(x / 8) * 8, y: Math.round(y / 8) * 8, w: t.layout.width, h: t.layout.height },
    screenState.screen.resolution.width,
    screenState.screen.resolution.height,
  );
  const instance: ComponentInstance = {
    instanceId: uid('inst'),
    templateId,
    position: {
      ...p,
      zIndex: Math.max(0, ...screenState.screen.components.map((i) => i.position.zIndex ?? 1)) + 1,
    },
    slotBindings: {},
    controlOverrides: {},
  };
  screenState.screen.components.push(instance);
  select(instance.instanceId);
}
export function removeInstance(): void {
  if (!screenState.screen || !selectedInstance.value) return;
  checkpoint();
  screenState.screen.components = screenState.screen.components.filter(
    (i) => i.instanceId !== screenState.selectedInstance,
  );
  clearSelection();
}
export function duplicateInstance(): void {
  if (!selectedInstance.value || !screenState.screen) return;
  checkpoint();
  const i = clone(selectedInstance.value);
  i.instanceId = uid('inst');
  i.position = {
    ...i.position,
    ...fitGeometry(
      { ...i.position, x: i.position.x + 24, y: i.position.y + 24 },
      screenState.screen.resolution.width,
      screenState.screen.resolution.height,
    ),
  };
  screenState.screen.components.push(i);
  select(i.instanceId);
}
export async function retarget(instanceId: string, slot: string, id: string): Promise<void> {
  const instance = screenState.screen?.components.find((i) => i.instanceId === instanceId);
  const template = templateState.templates.find((t) => t.id === instance?.templateId);
  const type = template?.slots.find((s) => s.id === slot)?.schemaType;
  if (!instance || !type) return;
  checkpoint();
  if (id) instance.slotBindings[slot] = id;
  else delete instance.slotBindings[slot];
  if (!id) return;
  try {
    const result = await request<Envelope>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
    );
    dataState.store.apply(result.data, true);
  } catch (e) {
    notify(`目标已切换；底账读取失败，缺失字段显示 --：${(e as Error).message}`, true);
  }
}
export function restoreBindings(): void {
  if (!screenState.screen || !screenState.savedScreen) return;
  checkpoint();
  const saved = JSON.parse(screenState.savedScreen) as ScreenConfig;
  for (const i of screenState.screen.components)
    i.slotBindings = clone(
      saved.components.find((s) => s.instanceId === i.instanceId)?.slotBindings ?? {},
    );
  notify('已恢复最近成功保存的对象指派；布局和字段修改保持不变');
}
