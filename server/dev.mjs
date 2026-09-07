/** 开发协调进程；服务就绪后再通知编辑器打开浏览器。 */
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
let vite,
  child,
  stopping = false;
/**
 * 停止本次启动的后端子进程并关闭 Vite，避免退出后遗留开发端口。
 *
 * @param code - 父进程退出码，默认 0；失败路径传入非零值。
 * @returns Vite 关闭后的 Promise；通过 process.exitCode 设置退出状态。
 */
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await vite?.close();
  process.exitCode = code;
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
try {
  vite = await createServer({ root: cwd });
  await vite.listen();
  child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      'server/index.mjs',
      ...(process.argv.includes('--demo') ? ['--demo'] : []),
    ],
    {
      cwd,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      windowsHide: true,
      env: { ...process.env, DEV_ORIGIN: `http://127.0.0.1:${vite.config.server.port}` },
    },
  );
  child.on('error', (error) => {
    console.error(error.message);
    void stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) void stop(code || 0);
  });
  // 只认可本次子进程的就绪消息，不能把占用端口的旧服务误当成本次服务。
  const ready = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 10000);
    child.once('message', (message) => {
      clearTimeout(timeout);
      resolve(message?.kind === 'ready');
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    child.once('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
  if (!ready && !stopping) throw new Error('后端启动超时，请检查端口和数据目录');
  if (ready && !stopping) {
    vite.printUrls();
    console.log(`前后端已就绪：http://127.0.0.1:${vite.config.server.port}`);
  }
} catch (error) {
  console.error('开发服务启动失败：', error.message);
  await stop(1);
}
