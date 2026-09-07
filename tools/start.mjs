import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
process.env.CLIENT_DIR = path.resolve(root, '../liteCodeTool_tmp/release/app/web');
process.env.DATA_DIR ||= path.resolve(root, '../liteCodeTool_datas');
await import(
  pathToFileURL(path.resolve(root, '../liteCodeTool_tmp/release/app/server/index.mjs')).href
);
