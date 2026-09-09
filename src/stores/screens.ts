import { computed, reactive } from 'vue';
import {
  clone,
  fitGeometry,
  validateScreen,
  normalizeScreen,
  normalizeTemplate,
} from '../engine/core.ts';
import type { ComponentInstance, ComponentTemplate, Envelope, ScreenConfig } from '../types.ts';
import { uiState } from './application.ts';
import { templateState } from './templates.ts';
import { dataState } from './entities.ts';
import { uid } from '../utils/identity.ts';
import { notify } from './application.ts';
import { request } from '../services/http.ts';
/** 当前大屏内存草稿、服务器保存基线及最多 50 步撤销记录；切换功能页时共享此状态。 */
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
/** 通过与最近成功保存的 JSON 快照比较判断未保存修改，实时数据变化不参与比较。 */
export const dirty = computed(
  () => !!screenState.screen && JSON.stringify(screenState.screen) !== screenState.savedScreen,
);
export const selectedInstance = computed(() =>
  screenState.screen?.components.find((i) => i.instanceId === screenState.selectedInstance),
);
/**
 * 记录修改前的大屏快照，最多保留 50 步，并清空重做栈。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function checkpoint(): void {
  if (!screenState.screen) return;
  screenState.undo.push(JSON.stringify(screenState.screen));
  if (screenState.undo.length > 50) screenState.undo.shift();
  screenState.redo = [];
}
/**
 * 恢复上一份大屏快照，并将当前状态放入重做栈；无可撤销步骤时不处理。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function undo(): void {
  if (!screenState.screen || !screenState.undo.length) return;
  screenState.redo.push(JSON.stringify(screenState.screen));
  screenState.screen = JSON.parse(screenState.undo.pop()!);
  clearSelection();
}
/**
 * 恢复一份重做快照，并将当前状态放回撤销栈。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function redo(): void {
  if (!screenState.screen || !screenState.redo.length) return;
  screenState.undo.push(JSON.stringify(screenState.screen));
  screenState.screen = JSON.parse(screenState.redo.pop()!);
  clearSelection();
}
/**
 * 清空实例及控件选中状态。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function clearSelection(): void {
  screenState.selectedInstance = '';
  screenState.selectedControl = '';
}
/**
 * 选中指定实例，同时清除之前选中的控件。
 *
 * @param instanceId - 目标组件实例标识。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function select(instanceId: string) {
  screenState.selectedInstance = instanceId;
  screenState.selectedControl = '';
}
/**
 * 应用服务器大屏及其版本，重置保存基线、撤销栈和选中状态。
 *
 * @param data - 服务器返回的大屏配置，将直接作为当前草稿。
 * @param revision - 服务器 ETag，用于下一次保存的并发版本校验。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function applyScreen(data: ScreenConfig, revision: string): void {
  data = normalizeScreen(data, templateState.templates, dataState.store, dataState.schemas);
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
/**
 * 请求指定大屏并应用为当前草稿；调用方负责离开确认和导航保护。
 *
 * @param id - 需要加载的大屏标识。
 * @returns 完成处理的 Promise，不携带业务返回值。
 * @throws 请求、解析或取消失败时 Promise 拒绝。
 */
export async function loadScreen(id: string): Promise<void> {
  const result = await request<ScreenConfig>(`/api/screens/${encodeURIComponent(id)}`);
  applyScreen(result.data, result.revision);
}
/**
 * 校验并保存当前大屏快照，使用 ETag 防止覆盖其他窗口的更新。保存期间的新修改仍保持未保存状态。
 *
 * @returns 保存流程结束的 Promise；失败以界面通知反馈，无业务返回值。
 */
