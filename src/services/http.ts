/**
 * 请求 JSON API，合并调用方取消信号与 10 秒超时，并提取 ETag 版本。
 *
 * @param url - API 相对路径或完整地址。
 * @param options - fetch 请求选项，默认空对象；有请求体时自动添加 JSON Content-Type。
 * @returns 兑现为 data 和 revision 的 Promise；204 响应的 data 为 undefined，其他响应按 T 使用；缺少 ETag 时 revision 为空字符串。
 * @typeParam T - 调用方期望的 JSON 响应类型。
 * @throws 网络、超时、取消或 JSON 解析失败时拒绝；非成功 HTTP 响应抛出的 Error 附带 status。
 */
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
  const data = response.status === 204 ? undefined : await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || `请求失败 (${response.status})`), {
      status: response.status,
    });
  return { data: data as T, revision: response.headers.get('etag') || '' };
}
