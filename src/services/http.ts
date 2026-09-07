export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<{ data: T; revision: string }> {
  const response = await fetch(url, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || `请求失败 (${response.status})`), {
      status: response.status,
    });
  return { data: data as T, revision: response.headers.get('etag') || '' };
}
