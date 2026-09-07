export const uid = (prefix: string): string =>
  `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) => n.toString(16).padStart(2, '0')).join('')}`;
