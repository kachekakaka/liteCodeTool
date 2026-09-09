import http from 'node:http';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://127.0.0.1:8787' },
    a: { type: 'string', default: 'screen_main' },
    b: { type: 'string', default: 'screen_main' },
    port: { type: 'string', default: '8899' },
  },
});
const base = new URL(values.base);
if (!['http:', 'https:'].includes(base.protocol))
  throw new Error('大屏服务地址必须使用 HTTP 或 HTTPS');
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('宿主端口无效');
if (Number(base.port || (base.protocol === 'https:' ? 443 : 80)) === port)
  throw new Error('测试宿主与大屏服务必须使用不同端口');

/**
 * 转义 HTML 文本及属性。
 * @param value - 原始内容。
 * @returns 已转义的字符串。
 */
function escape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * 生成一个可调整尺寸的跨来源测试框，不把 load 事件作为通过依据。
 * @param label - 浏览器内用来定位框架的名称。
 * @param id - 已存在的大屏 ID 或用于错误用例的无效 ID。
 * @returns 测试框 HTML。
 */
function frame(label, id) {
  const url = new URL(`/screens/${encodeURIComponent(id)}/embed`, base);
  return `<section><h2>${escape(label)}</h2><p>${escape(url.href)}</p><div class="resizable"><iframe title="${escape(label)}" src="${escape(url.href)}" allowfullscreen></iframe></div></section>`;
}

const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>大屏 iframe 专项验收</title>
<style>body{background:#081322;color:#dbe8f7;font:15px system-ui;margin:24px}section{margin:24px 0}p{overflow-wrap:anywhere}iframe{width:100%;height:100%;border:0}.resizable{width:100%;height:600px;min-width:320px;min-height:240px;resize:both;overflow:auto;border:1px solid #6584a4;max-width:100%}</style>
<h1>大屏 iframe 专项验收</h1><p>宿主与大屏服务端口不同。逐个进入框架检查实际卡片、实时值和来源切换；本页面不自动宣告通过。拖动右下角可调整容器尺寸。</p>
${frame('大屏 A', values.a)}${frame('大屏 B', values.b)}${frame('大屏 A 对照', values.a)}${frame('无效大屏', 'screen_missing_iframe_smoke')}
</html>`;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(page);
});
server.listen(port, '0.0.0.0', () =>
  console.log(`iframe 测试宿主：http://127.0.0.1:${port}；其他电脑请替换为本机局域网地址。`),
);
