/** 离线包统一命令入口；仅为当前子进程注入工具链与外部数据、缓存目录。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const parent = path.dirname(root);
const tools = path.join(parent, 'toolchain');
const temporary = path.join(parent, 'liteCodeTool_tmp');
const windows = process.platform === 'win32';
const args = process.argv.slice(2);
const action = args.shift() || 'help';
const dataIndex = args.indexOf('--data-dir');
if (dataIndex >= 0 && !args[dataIndex + 1]) throw new Error('--data-dir 后必须提供路径');
const dataDir = path.resolve(
  dataIndex >= 0
    ? args.splice(dataIndex, 2)[1]
    : process.env.DATA_DIR ||
        process.env.LITECODE_DATA_DIR ||
        path.join(parent, 'liteCodeTool_datas'),
);
if (dataDir.includes('liteCodeTool_tmp'))
  throw new Error('请用 --data-dir 指定临时目录之外的数据目录');
const nodeDir = path.join(tools, windows ? 'node' : 'node/bin');
const env = { ...process.env };
// Windows 环境变量名不区分大小写，避免 PATH/Path 并存使 Node 选到系统路径。
const originalPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.PATH = [nodeDir, ...(windows ? [path.join(tools, 'pwsh')] : []), originalPath].join(
  path.delimiter,
);
Object.assign(env, {
  DATA_DIR: dataDir,
  LITECODE_DATA_DIR: dataDir,
  npm_config_cache: path.join(temporary, 'npm-cache'),
  npm_config_offline: 'true',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_update_notifier: 'false',
});
await fs.mkdir(temporary, { recursive: true });
const npm = path.join(
  tools,
  windows ? 'node/node_modules/npm/bin/npm-cli.js' : 'node/lib/node_modules/npm/bin/npm-cli.js',
);
let executable = process.execPath;
let command;
switch (action) {
  case 'demo':
    command = ['--experimental-strip-types', 'server/dev.mjs', '--demo'];
    break;
  case 'live':
    command = ['--experimental-strip-types', 'server/dev.mjs'];
    break;
  case 'frontend':
    command = ['node_modules/vite/bin/vite.js'];
    break;
  case 'build':
    command = ['tools/build.mjs'];
    break;
  case 'check':
    command = ['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit'];
    break;
  case 'test':
    command = [
      '--experimental-strip-types',
      '--test',
      ...(await fs.readdir(path.join(root, 'tests')))
        .filter((name) => name.endsWith('.test.ts'))
        .map((name) => 'tests/' + name),
    ];
    break;
  case 'restore':
    await fs.cp(path.join(tools, 'npm-cache'), path.join(temporary, 'npm-cache'), {
      recursive: true,
    });
    command = [npm, 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'];
    break;
  case 'terminal':
    executable = windows ? path.join(tools, 'pwsh/pwsh.exe') : 'bash';
    command = windows ? ['-NoLogo', '-NoProfile'] : ['--noprofile', '--norc'];
    break;
  default:
    console.log(
      '用法：dev.cmd 或 ./dev.sh <demo|live|frontend|check|test|build|restore|terminal> [--data-dir 外部目录]\nfrontend 仅启动 Vite，用 PORT 指定 Java 后端端口；restore 从包内缓存离线重建依赖。',
    );
    process.exit(0);
}
const child = spawn(executable, [...command, ...args], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
// 信号同时交给开发协调器，由它停止自己创建的后端和 Vite。
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
