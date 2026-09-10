/** 用已校验本地资源装配双平台开发目录；不联网，不覆盖既有交付目录。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = path.resolve(root, '../liteCodeTool_tmp');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index >= 0 && !process.argv[index + 1]) throw new Error(name + ' 缺少值');
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const target = option('--target', 'win32-x64');
if (!['win32-x64', 'linux-arm64'].includes(target))
  throw new Error('仅支持 win32-x64 和 linux-arm64');
const windows = target === 'win32-x64';
const resources = path.resolve(
  option('--resources', path.join(temporary, windows ? 'offline-resources' : 'arm-dev-resources')),
);
const dependencies = path.resolve(
  option('--dependencies', path.join(temporary, 'dev-dependencies', target)),
);
const destination = path.resolve(
  option('--output', path.join(temporary, `offline-devkit-${target}`)),
);
if (
  !destination.startsWith(temporary + path.sep) ||
  destination === resources ||
  destination.startsWith(resources + path.sep) ||
  destination === dependencies ||
  destination.startsWith(dependencies + path.sep)
)
  throw new Error('输出必须是外部临时目录内独立的新目录');
try {
  await fs.access(destination);
  throw new Error('输出已存在，请使用新的 --output 目录');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const sha = async (file) =>
  createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
const descriptor = JSON.parse(await fs.readFile(path.join(resources, 'resources.json'), 'utf8'));
const lockHash = await sha(path.join(root, 'package-lock.json'));
if ((await sha(path.join(dependencies, 'package-lock.json'))) !== lockHash)
  throw new Error('目标依赖锁文件与源码不一致，请重新准备');
const binaries = windows
  ? ['node/node.exe', 'vscode/Code.exe', 'pwsh/pwsh.exe']
  : ['node.tar.gz', 'vscode.tar.gz'];
const aliases = { 'node/node.exe': 'node', 'vscode/Code.exe': 'vscode', 'pwsh/pwsh.exe': 'pwsh' };
for (const file of binaries) {
  const expected = descriptor.hashes?.[file] ?? descriptor.hashes?.[aliases[file]];
  if (!expected || (await sha(path.join(resources, file))) !== expected)
    throw new Error('工具链摘要不匹配：' + file);
}
const nativeFiles = windows
  ? ['@esbuild/win32-x64/esbuild.exe', '@rollup/rollup-win32-x64-msvc/rollup.win32-x64-msvc.node']
  : [
      '@esbuild/linux-arm64/bin/esbuild',
      '@rollup/rollup-linux-arm64-gnu/rollup.linux-arm64-gnu.node',
    ];
for (const file of nativeFiles) {
  const bytes = await fs.readFile(path.join(dependencies, 'node_modules', file));
  const correct = windows
    ? bytes.toString('ascii', 0, 2) === 'MZ' &&
      bytes.readUInt16LE(bytes.readUInt32LE(60) + 4) === 0x8664
    : bytes.toString('ascii', 1, 4) === 'ELF' && bytes[4] === 2 && bytes.readUInt16LE(18) === 183;
  if (!correct) throw new Error('目标原生依赖架构不正确：' + file);
}
const extensionNames = (await fs.readdir(path.join(resources, 'extensions'))).filter((name) =>
  /^(vue\.volar-|esbenp\.prettier-vscode-)/.test(name),
);
if (extensionNames.length !== 2) throw new Error('须提供 Vue 官方与 Prettier 扩展');
for (const name of extensionNames) {
  const extension = JSON.parse(
    await fs.readFile(path.join(resources, 'extensions', name, 'package.json'), 'utf8'),
  );
  if (extension.extensionDependencies?.length) throw new Error('请先补齐扩展依赖：' + name);
  if (
    !windows &&
    ![undefined, 'undefined', 'universal'].includes(extension.__metadata?.targetPlatform)
  )
    throw new Error('ARM 包需要通用扩展：' + name);
}
const runGit = (...args) => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('读取源码清单失败：' + result.stderr);
  return result.stdout;
};
const files = [
  ...new Set(
    runGit('ls-files', '--cached', '--others', '--exclude-standard', '-z')
      .split('\0')
      .filter(Boolean),
  ),
].filter(
  (name) =>
    !name.split('/').some((part) => part.startsWith('.env') || part === '.idea') &&
    !name.endsWith('.log'),
);
const source = path.join(destination, 'liteCodeTool');
await fs.mkdir(source, { recursive: true });
const sourceHashes = {};
for (const name of files) {
  const file = path.join(root, name);
  try {
    await fs.access(file);
  } catch {
    continue;
  }
  await fs.mkdir(path.dirname(path.join(source, name)), { recursive: true });
  await fs.copyFile(file, path.join(source, name));
  sourceHashes[name] = await sha(file);
}
await fs.cp(path.join(dependencies, 'node_modules'), path.join(source, 'node_modules'), {
  recursive: true,
});
const toolchain = path.join(destination, 'toolchain');
await fs.mkdir(toolchain, { recursive: true });
for (const name of windows
  ? ['node', 'vscode', 'pwsh', 'vsix']
  : ['node.tar.gz', 'vscode.tar.gz', 'vsix'])
  await fs.cp(path.join(resources, name), path.join(toolchain, name), {
    recursive: true,
    filter: (file) => !/^unins\d/.test(path.basename(file)),
  });
for (const name of extensionNames)
  await fs.cp(path.join(resources, 'extensions', name), path.join(toolchain, 'extensions', name), {
    recursive: true,
  });
await fs.cp(
  path.join(dependencies, 'npm-cache/_cacache'),
  path.join(toolchain, 'npm-cache/_cacache'),
  { recursive: true },
);
await fs.copyFile(path.join(resources, 'resources.json'), path.join(toolchain, 'resources.json'));
if (windows) {
  await fs.writeFile(
    path.join(destination, 'dev.cmd'),
    '@echo off\r\n"%~dp0toolchain\\node\\node.exe" "%~dp0liteCodeTool\\tools\\offline-command.mjs" %*\r\n',
  );
  await fs.writeFile(
    path.join(destination, '打开开发环境.cmd'),
    '@echo off\r\n"%~dp0toolchain\\node\\node.exe" "%~dp0liteCodeTool\\tools\\dev-environment.mjs" %*\r\n',
  );
} else {
  await fs.writeFile(
    path.join(toolchain, 'archives.sha256'),
    binaries.map((name) => `${descriptor.hashes[name]}  ${name}`).join('\n') + '\n',
  );
  await fs.copyFile(path.join(root, 'tools/offline-setup.sh'), path.join(destination, 'setup.sh'));
  for (const [file, entry] of [
    ['dev.sh', 'offline-command.mjs'],
    ['打开开发环境.sh', 'dev-environment.mjs'],
  ])
    await fs.writeFile(
      path.join(destination, file),
      `#!/usr/bin/env bash\nset -e\nROOT="$(cd -- "$(dirname -- "$0")" && pwd)"\nbash "$ROOT/setup.sh"\nexec "$ROOT/toolchain/node/bin/node" "$ROOT/liteCodeTool/tools/${entry}" "$@"\n`,
      { mode: 0o755 },
    );
}
await fs.writeFile(
  path.join(destination, 'README.md'),
  '# LiteCodeTool 离线开发包\n\n平台：' +
    target +
    '。\n\n使用入口、环境边界和验收命令见 [离线开发包使用说明](liteCodeTool/docs/prototypes/离线开发包使用说明.md)。Java 对接从 [后端接口契约](liteCodeTool/docs/prototypes/后端接口契约.md) 开始，全部数据见 [数据格式与配置手册](liteCodeTool/docs/prototypes/数据格式与配置手册.md) 和 [字段表](liteCodeTool/docs/prototypes/数据结构字段表.md)。\n\n包含当前前后端源码、全部锁定依赖、Node/npm、VS Code、Vue/Prettier 扩展及依赖恢复缓存；Windows 另含 PowerShell 7。Java 仅提供协议说明，不含 JDK/Maven。\n',
);
await fs.writeFile(
  path.join(destination, 'manifest.json'),
  JSON.stringify(
    {
      platform: target,
      createdAt: new Date().toISOString(),
      source: {
        commit: runGit('rev-parse', 'HEAD').trim(),
        uncommittedChanges: !!runGit('status', '--porcelain').trim(),
        lockHash,
        files: sourceHashes,
      },
      resources: descriptor,
      nativeFiles,
    },
    null,
    2,
  ),
);
console.log('已装配离线开发目录：' + destination);
