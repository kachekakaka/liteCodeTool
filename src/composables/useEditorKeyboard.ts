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
export function useEditorKeyboard(mode: 'editor' | 'workshop' | 'viewer') {
  const navigation = useNavigation();
  function keyboard(event: KeyboardEvent) {
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
