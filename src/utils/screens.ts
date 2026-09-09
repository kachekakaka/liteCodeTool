import type { ScreenConfig } from '../types.ts';
import { clone } from '../engine/core.ts';

/**
 * 复制大屏配置，替换资源和实例身份，保留共享模板及来源继承语义。
 * @param source - 已保存的大屏配置，不会被修改。
 * @param name - 新大屏名称。
 * @param nextId - 为大屏及各实例生成独立 ID 的函数。
 * @returns 与源配置不共享可变对象的大屏副本。
 */
export function copyScreenConfiguration(
  source: ScreenConfig,
  name: string,
  nextId: () => string,
): ScreenConfig {
  const result = clone(source);
  result.id = nextId();
  result.name = name.trim();
  for (const instance of result.components) instance.instanceId = nextId();
  return result;
}
