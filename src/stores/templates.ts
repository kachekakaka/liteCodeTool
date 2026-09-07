import { computed, reactive } from 'vue';
import { clone, validateTemplate } from '../engine/core.ts';
import type { ComponentTemplate } from '../types.ts';
import { dataState } from './entities.ts';
import { uid } from '../utils/identity.ts';
import { notify } from './application.ts';
import { request } from '../services/http.ts';
/** 模板资源库、各资源的 ETag 和唯一工坊草稿；草稿与库中对象相互独立。 */
export const templateState = reactive({
  templates: [] as ComponentTemplate[],
  templateRevisions: {} as Record<string, string>,
  draft: null as ComponentTemplate | null,
  savedDraft: '',
  draftSaving: false,
});
export const draftDirty = computed(
  () => !!templateState.draft && JSON.stringify(templateState.draft) !== templateState.savedDraft,
);
/**
 * 校验并保存模板草稿，按版本确认影响范围；异步响应不会覆盖另一模板草稿。
 *
 * @param asNew - 是否另存为新模板，默认 false；true 会分配新 ID 并追加副本名称。
 * @returns 当前草稿保存成功时兑现为模板 ID；取消、无草稿、正在保存、失败或草稿已切换时为 undefined。
 */
export async function saveTemplate(asNew = false): Promise<string | undefined> {
  if (!templateState.draft || templateState.draftSaving) return;
  const before = JSON.stringify(templateState.draft);
  const draftId = templateState.draft.id;
  const data = clone(templateState.draft);
  if (asNew) {
    data.id = uid('tpl');
    data.name += ' · 副本';
  }
  const revision = templateState.templateRevisions[data.id];
  if (
    revision &&
    !confirm('更新组件模板会影响所有引用它的大屏实例。继续更新？需要隔离时请使用“另存为新模板”。')
  )
    return;
  templateState.draftSaving = true;
  try {
    validateTemplate(data, dataState.schemas);
    const result = await request<ComponentTemplate>(`/api/templates/${data.id}`, {
      method: revision ? 'PUT' : 'POST',
      headers: revision ? { 'If-Match': revision } : { 'If-None-Match': '*' },
      body: JSON.stringify(data),
    });
    const index = templateState.templates.findIndex((t) => t.id === data.id);
    if (index === -1) templateState.templates.push(data);
    else templateState.templates[index] = data;
    templateState.templateRevisions[data.id] = result.revision;
    if (templateState.draft?.id !== draftId) {
      notify('原组件模板已保存；当前正在编辑的另一个模板未受影响');
      return;
    }
    if (JSON.stringify(templateState.draft) === before) templateState.draft = clone(data);
    else if (asNew && templateState.draft) {
      templateState.draft.id = data.id;
      templateState.draft.name = data.name;
    }
    templateState.savedDraft = JSON.stringify(data);
    notify('组件模板已保存入库，可在大屏画布中使用');
    return data.id;
  } catch (e) {
    notify(`组件模板保存失败：${(e as Error).message}`, true);
  } finally {
    templateState.draftSaving = false;
  }
}
/**
 * 创建独立编辑草稿并建立比较基线，避免直接修改模板库对象。
 *
 * @param template - 已有模板；省略时生成含默认对象槽位的空白模板。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function prepareTemplate(template?: ComponentTemplate): void {
  templateState.draft = template
    ? clone(template)
    : {
        id: uid('tpl'),
        name: '新建组件模板',
        category: '自定义组件',
        layout: { width: 608, height: 320 },
        slots: [{ id: 'slot_1', label: '对象1', schemaType: 'vessel' }],
        controls: [],
        showHeader: true,
      };
  templateState.savedDraft = JSON.stringify(templateState.draft);
}
