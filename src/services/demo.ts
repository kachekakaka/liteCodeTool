import { request } from './http.ts';
import { dataState } from '../stores/entities.ts';
import { notify } from '../stores/application.ts';
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
