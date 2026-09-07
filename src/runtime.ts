import { computed, reactive } from 'vue';
import { clone, EntityStore, effectiveControl, fitGeometry, validateScreen, validateTemplate } from './engine/core.ts';
import type { ComponentInstance, ComponentTemplate, Control, ControlType, Envelope, Override, Schema, ScreenConfig, Slot } from './types.ts';

export const state = reactive({
  loading: true, importing: false, help: false, error: '', notice: '', noticeError: false,
  view: location.hash === '#viewer' ? 'viewer' : location.hash === '#workshop' ? 'workshop' : location.hash === '#data' ? 'data' : 'editor',
  screen: null as ScreenConfig | null, templates: [] as ComponentTemplate[], schemas: [] as Schema[],
  screens: [] as { id: string; name: string }[], templateRevisions: {} as Record<string, string>,
  savedScreen: '', screenRevision: '', saving: false,
  selectedInstance: '', selectedControl: '',
  draft: null as ComponentTemplate | null, savedDraft: '', draftSaving: false,
  drawer: false, drawerInstance: '', drawerSlot: '', search: '',
  sourceMode: 'unknown', connected: false, lastUpdate: null as number | null, paused: false,
  now: Date.now(), store: new EntityStore(), leftOpen: true, rightOpen: true,
  zoom: 'fit', undo: [] as string[], redo: [] as string[]
});
export const dirty = computed(() => !!state.screen && JSON.stringify(state.screen) !== state.savedScreen);
export const draftDirty = computed(() => !!state.draft && JSON.stringify(state.draft) !== state.savedDraft);
export const selectedInstance = computed(() => state.screen?.components.find(i => i.instanceId === state.selectedInstance));
export const selectedTemplate = computed(() => state.view === 'workshop' ? state.draft : state.templates.find(t => t.id === selectedInstance.value?.templateId));
export const selectedControl = computed(() => selectedTemplate.value?.controls.find(c => c.id === state.selectedControl));
export const displayControl = computed(() => selectedControl.value ? (state.view === 'workshop' || !selectedInstance.value ? selectedControl.value : effectiveControl(selectedControl.value, selectedInstance.value)) : null);
export const uid = (prefix: string): string => `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join('')}`;
let noticeTimer: ReturnType<typeof setTimeout>;
export function notify(message: string, error = false): void { state.notice = message; state.noticeError = error; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { state.notice = ''; }, error ? 8000 : 3500); }
export async function request<T>(url: string, options: RequestInit = {}): Promise<{ data: T; revision: string }> {
  const response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(10_000), headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return { data: data as T, revision: response.headers.get('etag') || '' };
}
export function checkpoint(): void { if (!state.screen) return; state.undo.push(JSON.stringify(state.screen)); if (state.undo.length > 50) state.undo.shift(); state.redo = []; }
export function undo(): void { if (!state.screen || !state.undo.length) return; state.redo.push(JSON.stringify(state.screen)); state.screen = JSON.parse(state.undo.pop()!); clearSelection(); }
export function redo(): void { if (!state.screen || !state.redo.length) return; state.undo.push(JSON.stringify(state.screen)); state.screen = JSON.parse(state.redo.pop()!); clearSelection(); }
export function clearSelection(): void { state.selectedInstance = ''; state.selectedControl = ''; }
export function select(instanceId: string, controlId = ''): void { if (state.view === 'viewer') return; state.selectedInstance = instanceId; state.selectedControl = controlId; }
export function setView(view: string): void { state.view = view; state.drawer = false; state.selectedControl = ''; location.hash = view; if (view === 'workshop' && !state.draft) editTemplate(); }
function applyScreen(data: ScreenConfig, revision: string): void { state.screen = data; state.savedScreen = JSON.stringify(data); state.screenRevision = revision; state.undo = []; state.redo = []; clearSelection(); try { localStorage.setItem('litecode.screen.'+state.sourceMode,data.id); } catch {} }
export async function loadScreen(id: string): Promise<void> {
  if (dirty.value && !confirm('当前大屏有未保存修改，重新载入将丢弃这些修改。是否继续？')) return;
  try { const result = await request<ScreenConfig>(`/api/screens/${encodeURIComponent(id)}`); applyScreen(result.data, result.revision); } catch (e) { notify((e as Error).message, true); }
}
export async function saveScreen(): Promise<void> {
  if (!state.screen || state.saving) return;
  const submitted = clone(state.screen);
  state.saving = true;
  try {
    validateScreen(submitted, state.templates, state.schemas);
    const { revision } = await request<ScreenConfig>(`/api/screens/${submitted.id}`, { method: 'PUT', headers: { 'If-Match': state.screenRevision }, body: JSON.stringify(submitted) });
    if (state.screen?.id === submitted.id) { state.screenRevision = revision; state.savedScreen = JSON.stringify(submitted); }
    const item = state.screens.find(x => x.id === submitted.id); if (item) item.name = submitted.name;
    notify('大屏默认配置已保存；之后的临时修改仍会单独标记');
  } catch (e) { notify(`保存失败：${(e as Error).message}`, true); } finally { state.saving = false; }
}
export async function newScreen(): Promise<void> {
  if (dirty.value && !confirm('新建前将离开当前大屏，未保存修改不会保留。是否继续？')) return;
  const name = prompt('输入新大屏名称', '新建监控大屏'); if (!name?.trim()) return;
  const screen: ScreenConfig = { id: uid('screen'), name: name.trim(), resolution: { width: 1920, height: 1080 }, background: '#030B17', components: [] };
  try { const result = await request<ScreenConfig>(`/api/screens/${screen.id}`, { method: 'POST', headers: { 'If-None-Match': '*' }, body: JSON.stringify(screen) }); state.screens.push({ id: screen.id, name: screen.name }); applyScreen(result.data, result.revision); } catch (e) { notify((e as Error).message, true); }
}
export function exportScreen(): void {
  if (!state.screen) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'litecode.screen.v1', screen: state.screen, templates: state.templates.filter(t => state.screen!.components.some(i => i.templateId === t.id)) }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `${state.screen.id}.litecode.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// 配置包包含所引用的组件模板；导入创建独立副本，绝不覆盖现有模板或大屏。
export async function importConfiguration(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement; const file = input.files?.[0];
  if (!file || state.importing) return;
  input.value = '';
  if (file.size > 2_000_000) return notify('配置包超过 2 MB，请减少内嵌图片后重试', true);
  if (dirty.value && !confirm('导入会打开一个新的大屏副本，是否放弃当前未保存修改？')) return;
  state.importing = true;
  try {
    const bundle = JSON.parse(await file.text());
    const result = await request<{ screen: { data: ScreenConfig; revision: string }; templates: { data: ComponentTemplate; revision: string }[] }>('/api/import', { method: 'POST', body: JSON.stringify(bundle) });
    for (const row of result.data.templates) { state.templates.push(row.data); state.templateRevisions[row.data.id] = row.revision; }
    state.screens.push({ id: result.data.screen.data.id, name: result.data.screen.data.name });
    applyScreen(result.data.screen.data, result.data.screen.revision);
    notify('配置包已导入为独立副本；原有大屏与模板未被修改');
  } catch (e) { notify(`导入失败：${(e as Error).message}`, true); }
  finally { state.importing = false; }
}
export function moveLayer(where: 'front' | 'back'): void {
  if (!selectedInstance.value || !state.screen) return; checkpoint();
  const sorted = [...state.screen.components].sort((a,b)=>(a.position.zIndex ?? 1)-(b.position.zIndex ?? 1));
  const current = selectedInstance.value; const list = sorted.filter(i=>i!==current);
  where==='front' ? list.push(current) : list.unshift(current);
  list.forEach((i,n)=>{i.position.zIndex=n+1;});
}
export function alignInstance(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
  if (!selectedInstance.value || !state.screen) return; checkpoint();
  const p=selectedInstance.value.position,r=state.screen.resolution;
  if(direction==='left')p.x=0; if(direction==='center')p.x=(r.width-p.w)/2; if(direction==='right')p.x=r.width-p.w;
  if(direction==='top')p.y=0; if(direction==='middle')p.y=(r.height-p.h)/2; if(direction==='bottom')p.y=r.height-p.h;
}
export function addTemplate(templateId: string, x = 80, y = 320): void {
  if (!state.screen || state.view !== 'editor') return;
  const t = state.templates.find(t => t.id === templateId); if (!t) return;
  checkpoint();
  const p = fitGeometry({ x: Math.round(x / 8) * 8, y: Math.round(y / 8) * 8, w: t.layout.width, h: t.layout.height }, state.screen.resolution.width, state.screen.resolution.height);
  const instance: ComponentInstance = { instanceId: uid('inst'), templateId, position: { ...p, zIndex: Math.max(0, ...state.screen.components.map(i => i.position.zIndex ?? 1)) + 1 }, slotBindings: {}, controlOverrides: {} };
  state.screen.components.push(instance); select(instance.instanceId);
}
export function removeInstance(): void { if (!state.screen || !selectedInstance.value) return; checkpoint(); state.screen.components = state.screen.components.filter(i => i.instanceId !== state.selectedInstance); clearSelection(); }
export function duplicateInstance(): void {
  if (!selectedInstance.value || !state.screen) return; checkpoint();
  const i = clone(selectedInstance.value); i.instanceId = uid('inst'); i.position = { ...i.position, ...fitGeometry({ ...i.position, x: i.position.x + 24, y: i.position.y + 24 }, state.screen.resolution.width, state.screen.resolution.height) };
  state.screen.components.push(i); select(i.instanceId);
}
export async function retarget(instanceId: string, slot: string, id: string): Promise<void> {
  const instance = state.screen?.components.find(i => i.instanceId === instanceId); const template = state.templates.find(t => t.id === instance?.templateId);
  const type = template?.slots.find(s => s.id === slot)?.schemaType;
  if (!instance || !type) return;
  checkpoint(); if (id) instance.slotBindings[slot] = id; else delete instance.slotBindings[slot];
  if (!id) return;
  try { const result = await request<Envelope>(`/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(id)}`); state.store.apply(result.data, true); }
  catch (e) { notify(`目标已切换；底账读取失败，缺失字段显示 --：${(e as Error).message}`, true); }
}
export function restoreBindings(): void {
  if (!state.screen || !state.savedScreen) return;
  checkpoint();
  const saved = JSON.parse(state.savedScreen) as ScreenConfig;
  for (const i of state.screen.components) i.slotBindings = clone(saved.components.find(s => s.instanceId === i.instanceId)?.slotBindings ?? {});
  notify('已恢复最近成功保存的对象指派；布局和字段修改保持不变');
}
export function openDrawer(instanceId = ''): void { state.drawerInstance = instanceId; state.drawerSlot = ''; state.search = ''; state.drawer = true; }
export function editTemplate(template?: ComponentTemplate): void {
  if (draftDirty.value && !confirm('当前组件模板有未保存修改，是否放弃并打开另一模板？')) return;
  state.draft = template ? clone(template) : { id: uid('tpl'), name: '新建组件模板', category: '自定义组件', layout: { width: 608, height: 320 }, slots: [{ id: 'slot_1', label: '对象1', schemaType: 'vessel' }], controls: [], showHeader: true };
  state.savedDraft = JSON.stringify(state.draft); state.selectedControl = ''; state.view = 'workshop'; location.hash = 'workshop';
}
export function addControl(type: ControlType): void {
  if (!state.draft) return;
  const atom = state.templates.find(t => t.id === `atom_${type}`)?.controls[0]; if (!atom) return;
  const c = clone(atom); c.id = uid('ctrl');
  c.style = { ...c.style, ...fitGeometry({ ...c.style, x: 20 + (state.draft.controls.length % 4) * 12, y: 58 + (state.draft.controls.length % 4) * 12 }, state.draft.layout.width, state.draft.layout.height) };
  if (type === 'line' && !state.draft.slots.length) addSlot();
  if (type === 'line' && c.props.series) c.props.series[0].slotId = state.draft.slots[0].id;
  state.draft.controls.push(c); state.selectedControl = c.id;
}
export function createSlot(label?: string, schemaType?: string): Slot | null {
  const target = state.view === 'workshop' ? state.draft : selectedTemplate.value;
  if (!target) return null;
  const schema = schemaType || target.slots[0]?.schemaType || state.schemas.find(s => s.isEntity)?.type || 'vessel';
  const n = target.slots.length + 1;
  const slotName = (label && label.trim()) || `对象${n}`;
  const slot: Slot = { id: uid('slot'), label: slotName, schemaType: schema };
  target.slots.push(slot);
  if (selectedInstance.value && !selectedInstance.value.slotBindings[slot.id]) {
    checkpoint();
    selectedInstance.value.slotBindings[slot.id] = '';
  }
  return slot;
}
export function renameSlot(slotId: string, newLabel: string): void {
  const target = state.view === 'workshop' ? state.draft : selectedTemplate.value;
  if (!target) return;
  const s = target.slots.find(x => x.id === slotId);
  if (s && newLabel.trim()) {
    if (state.view !== 'workshop') checkpoint();
    s.label = newLabel.trim();
  }
}
export function addSlot(): void {
  createSlot();
}
export function removeSlot(slot: Slot): void {
  const target = state.view === 'workshop' ? state.draft : selectedTemplate.value;
  if (!target) return;
  if (target.controls.some(c => c.binding?.slotId === slot.id || c.props.series?.some(s => s.slotId === slot.id))) return notify('该对象槽位仍被控件引用，请先修改相关绑定', true);
  if (state.view !== 'workshop') checkpoint();
  target.slots = target.slots.filter(s => s.id !== slot.id);
  if (selectedInstance.value) delete selectedInstance.value.slotBindings[slot.id];
}
export async function saveTemplate(asNew = false): Promise<void> {
  if (!state.draft || state.draftSaving) return;
  const before = JSON.stringify(state.draft); const draftId = state.draft.id;
  const data = clone(state.draft);
  if (asNew) { data.id = uid('tpl'); data.name += ' · 副本'; }
  const revision = state.templateRevisions[data.id];
  if (revision && !confirm('更新组件模板会影响所有引用它的大屏实例。继续更新？需要隔离时请使用“另存为新模板”。')) return;
  state.draftSaving = true;
  try {
    validateTemplate(data, state.schemas);
    const result = await request<ComponentTemplate>(`/api/templates/${data.id}`, { method: revision ? 'PUT' : 'POST', headers: revision ? { 'If-Match': revision } : { 'If-None-Match': '*' }, body: JSON.stringify(data) });
    const index = state.templates.findIndex(t => t.id === data.id); if (index === -1) state.templates.push(data); else state.templates[index] = data;
    state.templateRevisions[data.id] = result.revision;
    if (state.draft?.id !== draftId) { notify('原组件模板已保存；当前正在编辑的另一个模板未受影响'); return; }
    if (JSON.stringify(state.draft) === before) state.draft = clone(data);
    else if (asNew && state.draft) { state.draft.id = data.id; state.draft.name = data.name; }
    state.savedDraft = JSON.stringify(data); notify('组件模板已保存入库，可在大屏画布中使用');
  } catch (e) { notify(`组件模板保存失败：${(e as Error).message}`, true); } finally { state.draftSaving = false; }
}
export function patchControl(patch: Override): void {
  const control = selectedControl.value; if (!control) return;
  if (state.view === 'workshop') { Object.assign(control, patch, { style: { ...control.style, ...patch.style }, props: { ...control.props, ...patch.props } }); return; }
  if (!selectedInstance.value) return; checkpoint();
  const old = selectedInstance.value.controlOverrides[control.id] ?? {};
  selectedInstance.value.controlOverrides[control.id] = { ...old, ...(Object.hasOwn(patch, 'binding') ? { binding: patch.binding } : {}), style: { ...old.style, ...patch.style }, props: { ...old.props, ...patch.props } };
}
export async function demoAction(action: string): Promise<void> { try { const r = await request<{ paused: boolean }>('/api/demo', { method: 'POST', body: JSON.stringify({ action }) }); state.paused = r.data.paused; notify(action === 'discover' ? '已注入新发现演示船；未提供的航速和状态保持空值' : state.paused ? '演示推流已暂停，最后值与更新时间保留' : '演示推流已恢复'); } catch (e) { notify((e as Error).message, true); } }
export async function fullscreen(): Promise<void> { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { notify('浏览器未允许全屏，可使用浏览器的全屏功能', true); } }

let socket: WebSocket | null = null, retry: ReturnType<typeof setTimeout> | undefined, attempt = 0, clock: ReturnType<typeof setInterval> | undefined, disposed = false;
function acceptMode(mode: string): void {
  if (state.sourceMode !== 'unknown' && state.sourceMode !== mode) { state.store = new EntityStore(); state.lastUpdate = null; notify('数据模式发生变化，已清空上一模式的实体与历史', true); }
  state.sourceMode = mode;
}
async function refreshSnapshots(): Promise<void> {
  try { const result = await request<{ mode: string; paused: boolean; snapshots: Envelope[] }>('/api/bootstrap'); acceptMode(result.data.mode); state.paused = !!result.data.paused; for (const e of result.data.snapshots) state.store.apply(e, true); } catch { notify('连接已恢复，但初始底账补查失败；保留已知值并继续接收增量', true); }
}
function connect(): void {
  if (disposed) return;
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket.onopen = () => { state.connected = true; const reconnect = attempt > 0; attempt = 0; if (reconnect) void refreshSnapshots(); };
  socket.onmessage = event => {
    try { const packet = JSON.parse(event.data); if (packet.kind === 'update') { state.store.apply(packet.envelope); state.lastUpdate = Date.now(); } else if (packet.kind === 'hello') { acceptMode(packet.mode); state.paused = !!packet.paused; } else if (packet.kind === 'demo-state') state.paused = !!packet.paused; } catch { notify('收到无效推流消息，本条未应用', true); }
  };
  socket.onclose = () => { state.connected = false; if (!disposed) retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 300); };
  socket.onerror = () => socket?.close();
}
export async function initialize(): Promise<void> {
  state.loading = true; state.error = '';
  if (!clock) clock = setInterval(() => { state.now = Date.now(); }, 1000);
  if (!socket) connect();
  try {
    const r = await request<{ mode: string; schemas: Schema[]; templates: { data: ComponentTemplate; revision: string }[]; screen: { data: ScreenConfig; revision: string }; screens: { id: string; name: string }[]; snapshots: Envelope[]; lastUpdate: number | null; paused: boolean }>('/api/bootstrap');
    state.schemas = r.data.schemas; state.templates = r.data.templates.map(t => t.data);
    state.templateRevisions = Object.fromEntries(r.data.templates.map(t => [t.data.id, t.revision]));
    state.screens = r.data.screens; acceptMode(r.data.mode); state.paused = !!r.data.paused;
    for (const envelope of r.data.snapshots) state.store.apply(envelope, true);
    let selected = r.data.screen;
    try { const lastId = new URLSearchParams(location.search).get('screen') || localStorage.getItem('litecode.screen.'+state.sourceMode); if(lastId && lastId!==selected.data.id && state.screens.some(s=>s.id===lastId)){const loaded=await request<ScreenConfig>(`/api/screens/${encodeURIComponent(lastId)}`);selected=loaded;} } catch {}
    applyScreen(selected.data, selected.revision); if (state.lastUpdate === null) state.lastUpdate = r.data.lastUpdate;
    if (state.view === 'workshop' && !state.draft) editTemplate();
  } catch (e) { state.error = `无法加载平台数据：${(e as Error).message}`; } finally { state.loading = false; }
}
export function dispose(): void { disposed = true; if (clock) clearInterval(clock); if (retry) clearTimeout(retry); socket?.close(); clearTimeout(noticeTimer); }
window.addEventListener('beforeunload', event => { if (dirty.value || draftDirty.value) event.preventDefault(); });
window.addEventListener('hashchange', () => { const value = location.hash.slice(1); if (['editor', 'viewer', 'workshop', 'data'].includes(value)) { state.view = value; if (value === 'workshop' && !state.draft) editTemplate(); } });
