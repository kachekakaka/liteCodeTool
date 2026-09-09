import { uiState } from '../stores/application.ts';
import { dataState } from '../stores/entities.ts';
import { screenState } from '../stores/screens.ts';
import { templateState } from '../stores/templates.ts';
import { request } from './http.ts';
import { normalizeTemplate } from '../engine/core.ts';
import { startRealtime, stopRealtime } from './realtime.ts';
import type { ComponentTemplate, Envelope, Schema, ScreenConfig } from '../types.ts';

/**
 * 应用启动接口的完整数据快照；用于建立模式、资源列表、版本和实体底账。
 */
interface Bootstrap {
  /**
   * 服务端当前数据模式，例如 demo 或 live。
   */
  mode: string;
  /**
   * 演示推流是否暂停。
   */
  paused: boolean;
  /**
   * 当前可用的数据模式定义。
   */
  schemas: Schema[];
  /**
   * 模板配置与各自 ETag 的记录列表。
   */
  templates: {
    /**
     * 模板配置本身。
     */
    data: ComponentTemplate;
    /**
     * 该模板的 ETag，并发保存时发送到 If-Match。
     */
    revision: string;
  }[];
  /**
   * 可打开的大屏 ID 和名称列表。
   */
  screens: {
    /**
     * 大屏资源 ID。
     */
    id: string;
    /**
     * 大屏显示名称。
     */
    name: string;
  }[];
  /**
   * 默认大屏配置及其 ETag；初始化只提取默认 ID，由路由加载目标资源。
   */
  screen: {
    /**
     * 默认大屏配置。
     */
    data: ScreenConfig;
    /**
     * 默认大屏的 ETag。
     */
    revision: string;
  };
  /**
   * 实体与全局底账数据包，不作为历史曲线样本。
   */
  snapshots: Envelope[];
  /**
   * 服务端最近应用增量的时间戳，单位毫秒；尚无更新时为 null。
   */
  lastUpdate: number | null;
}

let pending: Promise<void> | undefined;
let initialized = false;
export let defaultScreenId = '';

// 路由与入口共享此服务，初始化不依赖任何组件挂载。
/**
 * 幂等加载启动数据与底账并启动实时连接；路由与入口共享同一进行中的 Promise，不依赖组件挂载。
 *
 * @returns 初始化完成的 Promise；完成后重复调用立即兑现，失败后允许重新发起请求。
 * @throws 初始化请求失败时记录界面错误并继续拒绝 Promise。
 */
export function initialize(): Promise<void> {
  if (initialized) return Promise.resolve();
  if (pending) return pending;
  uiState.loading = true;
  uiState.error = '';
  pending = request<Bootstrap>('/api/bootstrap')
    .then(({ data }) => {
      dataState.schemas = data.schemas;
      dataState.sourceMode = data.mode;
      dataState.paused = data.paused;
      dataState.lastUpdate = data.lastUpdate;
      templateState.templates = data.templates.map((row) => normalizeTemplate(row.data));
      templateState.templateRevisions = Object.fromEntries(
        data.templates.map((row) => [row.data.id, row.revision]),
      );
      screenState.screens = data.screens;
      defaultScreenId = data.screen.data.id;
      for (const envelope of data.snapshots) dataState.store.apply(envelope, true);
      initialized = true;
      startRealtime();
    })
    .catch((error) => {
      uiState.error = `无法加载平台数据：${error.message}`;
      throw error;
    })
    .finally(() => {
      pending = undefined;
      uiState.loading = false;
    });
  return pending;
}

/**
 * 释放实时连接及计时器，供模块热替换或应用卸载调用。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
export function dispose() {
  stopRealtime();
}
if (import.meta.hot) import.meta.hot.dispose(dispose);
