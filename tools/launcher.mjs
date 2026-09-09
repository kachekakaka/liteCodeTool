/** 发布包启动器：仅启动本机服务；不下载依赖、不修改系统设置、不结束无关进程。 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
const root = path.dirname(fileURLToPath(import.meta.url));
const demo = !process.argv.includes('--live');
const mode = demo ? 'demo' : 'live';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 16)) {
  console.error('需要 Node.js 22.16 或更新版本。当前版本：' + process.version);
  process.exit(1);
}
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, '../liteCodeTool_datas'));
const port = Number(process.env.PORT || (demo ? 8787 : 8788));
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('端口须为 1024~65535 的整数。');
  process.exit(1);
}
const host = '127.0.0.1';
const url = `http://${host}:${port}/${demo ? 'viewer' : ''}`;
/**
 * 探测配置端口上的健康接口，用于判断服务是否就绪或端口是否被其他模式占用。
 *
 * @returns 成功时兑现为健康接口 JSON；超时（600 毫秒）、请求失败或非成功响应时为 null。
 */
async function health() {
  try {
    const r = await fetch(`http://${host}:${port}/api/health`, {
      signal: AbortSignal.timeout(600),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
/**
 * 使用当前操作系统默认浏览器打开服务地址；传入 --no-open 时跳过。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function openBrowser() {
  if (process.argv.includes('--no-open')) return;
  const command =
    process.platform === 'win32'
      ? ['cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const p = spawn(command[0], command[1], { stdio: 'ignore', windowsHide: true, detached: true });
  p.on('error', () => console.log('浏览器未能自动打开，请手动访问：' + url));
  p.unref();
}
const existing = await health();
if (existing?.app === 'LiteCodeTool') {
  if (existing.mode !== mode) {
    console.error('此端口已由另一数据模式使用。请使用对应的启动脚本或指定其他 PORT。');
    process.exit(1);
  }
  console.log('发现本机已运行的 LiteCodeTool，复用现有服务：' + url);
  openBrowser();
  process.exit(0);
}
await fs.mkdir(dataDir, { recursive: true });
let token = process.env.INGEST_TOKEN || '';
if (!demo && !token) {
  const configPath = path.join(dataDir, 'connection.json');
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    token = config.ingestToken;
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw new Error('connection.json 无法读取，请先检查文件，不会覆盖现有凭据。');
    token = randomBytes(32).toString('base64url');
    await fs.writeFile(configPath, JSON.stringify({ ingestToken: token }, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  if (typeof token !== 'string' || token.length < 24)
    throw new Error('接入凭据应至少 24 字符，请检查 connection.json。');
  console.log('真实数据接入凭据保存在：' + configPath + '（请勿公开或提交到仓库）');
}
console.log(
  '\nLiteCodeTool 0.2.0 · ' + (demo ? '演示模式（模拟数据）' : '真实数据模式（未接入字段显示 --）'),
);
console.log('数据目录：' + dataDir + (demo ? path.sep + 'demo' : ''));
console.log('打开地址：' + url + '\n保持此窗口开启；按 Ctrl+C 停止服务。\n');
const child = spawn(
  process.execPath,
  [path.join(root, 'app/server/index.mjs'), ...(demo ? ['--demo'] : [])],
  {
    cwd: root,
    env: {
      ...process.env,
      HOST: process.env.HOST || '0.0.0.0',
      PORT: String(port),
      DATA_DIR: dataDir,
      INGEST_TOKEN: token,
      CLIENT_DIR: path.join(root, 'app/web'),
    },
    stdio: 'inherit',
  },
);
let stopping = false,
  exited = false;
/**
 * 仅终止本次启动的后端子进程；重复调用不会再次发送信号。
 *
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function stop() {
  if (stopping) return;
  stopping = true;
  child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('error', (e) => {
  console.error('无法启动服务：' + e.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  exited = true;
  process.exitCode = code ?? (stopping ? 0 : 1);
});
for (let n = 0; n < 40 && !exited; n++) {
  const h = await health();
  if (h?.app === 'LiteCodeTool' && h.mode === mode) {
    openBrowser();
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (n === 39) {
    console.error('服务启动等待超时，请检查上方错误与端口占用情况。');
    stop();
  }
}
