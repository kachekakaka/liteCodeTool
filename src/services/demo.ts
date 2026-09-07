import { request } from './http.ts';
import { dataState } from '../stores/entities.ts';
import { notify } from '../stores/application.ts';
/**
 * 请求服务端控制演示推流，并更新界面暂停状态。
 *
 * @param action - 演示动作名称：toggle 切换暂停状态，discover 注入新发现演示船。
 * @returns 动作处理结束的 Promise；失败通过界面提示反馈。
 */
export async function demoAction(action: string) {
  try {
    const r = await request<{ paused: boolean }>('/api/demo', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    dataState.paused = r.data.paused;
    notify(
      action === 'discover'
        ? '已注入新发现演示船；未提供的航速和状态保持空值'
        : dataState.paused
          ? '演示推流已暂停，最后值与更新时间保留'
          : '演示推流已恢复',
    );
  } catch (error) {
    notify((error as Error).message, true);
  }
}
