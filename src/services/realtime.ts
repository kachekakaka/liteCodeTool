import { EntityStore } from '../engine/core.ts';
import type { Envelope } from '../types.ts';
import { dataState } from '../stores/entities.ts';
import { notify } from '../stores/application.ts';
import { request } from './http.ts';

function acceptMode(mode: string): void {
  if (dataState.sourceMode !== 'unknown' && dataState.sourceMode !== mode) {
    dataState.store = new EntityStore();
    dataState.lastUpdate = null;
    notify('数据模式发生变化，已清空上一模式的实体与历史', true);
  }
  dataState.sourceMode = mode;
}
async function refreshSnapshots(): Promise<void> {
  try {
    const result = await request<{ mode: string; paused: boolean; snapshots: Envelope[] }>(
      '/api/bootstrap',
    );
    acceptMode(result.data.mode);
    dataState.paused = !!result.data.paused;
    for (const e of result.data.snapshots) dataState.store.apply(e, true);
  } catch {
    notify('连接已恢复，但初始底账补查失败；保留已知值并继续接收增量', true);
  }
}
function connect(): void {
  if (disposed) return;
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket.onopen = () => {
    dataState.connected = true;
    const reconnect = attempt > 0;
    attempt = 0;
    if (reconnect) void refreshSnapshots();
  };
  socket.onmessage = (event) => {
    try {
      const packet = JSON.parse(event.data);
      if (packet.kind === 'update') {
        dataState.store.apply(packet.envelope);
        dataState.lastUpdate = Date.now();
      } else if (packet.kind === 'hello') {
        acceptMode(packet.mode);
        dataState.paused = !!packet.paused;
      } else if (packet.kind === 'demo-state') dataState.paused = !!packet.paused;
    } catch {
      notify('收到无效推流消息，本条未应用', true);
    }
  };
  socket.onclose = () => {
    dataState.connected = false;
    if (!disposed)
      retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 300);
  };
  socket.onerror = () => socket?.close();
}
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
let clock: ReturnType<typeof setInterval> | undefined;
let disposed = false;
export function startRealtime() {
  disposed = false;
  if (!clock) clock = setInterval(() => (dataState.now = Date.now()), 1000);
  if (!socket) connect();
}
export function stopRealtime() {
  disposed = true;
  if (clock) clearInterval(clock);
  if (retry) clearTimeout(retry);
  if (socket) {
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    socket.onopen = null;
    socket.close();
  }
  dataState.connected = false;
  socket = null;
  clock = undefined;
  retry = undefined;
  attempt = 0;
}
if (import.meta.hot) import.meta.hot.dispose(stopRealtime);
