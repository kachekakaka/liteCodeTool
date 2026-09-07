import { useRouter } from 'vue-router';
import {
  screenState,
  newScreen as createScreen,
  importConfiguration as importScreen,
} from '../stores/screens.ts';
import {
  templateState,
  draftDirty,
  prepareTemplate,
  saveTemplate as persistTemplate,
} from '../stores/templates.ts';
import { uiState, notify } from '../stores/application.ts';
import type { ComponentTemplate } from '../types.ts';

export function useNavigation() {
  const router = useRouter();
  function setView(mode: string) {
    const id = screenState.screen?.id;
    return router.push(
      mode === 'workshop'
        ? '/workshop'
        : mode === 'data'
          ? '/data'
          : id
            ? `/screens/${id}/${mode === 'viewer' ? 'view' : 'edit'}`
            : mode === 'viewer'
              ? '/viewer'
              : '/',
    );
  }
  function loadScreen(id: string) {
    return router.push(`/screens/${id}/edit`);
  }
  async function newScreen() {
    if (screenState.saving || uiState.importing || uiState.creating) return;
    uiState.creating = true;
    let id: string | undefined;
    try {
      id = await createScreen();
    } finally {
      uiState.creating = false;
    }
    if (id) await loadScreen(id);
  }
  async function importConfiguration(event: Event) {
    if (screenState.saving || uiState.creating) return;
    const id = await importScreen(event);
    if (id) await loadScreen(id);
  }
  async function editTemplate(template?: ComponentTemplate) {
    if (template) return router.push(`/workshop/${template.id}`);
    if (templateState.draftSaving) return notify('请等待模板保存结束');
    if (draftDirty.value && !confirm('当前组件模板有未保存修改，是否放弃并新建？')) return;
    prepareTemplate();
    return router.push('/workshop/new');
  }
  async function saveTemplate(asNew = false) {
    const origin = router.currentRoute.value.fullPath;
    const id = await persistTemplate(asNew);
    if (id && router.currentRoute.value.fullPath === origin)
      await router.replace(`/workshop/${id}`);
  }
  return { setView, loadScreen, newScreen, importConfiguration, editTemplate, saveTemplate };
}
