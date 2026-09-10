/** 用离线工具链启动独立 VS Code 环境，不修改系统环境和已有编辑器配置。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url)),
  parent = path.dirname(root);
const toolchain = path.join(parent, 'toolchain');
const windows = process.platform === 'win32';
const node = path.join(toolchain, windows ? 'node/node.exe' : 'node/bin/node');
const code = path.join(toolchain, windows ? 'vscode/Code.exe' : 'vscode/bin/code');
await fs.access(node);
await fs.access(code);
const temporary = path.join(parent, 'liteCodeTool_tmp');
await fs.mkdir(temporary, { recursive: true });
// 首次建立隔离编辑器配置；此后保留开发者自己的改动。
const userSettings = path.join(temporary, 'vscode-user/User/settings.json');
await fs.mkdir(path.dirname(userSettings), { recursive: true });
await fs
  .writeFile(
    userSettings,
    JSON.stringify(
      {
        'update.mode': 'none',
        'extensions.autoUpdate': false,
        'extensions.autoCheckUpdates': false,
        'telemetry.telemetryLevel': 'off',
      },
      null,
      2,
    ),
    { flag: 'wx' },
  )
  .catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
const dataArg = process.argv.indexOf('--data-dir');
const dataDir = path.resolve(
  dataArg >= 0
    ? process.argv[dataArg + 1]
    : process.env.LITECODE_DATA_DIR || path.join(parent, 'liteCodeTool_datas'),
);
if (dataDir.includes('liteCodeTool_tmp'))
  throw new Error('请选择临时目录之外的数据目录：--data-dir <路径>');
const inherited = { ...process.env };
const inheritedPath =
  Object.entries(inherited).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
for (const key of Object.keys(inherited)) if (key.toLowerCase() === 'path') delete inherited[key];
const child = spawn(
  code,
  [
    '--new-window',
    '--user-data-dir',
    path.join(temporary, 'vscode-user'),
    '--extensions-dir',
    path.join(toolchain, 'extensions'),
    root,
  ],
  {
    env: {
      ...inherited,
      PATH:
        path.dirname(node) +
        path.delimiter +
        (windows ? path.join(toolchain, 'pwsh') + path.delimiter : '') +
        inheritedPath,
      LITECODE_DATA_DIR: dataDir,
      DATA_DIR: dataDir,
      npm_config_cache: path.join(temporary, 'npm-cache'),
      npm_config_offline: 'true',
    },
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.unref();
