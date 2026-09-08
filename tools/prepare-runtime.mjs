/** 联网准备两种平台的 Node 22 运行资源；不安装到系统，不修改 PATH。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { x as extract } from 'tar';
import {
  temporary,
  nodeVersion,
  nodeBase,
  resourceDir,
  linuxArchive,
  targets,
  checksumFor,
  sha256,
  verifyResources,
} from './runtime-resources.mjs';

/**
 * 下载官方文件到外部临时目录；已有缓存须与官方摘要一致才复用。
 * @param source - 相对官方版本目录的文件路径。
 * @param destination - 本地绝对文件路径。
 * @param expected - 官方 SHA256。
 * @returns 完成且通过校验后兑现；网络失败或摘要不符时拒绝。
 */
async function download(source, destination, expected) {
  try {
    if ((await sha256(destination)) === expected) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  console.log(`准备 Node.js ${nodeVersion}：${source}`);
  const response = await fetch(new URL(source, nodeBase), { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body)
    throw new Error(`下载失败：${source}（HTTP ${response.status}）`);
  const pending = destination + '.partial';
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(pending));
    if ((await sha256(pending)) !== expected) throw new Error(`下载校验失败：${source}`);
    await fs.rename(pending, destination);
  } finally {
    await fs.rm(pending, { force: true });
  }
}

await fs.mkdir(resourceDir, { recursive: true });
const cache = path.join(temporary, 'runtime-downloads', `node-v${nodeVersion}`);
await fs.mkdir(cache, { recursive: true });
const response = await fetch(new URL('SHASUMS256.txt', nodeBase), {
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`无法读取 Node 官方校验清单：HTTP ${response.status}`);
const sums = await response.text();
await fs.writeFile(path.join(cache, 'SHASUMS256.txt'), sums);
for (const target of targets)
  await download(
    target.source,
    path.join(cache, path.basename(target.source)),
    checksumFor(sums, target.source),
  );

const linuxFolder = path.join(resourceDir, 'linux-arm64');
await fs.mkdir(linuxFolder, { recursive: true });
// 只提取运行必需的二进制与完整 Node 许可证，不携带 npm 和开发依赖。
const prefix = `node-v${nodeVersion}-linux-arm64`;
await extract({ cwd: linuxFolder, file: path.join(cache, linuxArchive), strip: 1, strict: true }, [
  `${prefix}/bin/node`,
  `${prefix}/LICENSE`,
]);
await fs.rename(path.join(linuxFolder, 'bin/node'), path.join(linuxFolder, 'node'));
await fs.rmdir(path.join(linuxFolder, 'bin'));
const windowsFolder = path.join(resourceDir, 'win32-x64');
await fs.mkdir(windowsFolder, { recursive: true });
await fs.copyFile(path.join(cache, 'node.exe'), path.join(windowsFolder, 'node.exe'));
await fs.copyFile(path.join(linuxFolder, 'LICENSE'), path.join(windowsFolder, 'LICENSE'));

const manifest = { nodeVersion, preparedAt: new Date().toISOString(), targets: {} };
for (const target of targets) {
  manifest.targets[target.id] = {
    source: new URL(target.source, nodeBase).href,
    sourceSha256: checksumFor(sums, target.source),
    files: {
      [target.binary]: await sha256(path.join(resourceDir, target.id, target.binary)),
      LICENSE: await sha256(path.join(resourceDir, target.id, 'LICENSE')),
    },
  };
}
await fs.writeFile(path.join(resourceDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
await verifyResources();
console.log(`双平台运行资源已就绪：${resourceDir}`);
