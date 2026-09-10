/** 联网准备两个目标平台的完整依赖与独立 npm 缓存；不执行跨平台安装脚本。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const i = process.argv.indexOf('--output');
const base = path.resolve(
  i >= 0 ? process.argv[i + 1] : path.join(root, '../liteCodeTool_tmp/dev-dependencies'),
);
const npmCandidates = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.join(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].filter(Boolean);
let npm;
for (const candidate of npmCandidates) {
  try {
    await fs.access(candidate);
    npm = candidate;
    break;
  } catch {}
}
if (!npm) throw new Error('未找到 npm，请用配套 Node 或 npm 脚本启动');
for (const target of ['win32-x64', 'linux-arm64']) {
  const directory = path.join(base, target);
  await fs.mkdir(directory, { recursive: true });
  for (const name of ['package.json', 'package-lock.json'])
    await fs.copyFile(path.join(root, name), path.join(directory, name));
  const [os, cpu] = target.split('-');
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        npm,
        'ci',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        `--os=${os}`,
        `--cpu=${cpu}`,
        '--libc=glibc',
        '--cache',
        path.join(directory, 'npm-cache'),
      ],
      { cwd: directory, stdio: 'inherit', windowsHide: true },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('依赖准备失败：' + target)),
    );
  });
  console.log('依赖与缓存已准备：' + directory);
}
