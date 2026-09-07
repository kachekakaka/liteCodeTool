/** 从明确的准备目录装配 Windows x64 离线包，不在打包时访问网络。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = path.resolve(root, '../liteCodeTool_tmp');
const resources = path.join(temporary, 'offline-resources');
const destination = path.join(temporary, 'offline-devkit');
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('请在 Windows x64 环境准备依赖并打包');
const descriptor = JSON.parse(await fs.readFile(path.join(resources, 'resources.json'), 'utf8'));
for (const item of [
  'node/node.exe',
  'node/node_modules/npm/bin/npm-cli.js',
  'vscode/Code.exe',
  'pwsh/pwsh.exe',
  'extensions',
])
  await fs.access(path.join(resources, item));
for (const id of ['vue.volar', 'esbenp.prettier-vscode']) {
  const folders = await fs.readdir(path.join(resources, 'extensions'));
  if (!folders.some((name) => name.toLowerCase().startsWith(id + '-')))
    throw new Error('缺少离线扩展：' + id);
}
const lock = await fs.readFile(path.join(root, 'package-lock.json'));
const lockHash = createHash('sha256').update(lock).digest('hex');
if (descriptor.lockHash !== lockHash)
  throw new Error('依赖锁文件已变化，请重新准备并验证离线资源清单');
for (const file of [
  'node_modules/.package-lock.json',
  'node_modules/@esbuild/win32-x64/esbuild.exe',
])
  await fs.access(path.join(root, file));
// 唯一可清理目标固定在仓库外部，拒绝把资源目录当成输出目录。
if (path.dirname(destination) !== temporary || destination === resources)
  throw new Error('离线包输出目录无效');
await fs.rm(destination, { recursive: true, force: true });
const source = path.join(destination, 'liteCodeTool');
await fs.mkdir(source, { recursive: true });
for (const name of await fs.readdir(root)) {
  if (['.git', '.idea'].includes(name)) continue;
  if (name.endsWith('.log') || name.startsWith('.env')) continue;
  await fs.cp(path.join(root, name), path.join(source, name), { recursive: true });
}
for (const name of ['node', 'vscode', 'pwsh', 'extensions', 'vsix', 'resources.json'])
  await fs.cp(path.join(resources, name), path.join(destination, 'toolchain', name), {
    recursive: true,
    filter: (file) => !/^unins\d/i.test(path.basename(file)),
  });
await fs.writeFile(
  path.join(destination, '打开开发环境.cmd'),
  '@echo off\r\n"%~dp0toolchain\\node\\node.exe" "%~dp0liteCodeTool\\tools\\dev-environment.mjs" %*\r\n',
);
await fs.writeFile(
  path.join(destination, 'README.txt'),
  'Windows x64 离线开发包\r\n运行“打开开发环境.cmd”，在 VS Code 按 F5 启动演示联调。\r\n若解压到临时目录中，请传入 --data-dir 指向临时目录外的数据目录。\r\n依赖已准备，无需 npm install。新增依赖须在外网同平台重新准备。\r\n',
);
await fs.writeFile(
  path.join(destination, 'manifest.json'),
  JSON.stringify({ ...descriptor, lockHash, packagedAt: new Date().toISOString() }, null, 2),
);
console.log('离线开发包已装配：' + destination);
