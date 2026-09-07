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
/**
 * 显示全局操作提示，并替换上一提示的自动关闭计时器。
 *
 * @param message - 向用户展示的提示文字。
 * @param error - 是否为错误提示，默认 false；普通提示显示 3.5 秒，错误提示显示 8 秒。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
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
/**
 * 打开对象指派抽屉，并清空旧槽位及搜索条件。
 *
 * @param instanceId - 优先展示的实例标识；默认空字符串表示未指定实例。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function openDrawer(instanceId = ''): void {
  uiState.drawerInstance = instanceId;
  uiState.drawerSlot = '';
  uiState.search = '';
  uiState.drawer = true;
}
/**
 * 切换浏览器全屏状态；浏览器拒绝时通过全局提示反馈。
 *
 * @returns 完成处理的 Promise，不携带业务返回值。
 */
export async function fullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notify('浏览器未允许全屏，可使用浏览器的全屏功能', true);
  }
}
