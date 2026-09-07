import http from 'node:http';
import { createRequire } from 'node:module';
const requireForLock = createRequire(import.meta.url);
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import wsLibrary from '../vendor/ws.cjs';
const { WebSocketServer } = wsLibrary;
import { EntityStore, validId, validateTemplate, validateScreen, assertJsonSafe, finite } from '../src/engine/core.ts';
import { schemas as builtinSchemas, templates as builtinTemplates, defaultScreen, demoEnvelopes } from './defaults.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const demo = process.argv.includes('--demo');
const base = path.resolve(process.env.DATA_DIR || path.join(root, '../liteCodeTool_datas'));
const dataRelative = path.relative(root, base);
if (!dataRelative || (!dataRelative.startsWith('..'+path.sep) && !path.isAbsolute(dataRelative))) throw new Error('数据目录必须位于源码仓库之外');
if (base.includes('liteCodeTool_tmp')) throw new Error('持久化数据目录禁止指向临时目录 liteCodeTool_tmp');
const dataDir = demo ? path.join(base, 'demo') : base;
const clientDir = path.resolve(process.env.CLIENT_DIR || path.join(root, 'web'));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口必须是 1024~65535 的整数');
const ingestionToken = process.env.INGEST_TOKEN || '';
const sessionId = randomUUID();
const queues = new Map();
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const etag = text => `"${createHash('sha256').update(text).digest('hex')}"`;
const file = (group, id) => { if (!validId(id)) throw new HttpError(400, '标识只允许字母、数字、下划线和连字符'); return path.join(dataDir, group, `${id}.json`); };
async function read(pathname) { const text = await readFile(pathname, 'utf8'); return { data: JSON.parse(text), revision: etag(text) }; }
async function atomic(pathname, value) {
  const temp = `${pathname}.${randomUUID()}.tmp`;
  try { await writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temp, pathname); }
  finally { await unlink(temp).catch(() => {}); }
}
async function save(pathname, value, match) {
  const previous = queues.get(pathname) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    let current;
    try { current = await read(pathname); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (match === '*' ? !!current : !match || match !== current?.revision) throw new HttpError(match ? 412 : 428, '配置已被其他窗口修改，请重新载入后保存；本次未覆盖');
    await atomic(pathname, value); return read(pathname);
  });
  queues.set(pathname, task);
  try { return await task; } finally { if (queues.get(pathname) === task) queues.delete(pathname); }
}
async function seed(group, id, value) {
  const pathname = file(group, id);
  try { await read(pathname); } catch (e) { if (e.code !== 'ENOENT') throw e; await atomic(pathname, value); }
}
// 防止两个独立进程同时写同一个数据目录。失效进程留下的锁可自动恢复。
await mkdir(dataDir,{recursive:true});
const lockPath=path.join(dataDir,'.server.lock');
for(let attempt=0;attempt<2;attempt++) {
  try { await writeFile(lockPath,JSON.stringify({pid:process.pid,started:new Date().toISOString()}),{flag:'wx',mode:0o600});break; }
  catch(e) {
    if(e.code!=='EEXIST')throw e;
    let lock;try{lock=JSON.parse(await readFile(lockPath,'utf8'));}catch{throw new Error('数据目录锁文件无法读取，请先检查 .server.lock，不会覆盖用户数据');}
    if(!Number.isInteger(lock.pid)||lock.pid<=0)throw new Error('数据目录锁无效，请先检查 .server.lock');
    let alive=true;try{process.kill(lock.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    if(alive)throw new Error('同一数据目录已有服务在运行，请停止原服务后重试');
    await unlink(lockPath);if(attempt===1)throw new Error('无法取得数据目录锁');
  }
}
process.on('exit',()=>{try{const fs=requireForLock('node:fs');const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));if(lock.pid===process.pid)fs.unlinkSync(lockPath);}catch{}});
for (const group of ['schemas', 'templates', 'screens', 'entities']) await mkdir(path.join(dataDir, group), { recursive: true });
await seed('schemas', 'default', builtinSchemas);
for (const template of builtinTemplates) await seed('templates', template.id, template);
await seed('screens', 'screen_main', defaultScreen(demo));
await seed('entities', 'snapshot', demo ? demoEnvelopes() : []);
const schemas = (await read(file('schemas', 'default'))).data;
const store = new EntityStore();
for (const envelope of (await read(file('entities', 'snapshot'))).data) store.apply(envelope, true);
const snapshots = () => Object.entries(store.records).flatMap(([type, records]) => Object.entries(records).map(([id, r]) => ({ type, ...(id === '_global' ? {} : { id }), timestamp: Math.max(0, ...Object.values(r.timestamps)), data: r.data, fieldTimestamps: r.timestamps })));
async function list(group) { return Promise.all((await readdir(path.join(dataDir, group))).filter(n => /^[A-Za-z0-9_-]+\.json$/.test(n)).sort().map(n => read(path.join(dataDir, group, n)))); }
const allTemplates = async () => (await list('templates')).map(r => r.data);
function send(res, status, value, revision) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(revision ? { ETag: revision } : {}) });
  res.end(JSON.stringify(value));
}
function allowedOrigin(req) {
  const allowedHosts = (process.env.ALLOWED_HOSTS || '127.0.0.1,localhost').split(',').map(h => h.trim());
  try { if (!allowedHosts.includes(new URL(`http://${req.headers.host}`).hostname)) return false; } catch { return false; }
  if (!req.headers.origin) return true;
  try { const origin = new URL(req.headers.origin); return origin.host === req.headers.host || ['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin.origin); } catch { return false; }
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, '请求必须是 JSON');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw new HttpError(413, '配置超过 2 MB 限制'); chunks.push(chunk); }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); assertJsonSafe(parsed); return parsed; } catch { throw new HttpError(400, 'JSON 格式不正确或含有不允许的字段'); }
}
function validateEnvelope(e) {
  const schema = schemas.find(s => s.type === e?.type);
  if (!schema || !finite(e.timestamp) || e.timestamp > Date.now() + 60_000 || !e.data || typeof e.data !== 'object' || Array.isArray(e.data) || (schema.isEntity ? !validId(e.id) : e.id !== undefined)) throw new HttpError(400, '增量包的类型、标识、时间戳或数据无效');
  for (const [key, value] of Object.entries(e.data)) {
    const f = schema.fields.find(f => f.key === key);
    if (!f || (value !== null && (f.type === 'number' ? !finite(value) : typeof value !== 'string'))) throw new HttpError(400, `字段 ${key} 不符合数据模式`);
    if (f?.type === 'datetime' && value !== null && Number.isNaN(new Date(value).getTime())) throw new HttpError(400, '报位时间无效');
    if (key === schema.idField && value !== e.id) throw new HttpError(400, '实体标识与数据中的标识不一致');
  }
  // 字段时间戳仅由本服务生成；接入端不能伪造快照元数据。
  return { type: e.type, ...(e.id ? { id: e.id } : {}), timestamp: e.timestamp, data: e.data };
}
let lastUpdate = null, dirtyEntities = false, simulationPaused = false;
let persistTask = Promise.resolve();
async function persistEntities() {
  if (!dirtyEntities) return persistTask;
  dirtyEntities = false;
  const snapshot = JSON.parse(JSON.stringify(snapshots()));
  persistTask = persistTask.catch(() => {}).then(() => atomic(file('entities', 'snapshot'), snapshot));
  try { await persistTask; } catch (e) { dirtyEntities = true; console.error('实体快照保存失败：', e.message); }
}
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
function broadcast(message) { const payload = JSON.stringify(message); for (const client of sockets.clients) if (client.readyState === 1) { if (client.bufferedAmount > 2_000_000) client.terminate(); else client.send(payload); } }
function update(envelope) { store.apply(envelope); dirtyEntities = true; lastUpdate = Date.now(); broadcast({ kind: 'update', envelope }); }
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if (!allowedOrigin(req)) throw new HttpError(403, '不允许跨站访问');
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
      const templates = await list('templates'), screen = await read(file('screens', 'screen_main'));
      return send(res, 200, { mode: demo ? 'demo' : 'live', schemas, templates, screen, screens: (await list('screens')).map(r => ({ id: r.data.id, name: r.data.name })), snapshots: snapshots(), lastUpdate, paused: simulationPaused });
    }
    if (req.method === 'GET' && url.pathname === '/api/schemas') return send(res, 200, schemas);
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { app: 'LiteCodeTool', version: '0.2.0', sessionId, mode: demo ? 'demo' : 'live', lastUpdate, paused: simulationPaused });
    if (parts[0] === 'api' && ['templates', 'screens'].includes(parts[1])) {
      const group = parts[1], id = parts[2];
      if (req.method === 'GET') { if (!id) return send(res, 200, await list(group)); const result = await read(file(group, id)); return send(res, 200, result.data, result.revision); }
      if (['POST', 'PUT'].includes(req.method) && parts.length === 3) {
        const value = await body(req);
        if (value.id !== id) throw new HttpError(400, '请求路径与配置标识不一致');
        try {
          if (group === 'templates') {
            validateTemplate(value, schemas);
            const candidates = (await allTemplates()).filter(t=>t.id!==value.id).concat(value);
            for (const saved of await list('screens')) if (saved.data.components.some(i=>i.templateId===value.id)) {
              try { validateScreen(saved.data, candidates, schemas); }
              catch (e) { throw new HttpError(409, `模板更新会使大屏“${saved.data.name}”失效：${e.message}。请另存为新模板。`); }
            }
          } else validateScreen(value, await allTemplates(), schemas);
        } catch (e) { throw e instanceof HttpError ? e : new HttpError(400, e.message); }
        const result = await save(file(group, id), value, req.method === 'POST' ? (req.headers['if-none-match'] === '*' ? '*' : '') : req.headers['if-match']);
        return send(res, req.method === 'POST' ? 201 : 200, result.data, result.revision);
      }
    }
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'entities' && parts.length === 4) {
      if (!validId(parts[2]) || !validId(parts[3])) throw new HttpError(400, '实体标识无效');
      const snapshot = snapshots().find(s => s.type === parts[2] && s.id === parts[3]);
      if (!snapshot) throw new HttpError(404, '该实体尚无初始底账');
      return send(res, 200, snapshot);
    }
    if (req.method === 'POST' && url.pathname === '/api/import') {
      const bundle = await body(req);
      if (bundle?.format !== 'litecode.screen.v1' || !bundle.screen || !Array.isArray(bundle.templates) || bundle.templates.length > 150) throw new HttpError(400, '请选择从本软件导出的完整 .litecode.json 配置包');
      const ids = new Map();
      const imported = bundle.templates.map(template => {
        if (ids.has(template.id)) throw new HttpError(400, '配置包包含重复的模板标识');
        const id = 'tpl_' + randomUUID().replaceAll('-', ''); ids.set(template.id, id); return { ...template, id };
      });
      const screen = { ...bundle.screen, id: 'screen_' + randomUUID().replaceAll('-', ''), name: (bundle.screen.name || '导入大屏').slice(0,110) + ' · 导入', components: (bundle.screen.components || []).map(i=>({ ...i, templateId: ids.get(i.templateId) })) };
      try { for (const t of imported) validateTemplate(t,schemas); validateScreen(screen, imported, schemas); }
      catch (e) { throw new HttpError(400, e.message); }
      // 全量校验后再写入唯一命名的新文件；最后写大屏，失败只清理本次新文件。
      const created = [], rows = []; let screenRow;
      try {
        for (const t of imported) { const f=file('templates',t.id); const row=await save(f,t,'*');created.push(f);rows.push(row); }
        const f=file('screens',screen.id);screenRow=await save(f,screen,'*');created.push(f);
      } catch(e) { for(const f of created)await unlink(f).catch(()=>{});throw e; }
      return send(res, 201, { screen: screenRow, templates: rows });
    }
    if (req.method === 'POST' && url.pathname === '/api/ingest') {
      const provided = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
      const expected = Buffer.from(ingestionToken);
      if (demo || expected.length < 24 || provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new HttpError(403, '数据接入未启用或凭据无效');
      update(validateEnvelope(await body(req))); return send(res, 202, { accepted: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/demo') {
      if (!demo) throw new HttpError(404, '真实数据模式不提供演示接口');
      const action = (await body(req)).action;
      if (action === 'toggle') simulationPaused = !simulationPaused;
      else if (action === 'discover') {
        update({ type: 'vessel', id: '413000999', timestamp: Date.now(), data: { mmsi: '413000999', vessel_name: '新发现演示船', vessel_type: '商船', status: null, speed: null } });
        const vessels = store.list('vessel').map(x => x.record.data);
        update({ type: 'port_stats', timestamp: Date.now(), data: { total_vessels: vessels.length, cargo_count: vessels.filter(v => v.vessel_type === '商船').length } });
      } else throw new HttpError(400, '未知演示操作');
      broadcast({kind:'demo-state',paused:simulationPaused});
      return send(res, 200, { paused: simulationPaused });
    }
    if (url.pathname.startsWith('/api/') || req.method !== 'GET') throw new HttpError(404, '接口不存在');
    const relative = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const pathname = path.resolve(clientDir, '.' + relative);
    if (!pathname.startsWith(clientDir + path.sep)) throw new HttpError(403, '路径无效');
    const bytes = await readFile(pathname);
    const mime = ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' })[path.extname(pathname)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'", 'Cache-Control':'no-cache' }); res.end(bytes);
  } catch (e) { if (!res.headersSent) send(res, e.status || (e.code === 'ENOENT' ? 404 : 500), { error: e.status ? e.message : e.code === 'ENOENT' ? '文件不存在；首次使用请先构建客户端' : '读取或保存失败，原有数据未被覆盖' }); }
});
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws' || !allowedOrigin(req)) return socket.destroy();
  sockets.handleUpgrade(req, socket, head, ws => sockets.emit('connection', ws, req));
});
sockets.on('connection', ws => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); ws.on('error', () => {}); ws.send(JSON.stringify({ kind: 'hello', sessionId, paused: simulationPaused, mode: demo ? 'demo' : 'live' })); });
const heartbeat = setInterval(() => { for (const ws of sockets.clients) { if (!ws.isAlive) ws.terminate(); else { ws.isAlive = false; ws.ping(); } } broadcast({ kind: 'heartbeat', timestamp: Date.now() }); }, 15_000);
const persistence = setInterval(persistEntities, 5_000);
const simulation = demo ? setInterval(() => {
  if (simulationPaused) return;
  const now = Date.now();
  for (const { id, record } of store.list('vessel')) if (typeof record.data.speed === 'number') {
    const speed = record.data.status === '系泊' ? 0 : Math.max(0, Number((record.data.speed + Math.sin(now / 7000 + Number(id.slice(-1))) * 0.15).toFixed(1)));
    update({ type: 'vessel', id, timestamp: now, data: { ...record.data, speed, update_time: new Date(now).toISOString() } });
  }
  const vessels = store.list('vessel').map(x=>x.record.data);
  update({type:'port_stats',timestamp:now,data:{total_vessels:vessels.length,cargo_count:vessels.filter(v=>v.vessel_type==='商船').length,fishing_count:vessels.filter(v=>v.vessel_type==='渔船'&&v.status==='作业').length,warning_count:vessels.filter(v=>v.status==='告警').length}});
}, 1000) : null;
server.listen(port, host, () => console.log(`LiteCodeTool ${demo ? '演示数据（独立目录）' : '真实数据（未接入字段显示 --）'}：http://${host}:${port}`));
server.on('error', e => { console.error('服务启动失败：', e.message); process.exit(1); });
let stopping = false;
async function stop() { if (stopping) return; stopping = true; clearInterval(heartbeat); clearInterval(persistence); if (simulation) clearInterval(simulation); await persistEntities(); for (const ws of sockets.clients) ws.terminate(); sockets.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
