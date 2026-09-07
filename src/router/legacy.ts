/**
 * 将根路径上的旧 hash 和 screen 查询参数转换为标准资源路径。
 *
 * @param path - 当前 URL 路径；不是根路径时不改写。
 * @param hash - 带或不带 # 的旧页面模式。
 * @param screen - 旧 screen 查询值；仅使用非空字符串，忽略数组等其他形态。
 * @returns 需要替换的标准路径；无需转换时返回 null，未知旧模式转到 /invalid-entry。
 */
export function legacyTarget(path: string, hash: string, screen: unknown) {
  if (path !== '/') return null;
  const mode = hash.replace(/^#/, '') || 'editor';
  if (!['editor', 'viewer', 'workshop', 'data'].includes(mode)) return '/invalid-entry';
  if (mode === 'workshop') return '/workshop';
  if (mode === 'data') return '/data';
  if (typeof screen === 'string' && screen) {
    return `/screens/${encodeURIComponent(screen)}/${mode === 'viewer' ? 'view' : 'edit'}`;
  }
  return mode === 'viewer' ? '/viewer' : null;
}

/**
 * 校验路由中的资源标识，拒绝路径分隔符和原型保留键。
 *
 * @param id - 待校验的非空资源标识，仅允许字母、数字、下划线和连字符。
 * @returns 满足路由标识规则时为 true；此处不负责业务模型的长度限制。
 */
export function validResourceId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
}

/**
 * 判断导航目标是否会替换已经打开的另一资源草稿。
 *
 * @param currentId - 当前草稿 ID；没有草稿时为 undefined。
 * @param targetId - 目标资源 ID，新建入口可传入约定的新建标记。
 * @returns 存在当前草稿且 ID 与目标不同时为 true。
 */
export function replacesDraft(currentId: string | undefined, targetId: string): boolean {
  return !!currentId && currentId !== targetId;
}
