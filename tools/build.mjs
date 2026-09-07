/**
 * 离线发布构建：使用随源码固定的 TypeScript 5.8.3 与 Vue 3.5.13 编译器。
 * 仅支持本项目已采用的普通 <script lang="ts"> 单文件组件；不冒充 vue-tsc。
 * 模板在构建时编译为渲染函数，用户启动时不编译源码、不访问 CDN。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const ts = require('../vendor/typescript/typescript.cjs');
const he = require('../vendor/he.cjs');
const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.resolve(root, '../liteCodeTool_tmp/release/app');
const sourceDir = path.join(root, 'src');
await fs.mkdir(path.join(out, 'web/assets'), { recursive: true });
for (const name of await fs.readdir(path.join(out,'web/assets'))) if (/^app-[a-f0-9]{12}\.js$/.test(name)) await fs.unlink(path.join(out,'web/assets',name));
await fs.mkdir(path.join(out, 'server'), { recursive: true });
await fs.mkdir(path.join(out, 'engine'), { recursive: true });
await fs.mkdir(path.join(out, 'vendor'), { recursive: true });
const vue = await fs.readFile(path.join(root, 'vendor/vue/vue.global.prod.js'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(vue, context, { filename: 'vue.global.prod.js', timeout: 5000 });
const templates = [], modules = [], inputs = {};
async function scan(dir) {
  const files = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await scan(p));
    else if (/\.(vue|ts)$/.test(entry.name)) files.push(p);
  }
  return files;
}
function compile(source, name, module) {
  const result = ts.transpileModule(source, { fileName: name, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module, esModuleInterop: true, removeComments: false, isolatedModules: true } });
  const errors = result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error) ?? [];
  if (errors.length) throw new Error(name+': '+errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  return result.outputText;
}
for (const filename of await scan(sourceDir)) {
  const id = path.relative(sourceDir, filename).split(path.sep).join('/');
  const text = await fs.readFile(filename, 'utf8');
  inputs[id] = createHash('sha256').update(text).digest('hex');
  let script = text;
  if (id.endsWith('.vue')) {
    const match = text.match(/^<script lang="ts">([\s\S]*?)<\/script>\s*<template>([\s\S]*)<\/template>\s*$/);
    if (!match) throw new Error(`${id} 不符合离线构建支持的单文件组件格式，拒绝静默转换`);
    script = match[1];
    const render = context.Vue.compile(match[2], { hoistStatic: false, cacheHandlers: false, decodeEntities: (text, asAttr) => he.decode(text, { isAttributeValue: asAttr }), onError(error) { throw error; } });
    const functionText = render.toString();
    if (/_hoisted_\d+/.test(functionText)) throw new Error(`${id} 意外引用了未声明的模板常量`);
    templates.push(`${JSON.stringify(id)}: ${functionText}`);
  }
  const body = compile(script, id.replace(/\.vue$/,'.ts'), ts.ModuleKind.CommonJS);
  modules.push(`${JSON.stringify(id)}: function(require,module,exports){\n${body}\n}`);
}
const bundle = `/* LiteCodeTool 离线预编译客户端；第三方许可见 THIRD_PARTY_NOTICES.md */\n(function(){\nconst _Vue=window.Vue;\nconst renders={${templates.join(',\n')}};\nfor(const fn of Object.values(renders))fn._rc=true;\nconst modules={${modules.join(',\n')}};\nconst cache=Object.create(null);\nfunction load(id){if(cache[id])return cache[id].exports;if(!modules[id])throw new Error('未打包模块：'+id);const m=cache[id]={exports:{}};function require(request){if(request==='vue')return _Vue;if(request.endsWith('.css'))return {};const parts=id.split('/');parts.pop();for(const p of request.split('/')){if(p==='.'||!p)continue;if(p==='..')parts.pop();else parts.push(p)}return load(parts.join('/'));}modules[id](require,m,m.exports);if(renders[id])m.exports.default.render=renders[id];return m.exports;}\nload('main.ts');\n})();\n`;
new vm.Script(bundle, { filename: 'app.js' });
const bundleHash = createHash('sha256').update(bundle).digest('hex').slice(0,12);
await fs.writeFile(path.join(out, `web/assets/app-${bundleHash}.js`), bundle);
await fs.copyFile(path.join(root, 'src/styles.css'), path.join(out, 'web/assets/styles.css'));
await fs.writeFile(path.join(out, 'web/assets/vue.global.prod.js'), vue);
await fs.writeFile(path.join(out, 'web/index.html'), `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>LiteCodeTool · 科技蓝低代码大屏</title><link rel="icon" href="data:,"><link rel="stylesheet" href="./assets/styles.css"><script defer src="./assets/vue.global.prod.js"></script><script defer src="./assets/app-${bundleHash}.js"></script></head><body><div id="app"><div style="padding:60px;color:#b4d9ee;font:16px sans-serif;background:#030b17">正在启动低代码大屏…</div></div></body></html>`);
await fs.writeFile(path.join(out, 'engine/core.mjs'), compile(await fs.readFile(path.join(root, 'src/engine/core.ts'),'utf8'), 'core.ts', ts.ModuleKind.ES2022));
let server = await fs.readFile(path.join(root, 'server/index.mjs'),'utf8');
server = server.replace("'../src/engine/core.ts'", "'../engine/core.mjs'");
await fs.writeFile(path.join(out, 'server/index.mjs'), server);
await fs.copyFile(path.join(root, 'server/defaults.mjs'), path.join(out,'server/defaults.mjs'));
for(const name of ['ws.cjs','ws.LICENSE'])await fs.copyFile(path.join(root,'vendor',name),path.join(out,'vendor',name));
await fs.copyFile(path.join(root,'vendor/vue/LICENSE'),path.join(out,'vendor/vue.LICENSE'));
await fs.writeFile(path.join(out,'build-info.json'),JSON.stringify({name:'LiteCodeTool',version:'0.2.0',builder:'离线预编译：TypeScript 5.8.3 + Vue 3.5.13',baseCommit:'8dd3a9f525b54158c65bb5ff887452f86adca848',inputs,entry:`app-${bundleHash}.js`},null,2));
console.log(`构建完成：${out}\n${templates.length} 个 Vue 模板已预编译；${modules.length} 个 TS/Vue 模块已编译；Node 服务已转为 JavaScript。`);
