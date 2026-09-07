/** 在外网准备机上，从本地已安装的官方工具链和 VSIX 装配离线资源。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const target = path.resolve(root, '../liteCodeTool_tmp/offline-resources');
/**
 * 从命令行读取路径选项，并转换为绝对路径。
 *
 * @param name - 完整选项名，例如 --node-dir；存在选项时其后必须提供路径。
 * @returns 选项对应的绝对路径；没有该选项时为 undefined。
 */
const option = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? path.resolve(process.argv[i + 1]) : undefined;
};
const nodeDir = option('--node-dir') || path.dirname(process.execPath);
const codeDir = option('--vscode-dir');
const shellDir = option('--pwsh-dir');
const vsixDir = option('--vsix-dir');
if (!codeDir || !shellDir || !vsixDir)
  throw new Error(
    '用法：node tools/prepare-offline.mjs --vscode-dir <目录> --pwsh-dir <目录> --vsix-dir <含 VSIX 的目录> [--node-dir <目录>]',
  );
for (const [folder, file] of [
  [nodeDir, 'node.exe'],
  [codeDir, 'Code.exe'],
  [shellDir, 'pwsh.exe'],
])
  await fs.access(path.join(folder, file));
await fs.mkdir(target, { recursive: true });
for (const [source, name] of [
  [nodeDir, 'node'],
  [codeDir, 'vscode'],
  [shellDir, 'pwsh'],
  [vsixDir, 'vsix'],
]) {
  const dest = path.join(target, name);
  if (path.resolve(source) !== dest)
    await fs.cp(source, dest, {
      recursive: true,
      /**
       * 准备工具链时跳过编辑器用户数据、缓存及日志目录。
       * @param p - 当前待复制文件或目录的完整路径。
       * @returns 不属于 data、User、CachedData 或 logs 目录时为 true。
       */
      filter: (p) => !['data', 'User', 'CachedData', 'logs'].includes(path.basename(p)),
    });
}
/**
 * 定位普通或带版本子目录的 VS Code 安装中的 CLI 入口。
 *
 * @param dir - VS Code 安装根目录。
 * @returns 兑现为 resources/app/out/cli.js 的完整路径的 Promise。
 * @throws 所有候选位置均不存在时拒绝并报告未找到 CLI。
 */
async function cliPath(dir) {
  const direct = path.join(dir, 'resources/app/out/cli.js');
  try {
    await fs.access(direct);
    return direct;
  } catch {}
  for (const entry of await fs.readdir(dir, { withFileTypes: true }))
    if (entry.isDirectory()) {
      const candidate = path.join(dir, entry.name, 'resources/app/out/cli.js');
      try {
        await fs.access(candidate);
        return candidate;
      } catch {}
    }
  throw new Error('未找到 VS Code CLI');
}
const cli = await cliPath(path.join(target, 'vscode'));
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
for (const name of await fs.readdir(path.join(target, 'vsix'))) {
  if (!name.endsWith('.vsix')) continue;
  const run = spawnSync(
    path.join(target, 'vscode/Code.exe'),
    [
      cli,
      '--user-data-dir',
      path.join(target, 'prepare-profile'),
      '--extensions-dir',
      path.join(target, 'extensions'),
      '--install-extension',
      path.join(target, 'vsix', name),
      '--force',
    ],
    { env, stdio: 'inherit', windowsHide: true },
  );
  if (run.status !== 0) throw new Error('VSIX 安装失败：' + name);
}
/**
 * 读取离线资源文件并计算 SHA256，用于工具链清单校验。
 *
 * @param file - 需要计算摘要的文件路径。
 * @returns 兑现为小写 SHA256 十六进制字符串的 Promise。
 */
const sha = async (file) =>
  createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
const extensions = [];
for (const folder of await fs.readdir(path.join(target, 'extensions'))) {
  try {
    const p = JSON.parse(
      await fs.readFile(path.join(target, 'extensions', folder, 'package.json'), 'utf8'),
    );
    extensions.push({
      id: p.publisher + '.' + p.name,
      version: p.version,
      dependencies: p.extensionDependencies || [],
    });
  } catch {}
}
const hashes = {};
for (const name of [
  'node/node.exe',
  'vscode/Code.exe',
  'pwsh/pwsh.exe',
  ...(await fs.readdir(path.join(target, 'vsix'))).map((n) => 'vsix/' + n),
])
  hashes[name] = await sha(path.join(target, name));
const result = spawnSync(path.join(target, 'node/node.exe'), ['--version'], {
  encoding: 'utf8',
  windowsHide: true,
});
await fs.writeFile(
  path.join(target, 'resources.json'),
  JSON.stringify(
    {
      platform: 'win32-x64',
      node: result.stdout.trim(),
      lockHash: await sha(path.join(root, 'package-lock.json')),
      extensions,
      hashes,
      sources: {
        node: 'https://nodejs.org/',
        vscode: 'https://code.visualstudio.com/',
        powershell: 'https://github.com/PowerShell/PowerShell',
        extensions: 'https://marketplace.visualstudio.com/',
      },
    },
    null,
    2,
  ),
);
console.log('离线资源已准备：' + target);
