import { reactive } from 'vue';

export const uiState = reactive({
  loading: true,
  importing: false,
  creating: false,
  help: false,
  error: '',
  notice: '',
  noticeError: false,
  drawer: false,
  drawerInstance: '',
  drawerSlot: '',
  search: '',
  leftOpen: true,
  rightOpen: true,
});
export function notify(message: string, error = false): void {
  uiState.notice = message;
  uiState.noticeError = error;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => {
      uiState.notice = '';
    },
    error ? 8000 : 3500,
  );
}
let noticeTimer: ReturnType<typeof setTimeout>;
export function openDrawer(instanceId = ''): void {
  uiState.drawerInstance = instanceId;
  uiState.drawerSlot = '';
  uiState.search = '';
  uiState.drawer = true;
}
export async function fullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify('浏览器未允许全屏，可使用浏览器的全屏功能', true);
  }
}
