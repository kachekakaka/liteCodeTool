import { reactive } from 'vue';
import type { Router } from 'vue-router';
import { initialize, defaultScreenId } from '../services/application.ts';
import { request } from '../services/http.ts';
import { screenState, dirty, applyScreen, clearSelection } from '../stores/screens.ts';
import { templateState, draftDirty, prepareTemplate } from '../stores/templates.ts';
import { uiState, notify } from '../stores/application.ts';
import { dataState } from '../stores/entities.ts';
import { legacyTarget, validResourceId, replacesDraft } from './legacy.ts';
import type { ScreenConfig, ComponentTemplate } from '../types.ts';

export const resourceState = reactive({ loading: false, error: '', missing: false, path: '' });
let sequence = 0;
let controller: AbortController | undefined;

function currentTemplateRoute() {
  const draft = templateState.draft;
  return draft && templateState.templateRevisions[draft.id]
    ? `/workshop/${draft.id}`
    : '/workshop/new';
}

function lastScreen() {
  if (screenState.screen) return screenState.screen.id;
  try {
    const id = localStorage.getItem('litecode.screen.' + dataState.sourceMode);
    if (screenState.screens.some((s) => s.id === id)) return id!;
  } catch {
    /* 浏览器禁用本地存储时使用默认大屏。 */
  }
  return defaultScreenId;
}

export function installGuards(router: Router) {
  router.beforeEach(async (to) => {
    if (uiState.importing || uiState.creating) {
      notify('请等待新建或导入完成');
      return false;
    }
    const turn = ++sequence;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    resourceState.loading = true;
    try {
      await initialize();
      if (turn !== sequence) return false;
      const legacy = legacyTarget(to.path, to.hash, to.query.screen);
      if (legacy) return { path: legacy, replace: true };
      if (to.path === '/' || to.path === '/viewer') {
        return {
          path: `/screens/${lastScreen()}/${to.path === '/viewer' ? 'view' : 'edit'}`,
          replace: true,
        };
      }
      if (to.path === '/workshop') return { path: currentTemplateRoute(), replace: true };
      const id = String(to.params.screenId || to.params.templateId || '');
      const isScreen = !!to.params.screenId;
      const isTemplate = to.meta.mode === 'workshop';
      const isNew = to.name === 'template-new';
      const currentId = isScreen ? screenState.screen?.id : templateState.draft?.id;
      const sameNew =
        isNew && !!templateState.draft && !templateState.templateRevisions[templateState.draft.id];
      const replacing =
        (isScreen || isTemplate) && !sameNew && replacesDraft(currentId, isNew ? 'new' : id);
      if (replacing && (screenState.saving || templateState.draftSaving || uiState.importing)) {
        notify('请等待当前保存或导入结束后再切换资源');
        return false;
      }
      if (
        replacing &&
        (isScreen ? dirty.value : draftDirty.value) &&
        !confirm(`当前${isScreen ? '大屏' : '组件模板'}有未保存修改，是否放弃并打开另一资源？`)
      )
        return false;
      if (!isNew && (isScreen || isTemplate) && !validResourceId(id))
        throw new ResourceError('资源标识无效', true);
      if (isScreen && screenState.screen?.id !== id) {
        const row = await request<ScreenConfig>(`/api/screens/${encodeURIComponent(id)}`, {
          signal,
        });
        if (turn !== sequence) return false;
        applyScreen(row.data, row.revision);
      } else if (isNew && !sameNew) {
        prepareTemplate();
      } else if (isTemplate && !isNew && templateState.draft?.id !== id) {
        const row = await request<ComponentTemplate>(`/api/templates/${encodeURIComponent(id)}`, {
          signal,
        });
        if (turn !== sequence) return false;
        prepareTemplate(row.data);
        templateState.templateRevisions[id] = row.revision;
      }
      resourceState.error = '';
      resourceState.missing = false;
      resourceState.path = to.fullPath;
      uiState.drawer = false;
      clearSelection();
      return true;
    } catch (error) {
      if (turn !== sequence) return false;
      resourceState.error = (error as Error).message;
      resourceState.missing =
        error instanceof ResourceError
          ? error.missing
          : (error as { status?: number }).status === 404;
      resourceState.path = to.fullPath;
      return true;
    } finally {
      if (turn === sequence) resourceState.loading = false;
    }
  });
}

class ResourceError extends Error {
  constructor(
    message: string,
    public missing: boolean,
  ) {
    super(message);
  }
}
