import { nextTick, onMounted, onUnmounted } from 'vue';
import { uiState } from '../stores/application.ts';
import {
  screenState,
  saveScreen,
  clearSelection,
  undo,
  redo,
  removeInstance,
} from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { useNavigation } from './useNavigation.ts';
import { resourceState } from '../router/guards.ts';
/**
 * 在页面生命周期内注册保存、撤销、删除和退出快捷键，并避开输入框与弹层冲突。
 *
 * @param mode - 页面模式：editor 为大屏编辑，workshop 为模板工坊，viewer 为显示态。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function useEditorKeyboard(mode: 'editor' | 'workshop' | 'viewer') {
  const navigation = useNavigation();
  /**
   * 根据页面模式和当前焦点分发快捷键；资源加载、新建或导入期间不处理。
   *
   * @param event - 窗口键盘事件；命中快捷键时会阻止对应默认行为。
   * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
   */
  function keyboard(event: KeyboardEvent) {
    if (screenState.embedded) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's')
        event.preventDefault();
      if (event.key === 'Escape') {
        uiState.drawer = false;
        uiState.help = false;
      }
      return;
    }
    if (resourceState.loading || uiState.importing || uiState.creating) return;
    if (uiState.help) {
      if (event.key === 'Escape') uiState.help = false;
      return;
    }
    if (uiState.drawer) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      (event.target as HTMLElement)?.blur?.();
      void nextTick().then(() => (mode === 'workshop' ? navigation.saveTemplate() : saveScreen()));
      return;
    }
    if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))
      return;
    if (event.key === 'Escape') {
      if (mode === 'viewer') void navigation.setView('editor');
      else clearSelection();
    }
    if (mode === 'editor' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if (event.key === 'Delete' && mode === 'workshop' && templateState.draft) {
      templateState.draft.controls = templateState.draft.controls.filter(
        (c) => c.id !== screenState.selectedControl,
      );
      screenState.selectedControl = '';
    }
    if (event.key === 'Delete' && mode === 'editor' && !screenState.selectedControl)
      removeInstance();
  }
  onMounted(() => window.addEventListener('keydown', keyboard));
  onUnmounted(() => window.removeEventListener('keydown', keyboard));
}
