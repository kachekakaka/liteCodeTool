import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { validateEnvelope as validateIncoming } from './ingestion.mjs';
import { upgradeData } from './data-upgrade.mjs';
import { createRequire } from 'node:module';
const requireForLock = createRequire(import.meta.url);
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import wsLibrary from '../vendor/ws.cjs';
const { WebSocketServer } = wsLibrary;
import {
  normalizeTemplate,
  normalizeScreen,
  resolveEntityEntry,
  EntityStore,
  validId,
  validateTemplate,
  validateScreen,
  assertJsonSafe,
  finite,
} from '../src/engine/core.ts';
import {
  schemas as builtinSchemas,
  templates as builtinTemplates,
  defaultScreen,
  demoEnvelopes,
} from './defaults.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const demo = process.argv.includes('--demo');
const base = path.resolve(process.env.DATA_DIR || path.join(root, '../liteCodeTool_datas'));
const dataRelative = path.relative(root, base);
if (!dataRelative || (!dataRelative.startsWith('..' + path.sep) && !path.isAbsolute(dataRelative)))
  throw new Error('数据目录必须位于源码仓库之外');
if (base.includes('liteCodeTool_tmp'))
  throw new Error('持久化数据目录禁止指向临时目录 liteCodeTool_tmp');
const dataDir = demo ? path.join(base, 'demo') : base;
const clientDir = path.resolve(process.env.CLIENT_DIR || path.join(root, 'web'));
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('端口必须是 1024~65535 的整数');
const ingestionToken = process.env.INGEST_TOKEN || '';
const sessionId = randomUUID();
const queues = new Map();
class HttpError extends Error {
  /**
   * 构造带 HTTP 状态码的业务错误，交给统一请求错误处理器返回。
   *
   * @param status - 应返回的 HTTP 状态码。
   * @param message - 面向客户端的错误原因。
   * @returns 新的 HttpError 实例。
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
/**
 * 对配置文件原文计算强 ETag，用于并发版本校验。
 *
 * @param text - 配置文件的 UTF-8 文本原文。
 * @returns 带双引号的 SHA256 十六进制字符串，可直接用于 ETag 或 If-Match。
 */
const etag = (text) => `"${createHash('sha256').update(text).digest('hex')}"`;
/**
 * 根据受控分组和资源 ID 定位外部数据目录中的 JSON 文件。
 *
 * @param group - 由服务端内部指定的分组，例如 schemas、templates、screens 或 entities；不可直接使用任意用户路径。
 * @param id - 资源 ID，必须通过 validId 校验。
 * @returns 位于数据目录对应分组下的 JSON 文件路径。
 * @throws ID 不合法时抛出状态码 400 的 HttpError。
 */
const file = (group, id) => {
  if (!validId(id)) throw new HttpError(400, '标识只允许字母、数字、下划线和连字符');
  return path.join(dataDir, group, `${id}.json`);
};
/**
 * 读取 JSON 文件并基于其原文计算版本，不改写文件。
 *
 * @param pathname - 待读取文件的路径，由受控数据目录生成。
 * @returns 兑现为 data 配置对象和 revision ETag 的 Promise。
 * @throws 文件读取或 JSON 解析失败时拒绝 Promise。
 */
async function read(pathname) {
  const text = await readFile(pathname, 'utf8');
  return { data: JSON.parse(text), revision: etag(text) };
}
/**
 * 先写入同目录唯一临时文件再重命名替换目标，结束时清理残留临时文件。
 *
 * @param pathname - 最终 JSON 文件路径；父目录须已存在。
 * @param value - 可序列化为 JSON 的配置值。
 * @returns 完成处理的 Promise，不携带业务返回值。
 * @throws 序列化、写入或重命名失败时拒绝 Promise。
 */
async function atomic(pathname, value) {
  const temp = `${pathname}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(temp, pathname);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
/**
 * 按文件串行执行并发版本校验与原子写入，避免同一资源的并行保存互相覆盖。
 *
 * @param pathname - 需要保存的配置文件路径。
 * @param value - 待保存的 JSON 配置。
 * @param match - 现有版本 ETag；星号表示仅允许创建不存在的文件，缺失版本会拒绝覆盖。
 * @param remove - 是否删除当前资源，默认 false；删除与保存共用队列及版本检查。
 * @returns 兑现为保存后的 data 和 revision 的 Promise。
 * @throws 版本不匹配或目标已存在时返回 412，缺少覆盖前提时返回 428；文件错误继续向上传递。
 */
async function save(pathname, value, match, remove = false) {
  const previous = queues.get(pathname) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      let current;
      try {
        current = await read(pathname);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      if (remove && !current) throw new HttpError(404, '大屏不存在或已删除');
      if (
        remove
          ? !match || match !== current?.revision
          : match === '*'
            ? !!current
            : !match || match !== current?.revision
      )
        throw new HttpError(
          match ? 412 : 428,
          '配置已被其他窗口修改，请重新载入后保存；本次未覆盖',
        );
      if (remove) {
        await unlink(pathname);
        return;
      }
      await atomic(pathname, value);
      return read(pathname);
    });
  queues.set(pathname, task);
  try {
    return await task;
  } finally {
    if (queues.get(pathname) === task) queues.delete(pathname);
  }
}
/**
 * 仅在资源文件不存在时写入默认配置，保留已有用户修改。
 *
 * @param group - 默认资源所属数据分组。
 * @param id - 默认资源 ID。
 * @param value - 首次创建时使用的 JSON 配置。
 * @returns 完成处理的 Promise，不携带业务返回值。
 */
async function seed(group, id, value) {
  const pathname = file(group, id);
  try {
    await read(pathname);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    await atomic(pathname, value);
  }
}
// 防止两个独立进程同时写同一个数据目录。失效进程留下的锁可自动恢复。
await mkdir(dataDir, { recursive: true });
const lockPath = path.join(dataDir, '.server.lock');
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
      { flag: 'wx', mode: 0o600 },
    );
    break;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let lock;
    try {
      lock = JSON.parse(await readFile(lockPath, 'utf8'));
    } catch {
      throw new Error('数据目录锁文件无法读取，请先检查 .server.lock，不会覆盖用户数据');
    }
    if (!Number.isInteger(lock.pid) || lock.pid <= 0)
      throw new Error('数据目录锁无效，请先检查 .server.lock');
    let alive = true;
    try {
      process.kill(lock.pid, 0);
    } catch (e) {
      if (e.code === 'ESRCH') alive = false;
    }
    if (alive) throw new Error('同一数据目录已有服务在运行，请停止原服务后重试');
    await unlink(lockPath);
    if (attempt === 1) throw new Error('无法取得数据目录锁');
  }
}
process.on('exit', () => {
  try {
    const fs = requireForLock('node:fs');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (lock.pid === process.pid) fs.unlinkSync(lockPath);
  } catch {}
});
for (const group of ['schemas', 'templates', 'screens', 'entities'])
  await mkdir(path.join(dataDir, group), { recursive: true });
const inputUnits = await upgradeData(dataDir, {
  schemas: builtinSchemas,
  templates: builtinTemplates,
  records: demoEnvelopes(),
  demo,
  screen: defaultScreen(demo),
});
// 先检查兼容升级，冲突时不得提前写入缺失模板；已升级目录仍保留首次资源补缺行为。
await seed('schemas', 'default', builtinSchemas);
for (const template of builtinTemplates) await seed('templates', template.id, template);
// 大屏仅由一次性升级初始化，已初始化目录允许空列表，删除后不能自动复活。
await seed('entities', 'snapshot', demo ? demoEnvelopes() : []);
const schemas = (await read(file('schemas', 'default'))).data;
const store = new EntityStore();
for (const envelope of (await read(file('entities', 'snapshot'))).data) store.apply(envelope, true);
/**
 * 将内存实体池转换为可持久化或供启动接口使用的底账列表，保留逐字段源时间。
 *
 * @returns 快照数据包数组；全局记录省略 id，不包含历史点集。
 */
const snapshots = () =>
  Object.entries(store.records).flatMap(([type, records]) =>
    Object.entries(records).map(([id, r]) => ({
      type,
      ...(id === '_global' ? {} : { id }),
      timestamp: Math.max(0, ...Object.values(r.timestamps)),
      data: r.data,
      fieldTimestamps: r.timestamps,
    })),
  );
/**
 * 按文件名顺序读取合法 JSON 资源；忽略列举后已被并发删除的文件，其他读取错误仍上报。
 *
 * @param group - 服务端受控数据分组目录名。
 * @returns 兑现为仍存在的 data、revision 记录数组的 Promise。
 */
async function list(group) {
  const rows = await Promise.all(
    (await readdir(path.join(dataDir, group)))
      .filter((n) => /^[A-Za-z0-9_-]+\.json$/.test(n))
      .sort()
      .map(async (n) => {
        try {
          return await read(path.join(dataDir, group, n));
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      }),
  );
  return rows.filter(Boolean);
}
/**
 * 读取模板分组并提取模板数据，供引用校验和导入使用。
 *
 * @returns 兑现为模板配置数组的 Promise。
 */
const allTemplates = async () => (await list('templates')).map((r) => r.data);
/**
 * 发送不缓存的 JSON 响应，按需附带资源版本。
 *
 * @param res - Node HTTP 响应对象。
 * @param status - HTTP 响应状态码。
 * @param value - 可序列化的响应数据。
 * @param revision - 可选 ETag；为空或省略时不写版本响应头。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function send(res, status, value, revision) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(revision ? { ETag: revision } : {}),
  });
  res.end(JSON.stringify(value));
}
/**
 * 读取最多 2 MB 的 JSON 请求体，并检查配置中的保留键及嵌套深度。
 *
 * @param req - 可异步遍历请求体、且 Content-Type 为 application/json 的 HTTP 请求。
 * @returns 兑现为解析后的 JSON 值的 Promise。
 * @throws 类型不符为 415、体积超限为 413、JSON 或结构不合法为 400。
 */
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, '请求必须是 JSON');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new HttpError(413, '配置超过 2 MB 限制');
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assertJsonSafe(parsed);
    return parsed;
  } catch {
    throw new HttpError(400, 'JSON 格式不正确或含有不允许的字段');
  }
}
/**
 * 校验接入数据的数据模式、实体身份、字段类型和源时间，并剥离客户端快照元数据。
 *
 * @param e - 待校验的外部增量包；时间不得晚于当前时间超过一分钟。
 * @returns 仅含 type、可选 id、timestamp 和 data 的标准增量包。
 * @throws 无效模式、ID、字段值或时间戳时抛出状态码 400 的 HttpError。
 */
function validateEnvelope(e) {
  try {
    return validateIncoming(e, schemas, store, inputUnits);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
let lastUpdate = null,
  dirtyEntities = false,
  simulationPaused = false;
let persistTask = Promise.resolve();
/**
 * 将脏实体池快照排队落盘；写入失败时恢复脏标记供后续重试。
 *
 * @returns 等待本次或已有持久化任务的 Promise；本次落盘失败会记录日志并保留重试状态。
 */
async function persistEntities() {
  if (!dirtyEntities) return persistTask;
  dirtyEntities = false;
  const snapshot = JSON.parse(JSON.stringify(snapshots()));
  persistTask = persistTask
    .catch(() => {})
    .then(() => atomic(file('entities', 'snapshot'), snapshot));
  try {
    await persistTask;
  } catch (e) {
    dirtyEntities = true;
    console.error('实体快照保存失败：', e.message);
  }
}
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
/**
 * 向所有已连接客户端发送 JSON 消息，缓冲超过 2 MB 的慢连接直接断开。
 *
 * @param message - 可序列化的实时协议消息，例如 update、hello 或 demo-state。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of sockets.clients)
    if (client.readyState === 1) {
      if (client.bufferedAmount > 2_000_000) client.terminate();
      else client.send(payload);
    }
}
/**
 * 合并一份已校验增量包，标记待持久化并广播更新。
 *
 * @param envelope - 已通过接入校验或由可信演示逻辑生成的增量包。
 * @returns 无返回值（undefined）；结果通过状态更新或副作用体现。
 */
function update(envelope) {
  envelope = validateIncoming(envelope, schemas, store);
  store.apply(envelope);
  dirtyEntities = true;
  lastUpdate = Date.now();
  broadcast({ kind: 'update', envelope });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
      const templates = await list('templates');
      const screens = (await list('screens')).sort((a, b) => a.data.id.localeCompare(b.data.id));
      const screen = screens.find((row) => row.data.id === 'screen_main') || screens[0] || null;
      return send(res, 200, {
        mode: demo ? 'demo' : 'live',
        schemas,
        templates,
        screen,
        screens: screens.map((r) => ({ id: r.data.id, name: r.data.name })),
        snapshots: snapshots(),
        lastUpdate,
        paused: simulationPaused,
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/schemas') return send(res, 200, schemas);
    if (req.method === 'GET' && url.pathname === '/api/health')
      return send(res, 200, {
        app: 'LiteCodeTool',
        version: '0.2.0',
        sessionId,
        mode: demo ? 'demo' : 'live',
        lastUpdate,
        paused: simulationPaused,
      });
    if (parts[0] === 'api' && ['templates', 'screens'].includes(parts[1])) {
      const group = parts[1],
        id = parts[2];
      if (req.method === 'GET') {
        if (!id) return send(res, 200, await list(group));
        const result = await read(file(group, id));
        return send(res, 200, result.data, result.revision);
      }
      if (group === 'screens' && req.method === 'DELETE' && parts.length === 3) {
        await save(file(group, id), undefined, req.headers['if-match'], true);
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (['POST', 'PUT'].includes(req.method) && parts.length === 3) {
        if (req.method === 'PUT' && req.headers['if-match'] === '*')
          throw new HttpError(412, '保存必须使用读取时的大屏或模板版本');
        let value = await body(req);
        value =
          group === 'templates'
            ? normalizeTemplate(value)
            : normalizeScreen(value, await allTemplates(), store, schemas);
        if (value.id !== id) throw new HttpError(400, '请求路径与配置标识不一致');
        try {
          if (group === 'templates') {
            validateTemplate(value, schemas);
            const candidates = (await allTemplates())
              .filter((t) => t.id !== value.id)
              .concat(value);
            for (const saved of await list('screens'))
              if (saved.data.components.some((i) => i.templateId === value.id)) {
                try {
                  validateScreen(saved.data, candidates, schemas);
                } catch (e) {
                  throw new HttpError(
                    409,
                    `模板更新会使大屏“${saved.data.name}”失效：${e.message}。请另存为新模板。`,
                  );
                }
              }
          } else validateScreen(value, await allTemplates(), schemas);
        } catch (e) {
          throw e instanceof HttpError ? e : new HttpError(400, e.message);
        }
        const result = await save(
          file(group, id),
          value,
          req.method === 'POST'
            ? req.headers['if-none-match'] === '*'
              ? '*'
              : ''
            : req.headers['if-match'],
        );
        return send(res, req.method === 'POST' ? 201 : 200, result.data, result.revision);
      }
    }
    if (
      req.method === 'GET' &&
      parts[0] === 'api' &&
      parts[1] === 'entities' &&
      parts.length === 4
    ) {
      if (!validId(parts[2]) || !validId(parts[3])) throw new HttpError(400, '实体标识无效');
      const recordId =
        url.searchParams.get('byTarget') === '1'
          ? resolveEntityEntry(
              store,
              parts[2],
              parts[3],
              url.searchParams.get('source') || undefined,
              schemas.find((s) => s.type === parts[2]),
            )?.id
          : parts[3];
      const snapshot = snapshots().find((s) => s.type === parts[2] && s.id === recordId);
      if (!snapshot) throw new HttpError(404, '该实体尚无初始底账');
      return send(res, 200, snapshot);
    }
    if (req.method === 'POST' && url.pathname === '/api/import') {
      const bundle = await body(req);
      if (
        bundle?.format !== 'litecode.screen.v1' ||
        !bundle.screen ||
        !Array.isArray(bundle.templates) ||
        bundle.templates.length > 150
      )
        throw new HttpError(400, '请选择从本软件导出的完整 .litecode.json 配置包');
      const ids = new Map();
      const imported = bundle.templates.map((template) => {
        if (ids.has(template.id)) throw new HttpError(400, '配置包包含重复的模板标识');
        const id = 'tpl_' + randomUUID().replaceAll('-', '');
        ids.set(template.id, id);
        return normalizeTemplate({ ...template, id });
      });
      const screen = normalizeScreen(
        {
          ...bundle.screen,
          id: 'screen_' + randomUUID().replaceAll('-', ''),
          name: (bundle.screen.name || '导入大屏').slice(0, 110) + ' · 导入',
          components: (bundle.screen.components || []).map((i) => ({
            ...i,
            templateId: ids.get(i.templateId),
          })),
        },
        imported,
        store,
        schemas,
      );
      try {
        for (const t of imported) validateTemplate(t, schemas);
        validateScreen(screen, imported, schemas);
      } catch (e) {
        throw new HttpError(400, e.message);
      }
      // 全量校验后再写入唯一命名的新文件；最后写大屏，失败只清理本次新文件。
      const created = [],
        rows = [];
      let screenRow;
      try {
        for (const t of imported) {
          const f = file('templates', t.id);
          const row = await save(f, t, '*');
          created.push(f);
          rows.push(row);
        }
        const f = file('screens', screen.id);
        screenRow = await save(f, screen, '*');
        created.push(f);
      } catch (e) {
        for (const f of created) await unlink(f).catch(() => {});
        throw e;
      }
      return send(res, 201, { screen: screenRow, templates: rows });
    }
    if (req.method === 'POST' && url.pathname === '/api/ingest') {
      const provided = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
      const expected = Buffer.from(ingestionToken);
      if (
        demo ||
        expected.length < 24 ||
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      )
        throw new HttpError(403, '数据接入未启用或凭据无效');
      update(validateEnvelope(await body(req)));
      return send(res, 202, { accepted: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/demo') {
      if (!demo) throw new HttpError(404, '真实数据模式不提供演示接口');
      const action = (await body(req)).action;
      if (action === 'toggle') simulationPaused = !simulationPaused;
      else if (action === 'discover') {
        update({
          type: 'vessel',
          id: '413000999',
          timestamp: Date.now(),
          data: {
            mmsi: '413000999',
            vessel_name: '新发现演示船',
            vessel_type: '商船',
            status: null,
            speed: null,
          },
        });
        const vessels = store.list('vessel').map((x) => x.record.data);
        update({
          type: 'port_stats',
          timestamp: Date.now(),
          data: {
            total_vessels: vessels.length,
            cargo_count: vessels.filter((v) => v.vessel_type === '商船').length,
          },
        });
      } else throw new HttpError(400, '未知演示操作');
      broadcast({ kind: 'demo-state', paused: simulationPaused });
      return send(res, 200, { paused: simulationPaused });
    }
    if (
      url.pathname === '/api' ||
      url.pathname.startsWith('/api/') ||
      url.pathname === '/ws' ||
      !['GET', 'HEAD'].includes(req.method)
    )
      throw new HttpError(404, '接口不存在');
    const relative = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const pathname = path.resolve(clientDir, '.' + relative);
    if (!pathname.startsWith(clientDir + path.sep)) throw new HttpError(403, '路径无效');
    let bytes,
      servedPath = pathname;
    try {
      bytes = await readFile(pathname);
    } catch (error) {
      if (
        error.code !== 'ENOENT' ||
        path.extname(relative) ||
        relative.startsWith('/assets/') ||
        !req.headers.accept?.includes('text/html')
      )
        throw error;
      servedPath = path.join(clientDir, 'index.html');
      bytes = await readFile(servedPath);
    }
    const mime =
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.json': 'application/json',
        '.map': 'application/json',
      }[path.extname(servedPath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime + '; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self'; object-src 'none'; base-uri 'none'" +
        (/^\/screens\/[^/]+\/(view|embed)\/?$/.test(url.pathname)
          ? ''
          : "; frame-ancestors 'none'"),
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (e) {
    if (!res.headersSent)
      send(res, e.status || (e.code === 'ENOENT' ? 404 : 500), {
        error: e.status
          ? e.message
          : e.code === 'ENOENT'
            ? req.url?.startsWith('/api/')
              ? '资源不存在或已删除'
              : '文件不存在；首次使用请先构建客户端'
            : '读取或保存失败，原有数据未被覆盖',
      });
  }
});
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') return socket.destroy();
  sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws, req));
});
sockets.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('error', () => {});
  ws.send(
    JSON.stringify({
      kind: 'hello',
      sessionId,
      paused: simulationPaused,
      mode: demo ? 'demo' : 'live',
    }),
  );
});
const heartbeat = setInterval(() => {
  for (const ws of sockets.clients) {
    if (!ws.isAlive) ws.terminate();
    else {
      ws.isAlive = false;
      ws.ping();
    }
  }
  broadcast({ kind: 'heartbeat', timestamp: Date.now() });
}, 15_000);
const persistence = setInterval(persistEntities, 5_000);
const simulation = demo
  ? setInterval(() => {
      if (simulationPaused) return;
      const now = Date.now();
      for (const { id, record } of store.list('vessel'))
        if (typeof record.data.speed === 'number') {
          const speed =
            record.data.status === '系泊'
              ? 0
              : Math.max(
                  0,
                  Number(
                    (
                      record.data.speed +
                      Math.sin(now / 7000 + Number(id.slice(-1))) * 0.15
                    ).toFixed(1),
                  ),
                );
          update({
            type: 'vessel',
            id,
            timestamp: now,
            data: { ...record.data, speed, update_time: new Date(now).toISOString() },
          });
        }
      for (const { id, record } of store.list('projectile')) {
        if (typeof record.data.altitude === 'number') {
          const numId = Number(id.replace(/\D/g, '') || 1);
          const deltaAlt = Math.sin(now / 5000 + numId) * 0.25;
          const deltaSpd = Math.cos(now / 4000 + numId) * 15;
          const altitude = Math.max(1.0, Number((record.data.altitude + deltaAlt).toFixed(2)));
          const speed = Math.max(100, Math.round(record.data.speed + deltaSpd));
          update({
            type: 'projectile',
            id,
            timestamp: now,
            data: { ...record.data, altitude, speed, update_time: new Date(now).toISOString() },
          });
        }
      }
      if (Math.random() < 0.2) {
        const sampleLogs = [
          { level: 'info', source: '雷达1', content: '雷达1跟踪波束稳定，目标回波信噪比优于 18dB' },
          { level: 'info', source: '遥测', content: '遥测主站锁定飞行器下行遥测包，姿态角正常' },
          { level: 'warn', source: '雷达2', content: '检测到低空杂波波动，已切换多普勒滤波门' },
          { level: 'info', source: '光测', content: '光电经纬仪视场已捕获目标，交汇测量解算中' },
        ];
        const evt = sampleLogs[Math.floor(Math.random() * sampleLogs.length)];
        update({
          type: 'event_log',
          timestamp: now,
          data: { time: new Date(now).toISOString(), ...evt },
        });
      }
      const vessels = store.list('vessel').map((x) => x.record.data);
      update({
        type: 'port_stats',
        timestamp: now,
        data: {
          total_vessels: vessels.length,
          cargo_count: vessels.filter((v) => v.vessel_type === '商船').length,
          fishing_count: vessels.filter((v) => v.vessel_type === '渔船' && v.status === '作业')
            .length,
          warning_count: vessels.filter((v) => v.status === '告警').length,
        },
      });
    }, 1000)
  : null;
server.listen(port, host, () => {
  console.log(
    `LiteCodeTool ${demo ? '演示数据（独立目录）' : '真实数据（未接入字段显示 --）'}：http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
  );
  if (host === '0.0.0.0') {
    const addresses = new Set(
      Object.values(networkInterfaces())
        .flat()
        .filter((row) => row?.family === 'IPv4' && !row.internal)
        .map((row) => row.address),
    );
    for (const address of addresses) console.log(`局域网访问：http://${address}:${port}/screens`);
  }
  process.send?.({ kind: 'ready', sessionId });
});
server.on('error', (e) => {
  console.error('服务启动失败：', e.message);
  process.exit(1);
});
let stopping = false;
/**
 * 停止服务计时器，保存实体快照并关闭连接；最长约 1.5 秒后结束进程。
 *
 * @returns 快照处理与关闭调度完成的 Promise；进程退出由 server.close 回调或超时触发。
 */
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeat);
  clearInterval(persistence);
  if (simulation) clearInterval(simulation);
  await persistEntities();
  for (const ws of sockets.clients) ws.terminate();
  sockets.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
if (process.connected) process.on('disconnect', stop);