export async function saveScreen(): Promise<void> {
  if (!screenState.screen || screenState.saving) return;
  const submitted = normalizeScreen(
    screenState.screen,
    templateState.templates,
    dataState.store,
    dataState.schemas,
  );
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
/**
 * 确认放弃旧草稿后输入名称，创建空白大屏并应用服务器返回值。
 *
 * @returns 成功时兑现为新大屏 ID；用户取消、名称为空或保存失败时为 undefined。
 */
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
/**
 * 下载当前大屏及其引用模板组成的 JSON 配置包，不要求先保存。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function exportScreen(): void {
  if (!screenState.screen) return;
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            format: 'litecode.screen.v1',
            screen: normalizeScreen(
              screenState.screen,
              templateState.templates,
              dataState.store,
              dataState.schemas,
            ),
            templates: templateState.templates
              .filter((t) => screenState.screen!.components.some((i) => i.templateId === t.id))
              .map(normalizeTemplate),
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
/**
 * 读取不超过 2 MB 的配置包，经确认后导入为独立资源副本。
 *
 * @param event - 文件选择事件，从目标 input 的 files[0] 读取配置。
 * @returns 成功时兑现为导入大屏 ID；取消、未选文件、正在导入或失败时为 undefined。
 */
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
/**
 * 将选中实例置顶或置底，并重新生成连续层级。
 *
 * @param where - front 表示置顶，back 表示置底。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
/**
 * 将选中实例与大屏边界或中心对齐，并记录撤销快照。
 *
 * @param direction - left/center/right 表示水平对齐，top/middle/bottom 表示垂直对齐。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
/**
 * 在当前大屏实例化指定模板，按 8 像素网格定位并限制到画布内。
 *
 * @param templateId - 资产库中的模板标识；不存在时不创建。
 * @param x - 实例左侧逻辑坐标，默认 80 像素。
 * @param y - 实例顶部逻辑坐标，默认 320 像素。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
/**
 * 删除选中实例并清空选中状态，同时保留可撤销快照。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function removeInstance(): void {
  if (!screenState.screen || !selectedInstance.value) return;
  checkpoint();
  screenState.screen.components = screenState.screen.components.filter(
    (i) => i.instanceId !== screenState.selectedInstance,
  );
  clearSelection();
}
/**
 * 复制选中实例，分配新标识并向右下偏移 24 逻辑像素后约束到画布内。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
/**
 * 替换实例的对象槽位指派，再获取新对象底账；底账失败时保留指派并显示缺失值。
 *
 * @param instanceId - 需要改绑的组件实例标识。
 * @param slot - 模板内对象槽位标识。
 * @param id - 目标实体标识；空字符串表示解除指派，不请求底账。
 * @param source - 来源名称；空字符串表示显式自动，null 表示跟随曲线配置，省略时保持当前来源。
 * @returns 完成处理的 Promise，不携带业务返回值。
 */
export async function retarget(
  instanceId: string,
  slot: string,
  id: string,
  source?: string | null,
): Promise<void> {
  const instance = screenState.screen?.components.find((i) => i.instanceId === instanceId);
  const template = templateState.templates.find((t) => t.id === instance?.templateId);
  const type = template?.slots.find((s) => s.id === slot)?.schemaType;
  if (!instance || !type) return;
  checkpoint();
  if (id) {
    instance.slotBindings[slot] = id;
  } else {
    delete instance.slotBindings[slot];
    if (instance.slotSourceBindings) delete instance.slotSourceBindings[slot];
  }
  if (id && source !== undefined) {
    instance.slotSourceBindings ??= {};
    if (source !== null) instance.slotSourceBindings[slot] = source;
    else delete instance.slotSourceBindings[slot];
  }
  screenState.screen!.bindingVersion = 2;
  if (!id) return;
  try {
    const chosen = instance.slotSourceBindings?.[slot] ?? '';
    const result = await request<Envelope>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(id)}?byTarget=1&source=${encodeURIComponent(chosen)}`,
    );
    dataState.store.apply(result.data, true);
  } catch (e) {
    notify(`目标已切换；底账读取失败，缺失字段显示 --：${(e as Error).message}`, true);
  }
}

/**
 * 将各实例对象指派与数据源恢复到最近保存值，保留当前布局及控件修改。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function restoreBindings(): void {
  if (!screenState.screen || !screenState.savedScreen) return;
  checkpoint();
  const saved = JSON.parse(screenState.savedScreen) as ScreenConfig;
  for (const i of screenState.screen.components) {
    const orig = saved.components.find((s) => s.instanceId === i.instanceId);
    i.slotBindings = clone(orig?.slotBindings ?? {});
    i.slotSourceBindings = clone(orig?.slotSourceBindings ?? {});
  }
  notify('已恢复最近成功保存的对象指派与数据源；布局和字段修改保持不变');
}
