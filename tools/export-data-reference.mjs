/** 从类型注释和内置模式生成字段参考，避免手工维护第二套字段清单。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { schemas, templates, defaultScreen } from '../server/defaults.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = path.join(root, 'docs/prototypes');
const source = ts.createSourceFile(
  'types.ts',
  await fs.readFile(path.join(root, 'src/types.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const clean = (text) =>
  String(text ?? '')
    .replaceAll('|', '\\|')
    .replace(/\s+/g, ' ')
    .trim();
const comment = (node) => clean(node.jsDoc?.map((doc) => doc.comment).join(' '));
let output =
  '# 数据结构字段表\n\n此文件由 `node tools/export-data-reference.mjs` 根据 [src/types.ts](../../src/types.ts) 和 [内置模式](../../server/defaults.mjs) 生成；修改字段或注释后重新生成，不直接编辑本表。必填列表示 TypeScript 结构要求，HTTP 接入校验、默认值与业务规则见 [数据格式与配置手册](数据格式与配置手册.md)。接口包装结构见 [后端接口契约](后端接口契约.md)。\n\n';
for (const node of source.statements) {
  if (!ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node)) continue;
  output += `## ${node.name.text}\n\n${comment(node)}\n\n`;
  if (ts.isTypeAliasDeclaration(node)) {
    output += '```typescript\n' + node.getText(source).replace(/^export /, '') + '\n```\n\n';
    continue;
  }
  output += '| 字段 | 必填 | 类型 | 说明 |\n| --- | --- | --- | --- |\n';
  for (const member of node.members) {
    const printer = ts.createPrinter({ removeComments: true });
    const type = clean(printer.printNode(ts.EmitHint.Unspecified, member.type, source));
    output += `| ${member.name.getText(source)} | ${member.questionToken ? '否' : '是'} | \`${type}\` | ${comment(member)} |\n`;
  }
  output += '\n';
}
output +=
  '## 内置业务模式完整字段\n\n以下是新数据目录的内置定义；实际部署以 GET /api/schemas 返回值为准。enum 的 options 是界面选项，当前接入校验不强制枚举值属于该列表。业务增量中的字段可以缺失，null 与身份字段的例外见配置手册。\n\n';
for (const schema of schemas) {
  output += `### ${schema.type}：${schema.name}\n\n\`isEntity=${schema.isEntity}\`，\`idField=${schema.idField ?? '无'}\`，\`targetIdField=${schema.targetIdField ?? '无'}\`，\`sourceField=${schema.sourceField ?? '无'}\`。\n\n| 字段 | 中文名称 | 类型 | 单位 | 默认精度 | 枚举选项 |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const field of schema.fields)
    output += `| ${field.key} | ${field.name} | ${field.type} | ${field.unit ?? '无'} | ${field.precision ?? '无'} | ${field.options?.join('、') ?? '无'} |\n`;
  output += '\n';
}
await fs.writeFile(path.join(directory, '数据结构字段表.md'), output.trimEnd() + '\n');
const examples = path.join(directory, 'examples');
await fs.mkdir(examples, { recursive: true });
const write = (name, value) =>
  fs.writeFile(path.join(examples, name), JSON.stringify(value, null, 2) + '\n');
await write('schemas.json', schemas);
const screen = { ...defaultScreen(true), bindingVersion: 2 };
await write('builtin-screen.litecode.json', { format: 'litecode.screen.v1', screen, templates });
console.log('已生成完整类型字段表、内置模式和可导入大屏样例');
