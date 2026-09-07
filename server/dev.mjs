import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const child = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs', ...(process.argv.includes('--demo') ? ['--demo'] : [])], { cwd, stdio: 'inherit' });
let vite, stopping = false;
async function stop(code = 0) { if (stopping) return; stopping = true; child.kill('SIGTERM'); await vite?.close(); process.exit(code); }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
child.on('exit', code => { if (!stopping) stop(code || 0); });
try { vite = await createServer({ root: cwd }); await vite.listen(); vite.printUrls(); } catch (e) { console.error('开发服务启动失败：', e.message); await stop(1); }
