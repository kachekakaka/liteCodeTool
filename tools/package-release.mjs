/** 重新构建应用，以本地已校验资源装配 Windows x64 与 Linux ARM64 免安装包。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { c as archive } from 'tar';
import {
  root,
  temporary,
  nodeVersion,
  resourceDir,
  targets,
  verifyResources,
  sha256,
} from './runtime-resources.mjs';

const resources = await verifyResources().catch((error) => {
  throw new Error(`运行资源未准备好，请先执行 npm run prepare:runtime。${error.message}`);
});
const build = spawnSync(process.execPath, [path.join(root, 'tools/build.mjs')], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (build.status !== 0) throw new Error('构建失败，未装配运行包');
const app = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const release = path.join(temporary, 'release');
const output = path.join(temporary, 'packages');
await fs.mkdir(output, { recursive: true });
for (const target of targets) {
  const name = `liteCodeTool-${app.version}-${target.id}`;
  const folder = path.join(output, name);
  // 只替换本脚本拥有的目标目录，用户数据位于该目录之外。
  if (path.dirname(folder) !== output || !name.startsWith('liteCodeTool-'))
    throw new Error('运行包输出目录越界');
  await fs.rm(folder, { recursive: true, force: true });
  await fs.mkdir(folder, { recursive: true });
  for (const entry of ['app', 'launcher.mjs', 'THIRD_PARTY_NOTICES.md', 'licenses'])
    await fs.cp(path.join(release, entry), path.join(folder, entry), { recursive: true });
  await fs.cp(path.join(resourceDir, target.id), path.join(folder, 'runtime'), { recursive: true });
  if (target.id === 'win32-x64') {
    await fs.writeFile(
      path.join(folder, 'start.cmd'),
      '@echo off\r\nsetlocal\r\n"%~dp0runtime\\node.exe" "%~dp0launcher.mjs" %*\r\nset "run_exit=%errorlevel%"\r\nif not "%run_exit%"=="0" pause\r\nexit /b %run_exit%\r\n',
    );
  } else {
    await fs.writeFile(
      path.join(folder, 'start.sh'),
      '#!/bin/sh\n# 固定使用包内 Node，不依赖系统 PATH 中的版本。\nset -eu\napp_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$app_dir/runtime/node" "$app_dir/launcher.mjs" "$@"\n',
      { mode: 0o755 },
    );
    await fs.chmod(path.join(folder, 'runtime/node'), 0o755);
  }
  const manifest = {
    applicationVersion: app.version,
    target: target.id,
    nodeVersion,
    builtAt: new Date().toISOString(),
    build: JSON.parse(await fs.readFile(path.join(folder, 'app/build-info.json'), 'utf8')),
    runtime: resources.targets[target.id],
  };
  await fs.writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(
    path.join(folder, 'README.txt'),
    [
      `LiteCodeTool ${app.version} · ${target.id} · 内置 Node.js ${nodeVersion}`,
      '完整解压后使用 start.cmd（Windows）或 sh ./start.sh（Linux）启动演示。',
      '附加 --live 启动真实模式，附加 --no-open 禁止自动打开浏览器。',
      '无需安装 Node、npm 或开发工具，不修改系统 PATH。',
      '默认数据存放在本目录同级的 liteCodeTool_datas，可使用 DATA_DIR 指定其他目录。',
      'Windows 需兼容 Node 22 的 x64 系统；Linux 需 ARM64、内核 >=4.18、glibc >=2.28。',
      '麒麟系统须核对实际系统版本；未将打包成功等同于目标设备已通过验证。',
      '当前服务默认仅本机访问；局域网访问改造另有待实施方案。',
      '真实数据接入仍使用现有凭据配置。退出时按 Ctrl+C。',
      '',
    ].join('\n'),
  );
  const file = path.join(output, name + '.tar.gz');
  await archive(
    {
      file,
      cwd: output,
      gzip: true,
      portable: true,
      /**
       * 写入归档时恢复跨平台文件权限，避免 Windows 丢失 Linux 可执行位。
       * @param entry - 即将写入的文件或目录条目。
       * @returns 无返回值；直接设置归档元数据，不修改源文件权限。
       */
      onWriteEntry(entry) {
        if (entry.stat)
          entry.stat.mode =
            entry.type === 'Directory' ||
            entry.path.endsWith('/start.sh') ||
            entry.path.endsWith('/runtime/node')
              ? 0o755
              : 0o644;
      },
    },
    [name],
  );
  await fs.writeFile(file + '.sha256', `${await sha256(file)}  ${path.basename(file)}\n`);
  console.log(`已生成：${file}`);
}
