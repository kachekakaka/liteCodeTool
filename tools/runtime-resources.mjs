/** 双平台运行包共用的 Node 版本、资源位置与校验逻辑；导入时不访问网络。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const temporary = path.resolve(root, '../liteCodeTool_tmp');
export const nodeVersion = '22.23.2';
export const nodeBase = `https://nodejs.org/download/release/v${nodeVersion}/`;
export const resourceDir = path.join(temporary, 'runtime-resources', `node-v${nodeVersion}`);
export const linuxArchive = `node-v${nodeVersion}-linux-arm64.tar.gz`;
export const targets = [
  { id: 'win32-x64', binary: 'node.exe', source: 'win-x64/node.exe' },
  { id: 'linux-arm64', binary: 'node', source: linuxArchive },
];

/**
 * 从官方清单提取指定文件的 SHA256，避免误匹配同名文件或目录。
 * @param text - 官方 SHASUMS256.txt 正文。
 * @param filename - 官方分发路径，包含平台目录时须完整匹配。
 * @returns 小写的 SHA256。
 * @throws 文件缺失、重复或摘要格式不正确时抛错。
 */
export function checksumFor(text, filename) {
  const rows = text.split(/\r?\n/).filter((line) => line.trim().split(/\s+/)[1] === filename);
  if (rows.length !== 1 || !/^[a-fA-F0-9]{64}\s+/.test(rows[0]))
    throw new Error(`官方校验清单中缺少有效且唯一的文件：${filename}`);
  return rows[0].trim().split(/\s+/)[0].toLowerCase();
}

/**
 * 计算文件的 SHA256，用于下载与离线装配校验。
 * @param file - 文件绝对路径。
 * @returns 摘要字符串；读取失败时拒绝。
 */
export async function sha256(file) {
  return createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
}

/**
 * 检查即将交付的 Node 二进制头，拒绝把 Windows 或其他架构文件装入 ARM 包。
 * @param header - 文件头部字节，Windows 至少包含 PE 标头。
 * @param target - win32-x64 或 linux-arm64。
 * @returns 无返回值；平台不符或文件截断时抛错。
 */
export function assertBinaryTarget(header, target) {
  let valid = false;
  if (target === 'linux-arm64' && header.length >= 20) {
    valid =
      header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) &&
      header[4] === 2 &&
      header[5] === 1 &&
      header.readUInt16LE(18) === 183;
  } else if (
    target === 'win32-x64' &&
    header.length >= 64 &&
    header.toString('ascii', 0, 2) === 'MZ'
  ) {
    const pe = header.readUInt32LE(60);
    valid =
      pe + 6 <= header.length &&
      header.toString('ascii', pe, pe + 4) === 'PE\0\0' &&
      header.readUInt16LE(pe + 4) === 0x8664;
  }
  if (!valid) throw new Error(`Node 二进制与目标平台不符：${target}`);
}

/**
 * 读取已经准备的资源并核对版本、平台、二进制与许可证摘要；此方法不会联网。
 * @returns 经校验的资源清单。
 * @throws 资源缺失或被改动时提示重新准备。
 */
export async function verifyResources() {
  const manifest = JSON.parse(await fs.readFile(path.join(resourceDir, 'manifest.json'), 'utf8'));
  if (manifest.nodeVersion !== nodeVersion) throw new Error('Node 运行资源版本不一致');
  for (const target of targets) {
    const record = manifest.targets?.[target.id];
    if (!record || record.source !== new URL(target.source, nodeBase).href)
      throw new Error(`运行资源清单缺少平台：${target.id}`);
    const binary = path.join(resourceDir, target.id, target.binary);
    assertBinaryTarget(await fs.readFile(binary), target.id);
    for (const name of [target.binary, 'LICENSE']) {
      if ((await sha256(path.join(resourceDir, target.id, name))) !== record.files?.[name])
        throw new Error(
          `运行资源校验失败：${target.id}/${name}，请重新执行 npm run prepare:runtime`,
        );
    }
  }
  return manifest;
}
