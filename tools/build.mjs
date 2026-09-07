/**
 * 标准构建入口：检查 Vue/TypeScript，构建前端，编译服务端共享核心，再装配发布目录。
 * 使用当前 Node 进程执行本地依赖；产物统一写入仓库同级 liteCodeTool_tmp。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { build } from 'vite';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = path.resolve(root, '../liteCodeTool_tmp/release/app');
// 类型检查失败即结束，不继续生成可能无法使用的发布产物。
const check = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/vue-tsc/bin/vue-tsc.js'), '--noEmit'],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
if (check.status !== 0) process.exit(check.status || 1);
await build({ root });
// 只清理已验证位于指定发布目录中的上次装配产物。
const parent = path.resolve(root, '../liteCodeTool_tmp/release');
if (path.dirname(out) !== parent) throw new Error('发布目录越界');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.cp(path.resolve(root, '../liteCodeTool_tmp/dist'), path.join(out, 'web'), {
  recursive: true,
});
// 核心逻辑由标准 TypeScript 编译器输出为服务端可直接加载的 JavaScript，并保留源码映射。
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  rootDir: path.join(root, 'src'),
  outDir: out,
  sourceMap: true,
  skipLibCheck: true,
  strict: true,
  rewriteRelativeImportExtensions: true,
};
const program = ts.createProgram([path.join(root, 'src/engine/core.ts')], options);
const result = program.emit();
const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics].filter(
  (d) => d.category === ts.DiagnosticCategory.Error,
);
if (diagnostics.length)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      /**
       * 向诊断格式化器提供原始文件名，不改变路径大小写。
       * @param f - TypeScript 提供的文件名。
       * @returns 原文件名字符串。
       */
      getCanonicalFileName: (f) => f,
      /**
       * 提供诊断消息解析相对路径的基准目录。
       * @returns 项目根目录绝对路径。
       */
      getCurrentDirectory: () => root,
      /**
       * 统一诊断消息换行符，避免平台差异影响输出。
       * @returns LF 换行字符。
       */
      getNewLine: () => '\n',
    }),
  );
await fs.mkdir(path.join(out, 'server'), { recursive: true });
// 发布端引用已编译核心；开发端保留对 TypeScript 源码的引用，便于断点调试。
let server = await fs.readFile(path.join(root, 'server/index.mjs'), 'utf8');
server = server.replace("'../src/engine/core.ts'", "'../engine/core.js'");
await fs.writeFile(path.join(out, 'server/index.mjs'), server);
await fs.copyFile(path.join(root, 'server/defaults.mjs'), path.join(out, 'server/defaults.mjs'));
await fs.mkdir(path.join(out, 'vendor'), { recursive: true });
for (const name of ['ws.cjs', 'ws.LICENSE'])
  await fs.copyFile(path.join(root, 'vendor', name), path.join(out, 'vendor', name));
await fs.writeFile(
  path.join(out, 'package.json'),
  JSON.stringify({ private: true, type: 'module' }, null, 2),
);
await fs.copyFile(path.join(root, 'tools/launcher.mjs'), path.join(parent, 'launcher.mjs'));
await fs.copyFile(
  path.join(root, 'THIRD_PARTY_NOTICES.md'),
  path.join(parent, 'THIRD_PARTY_NOTICES.md'),
);
await fs.mkdir(path.join(parent, 'licenses'), { recursive: true });
for (const name of ['vue', 'vue-router'])
  await fs.copyFile(
    path.join(root, 'node_modules', name, 'LICENSE'),
    path.join(parent, 'licenses', name + '.LICENSE'),
  );
await fs.writeFile(
  path.join(out, 'build-info.json'),
  JSON.stringify(
    {
      builder: 'Vite + TypeScript',
      node: process.version,
      lockHash: createHash('sha256')
        .update(await fs.readFile(path.join(root, 'package-lock.json')))
        .digest('hex'),
    },
    null,
    2,
  ),
);
console.log(`发布装配完成：${out}`);
