/** 用离线工具链启动独立 VS Code 环境，不修改系统环境和已有编辑器配置。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url)),
  parent = path.dirname(root);
const toolchain = path.join(parent, 'toolchain');
const node = path.join(toolchain, 'node/node.exe');
const code = path.join(toolchain, 'vscode/Code.exe');
await fs.access(node);
await fs.access(code);
const temporary = path.join(parent, 'liteCodeTool_tmp');
await fs.mkdir(temporary, { recursive: true });
const dataArg = process.argv.indexOf('--data-dir');
const dataDir = path.resolve(
  dataArg >= 0
    ? process.argv[dataArg + 1]
    : process.env.LITECODE_DATA_DIR || path.join(parent, 'liteCodeTool_datas'),
);
if (dataDir.includes('liteCodeTool_tmp'))
  throw new Error('请选择临时目录之外的数据目录：--data-dir <路径>');
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
      ...process.env,
      PATH:
        path.dirname(node) +
        path.delimiter +
        path.join(toolchain, 'pwsh') +
        path.delimiter +
        process.env.PATH,
      LITECODE_DATA_DIR: dataDir,
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
