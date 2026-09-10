/** 重新构建应用，以本地已校验资源装配 Windows x64 与 Linux ARM64 免安装包。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { c as archive } from 'tar';
import { templates as builtinTemplates } from '../server/defaults.mjs';
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
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
const changes = spawnSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
if (revision.status !== 0 || changes.status !== 0) throw new Error('无法读取打包来源版本');
// 测试配置只由内置模板生成，不读取或携带运行时用户数据。
const fixtureTemplates = ['atom_number', 'atom_line'].map((id) =>
  structuredClone(builtinTemplates.find((item) => item.id === id)),
);
for (const template of fixtureTemplates) {
  template.id = 'iframe_test_' + template.id;
  template.showHeader = true;
  template.slots[0].schemaType = 'projectile';
}
fixtureTemplates[0].name = '飞行高度';
fixtureTemplates[0].controls[0].binding = { target: 'slot', slotId: 'slot_1', field: 'altitude' };
fixtureTemplates[0].controls[0].props = { sourceMode: 'dynamic' };
fixtureTemplates[1].name = '高度曲线';
fixtureTemplates[1].controls[0].props.series[0].field = 'altitude';
const fixture = {
  format: 'litecode.screen.v1',
  screen: {
    id: 'iframe_test_screen',
    name: '局域网测试 A',
    bindingVersion: 2,
    resolution: { width: 1920, height: 1080 },
    background: '#030B17',
    components: fixtureTemplates.map((template, index) => ({
      instanceId: `iframe_test_${index}`,
      templateId: template.id,
      title: template.name,
      position:
        index === 0
          ? { x: 50, y: 50, w: 640, h: 300, zIndex: 1 }
          : { x: 50, y: 400, w: 1200, h: 500, zIndex: 1 },
      slotBindings: { slot_1: 'P-101' },
      slotSourceBindings: { slot_1: '雷达1' },
      controlOverrides: {},
    })),
  },
  templates: fixtureTemplates,
};
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
  await fs.copyFile(
    path.join(root, 'tools/iframe-smoke.mjs'),
    path.join(folder, 'iframe-test.mjs'),
  );
  await fs.writeFile(
    path.join(folder, 'iframe-flight.litecode.json'),
    JSON.stringify(fixture, null, 2),
  );
  if (target.id === 'win32-x64') {
    await fs.writeFile(
      path.join(folder, 'start.cmd'),
      '@echo off\r\nsetlocal\r\n"%~dp0runtime\\node.exe" "%~dp0launcher.mjs" %*\r\nset "run_exit=%errorlevel%"\r\nif not "%run_exit%"=="0" pause\r\nexit /b %run_exit%\r\n',
    );
    await fs.writeFile(
      path.join(folder, 'iframe-test.cmd'),
      '@echo off\r\nsetlocal\r\n"%~dp0runtime\\node.exe" "%~dp0iframe-test.mjs" %*\r\nset "run_exit=%errorlevel%"\r\nif not "%run_exit%"=="0" pause\r\nexit /b %run_exit%\r\n',
    );
  } else {
    await fs.writeFile(
      path.join(folder, 'start.sh'),
      '#!/bin/sh\n# 固定使用包内 Node，不依赖系统 PATH 中的版本。\nset -eu\napp_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$app_dir/runtime/node" "$app_dir/launcher.mjs" "$@"\n',
      { mode: 0o755 },
    );
    await fs.chmod(path.join(folder, 'runtime/node'), 0o755);
    await fs.writeFile(
      path.join(folder, 'iframe-test.sh'),
      '#!/bin/sh\nset -eu\napp_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$app_dir/runtime/node" "$app_dir/iframe-test.mjs" "$@"\n',
      { mode: 0o755 },
    );
  }
  const manifest = {
    applicationVersion: app.version,
    target: target.id,
    nodeVersion,
    builtAt: new Date().toISOString(),
    source: { commit: revision.stdout.trim(), uncommittedChanges: !!changes.stdout.trim() },
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
      '默认支持局域网访问；从启动窗口列出的局域网地址进入 /screens 管理多个大屏。',
      '真实数据接入仍使用现有凭据配置。退出时按 Ctrl+C。',
      '',
      '【局域网与 iframe 测试】',
      '1. 完整解压到正式测试位置（不要把程序目录命名为 liteCodeTool_tmp），启动 start.cmd 或 sh ./start.sh。',
      '2. 默认演示端口 8787，另一台电脑打开 http://服务机局域网IP:8787/screens。浏览器使用本机IP或localhost不能访问别人的服务。',
      '3. 编辑任一大屏，在工具栏点“导入”，选择包内 iframe-flight.litecode.json，生成带演示高度及曲线的测试大屏 A。',
      '4. 返回“大屏管理”，复制 A 为 B；分别记录列表中的大屏 ID。重命名不改变已有 URL。',
      '5. 在本包目录的终端运行以下命令，将服务机IP、大屏A的ID、大屏B的ID替换为实际值：',
      target.id === 'win32-x64'
        ? '   .\\iframe-test.cmd --base http://服务机IP:8787 --a 大屏A的ID --b 大屏B的ID --port 8899'
        : '   sh ./iframe-test.sh --base http://服务机IP:8787 --a 大屏A的ID --b 大屏B的ID --port 8899',
      '6. 在另一台电脑打开 http://服务机IP:8899；确认 A、B 和 A 对照都有真实内容及持续更新的高度曲线，无效ID明确报错。',
      '7. 只在 A 切换目标、雷达1/雷达2：数值随来源改变，B与A对照保持原指派；刷新A恢复默认配置。',
      '8. 管理页“地址与嵌入”可以复制 iframe 代码，放入实际集成系统验证。父容器须有明确高度；HTTPS页面应使用可加载的HTTPS大屏入口。',
      '9. 请反馈：测试机系统、访问地址、是否可新建/复制/删除、iframe是否加载、实时是否更新、来源切换结果及失败截图。',
      '如果另一台电脑无法访问，请检查网络连通与服务机对应端口；本包不会自动修改系统防火墙。',
      '程序运行无需外网或 npm 安装；用户自行配置的远程图片仍取决于其地址是否可访问。',
      '退出两个启动窗口后服务停止；用户数据始终保存在包目录之外，升级时保留数据目录。',
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
            entry.path.endsWith('/iframe-test.sh') ||
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
