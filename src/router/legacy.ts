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

export function validResourceId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
}

export function replacesDraft(currentId: string | undefined, targetId: string): boolean {
  return !!currentId && currentId !== targetId;
}
