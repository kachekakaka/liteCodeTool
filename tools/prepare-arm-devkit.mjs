/** 联网准备 ARM64 的官方 Node/npm、VS Code 归档及通用扩展。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('..', import.meta.url));
const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return path.resolve(i >= 0 ? process.argv[i + 1] : fallback);
};
const output = option('--output', path.join(root, '../liteCodeTool_tmp/arm-dev-resources'));
const downloads = option(
  '--downloads',
  path.join(root, '../liteCodeTool_tmp/devkit-downloads-20260909'),
);
const common = option('--common', path.join(root, '../liteCodeTool_tmp/offline-resources'));
await fs.mkdir(output, { recursive: true });
await fs.mkdir(downloads, { recursive: true });
const nodeVersion = '22.23.2';
const codeVersion = '1.134.0';
const nodeBase = `https://nodejs.org/download/release/v${nodeVersion}/`;
const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败 ${response.status}: ${url}`);
  return response.text();
};
const sums = await fetchText(nodeBase + 'SHASUMS256.txt');
const code = JSON.parse(
  await fetchText(
    `https://update.code.visualstudio.com/api/versions/${codeVersion}/linux-arm64/stable`,
  ),
);
if (code.productVersion !== codeVersion) throw new Error('VS Code 版本元数据不符');
const nodeName = `node-v${nodeVersion}-linux-arm64.tar.gz`;
const hashes = {};
for (const [name, filename, url, expected] of [
  [
    'node.tar.gz',
    nodeName,
    nodeBase + nodeName,
    sums
      .split('\n')
      .find((line) => line.endsWith('  ' + nodeName))
      ?.split(/\s+/)[0],
  ],
  ['vscode.tar.gz', 'vscode-linux-arm64.tar.gz', code.url, code.sha256hash],
]) {
  if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error('官方校验信息缺失：' + name);
  const local = path.join(downloads, filename);
  try {
    await fs.access(local);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error('下载失败：' + url);
    await fs.writeFile(local, Buffer.from(await response.arrayBuffer()));
  }
  const actual = createHash('sha256')
    .update(await fs.readFile(local))
    .digest('hex');
  if (actual !== expected) throw new Error('资源与官方 SHA256 不符：' + local);
  hashes[name] = actual;
  await fs.copyFile(local, path.join(output, name));
}
for (const folder of ['extensions', 'vsix'])
  await fs.cp(path.join(common, folder), path.join(output, folder), {
    recursive: true,
    filter: (file) => path.basename(file) !== 'extensions.json',
  });
const commonManifest = JSON.parse(await fs.readFile(path.join(common, 'resources.json'), 'utf8'));
await fs.writeFile(
  path.join(output, 'resources.json'),
  JSON.stringify(
    {
      platform: 'linux-arm64',
      node: 'v' + nodeVersion,
      vscode: codeVersion,
      extensions: commonManifest.extensions,
      hashes,
      sources: {
        node: nodeBase + nodeName,
        vscode: code.url,
        nodeChecksums: nodeBase + 'SHASUMS256.txt',
        vscodeMetadata: `https://update.code.visualstudio.com/api/versions/${codeVersion}/linux-arm64/stable`,
        extensions: commonManifest.sources,
      },
    },
    null,
    2,
  ),
);
console.log('ARM 工具链资源已校验：' + output);
