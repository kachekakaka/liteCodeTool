/**
 * 使用浏览器加密随机源生成带业务前缀的资源标识。
 *
 * @param prefix - 业务前缀，例如 screen、tpl、inst 或 ctrl。
 * @returns 前缀、下划线和 12 个随机字节编码成的 24 位十六进制字符串。
 */
export const uid = (prefix: string): string =>
  `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) => n.toString(16).padStart(2, '0')).join('')}`;
