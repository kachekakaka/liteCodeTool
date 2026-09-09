import path from 'node:path';
import { readFile, writeFile, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  clone,
  EntityStore,
  normalizeTemplate,
  normalizeScreen,
  effectiveControl,
  validateTemplate,
  validateScreen,
} from '../src/engine/core.ts';
import { validateEnvelope } from './ingestion.mjs';

/**
 * 换算规则表达式中的明确数值，保留比较符和区间含义。
 * @param value - 数值、比较表达式或区间。
 * @param factor - 正换算比例。
 * @returns 换算后的同类值；无法确定含义时抛错。
 */
export function convertMeasure(value, factor) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value * factor;
  if (typeof value !== 'string') throw new Error('单位升级遇到不可解析的数值配置');
  const numeric = '-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  const simple = value.trim().match(new RegExp(`^(<=?|>=?|)?\\s*(${numeric})$`));
  if (simple) return `${simple[1] ?? ''}${Number(simple[2]) * factor}`;
  const range = value.trim().match(new RegExp(`^(${numeric})\\s*\\.\\.\\s*(${numeric})$`));
  if (range) return `${Number(range[1]) * factor}..${Number(range[2]) * factor}`;
  throw new Error(`单位升级无法安全换算表达式：${value}`);
}

/**
 * 换算控件内明确关联飞行目标的阈值、静态度量与单位覆盖。
 * @param control - 待换算控件。
 * @param template - 槽位所属模板。
 * @param factors - 字段到换算比例。
 * @returns 原地更新控件，无返回值。
 */
function convertControl(control, template, factors) {
  const binding = control.binding;
  const type =
    binding?.target === 'global'
      ? binding.schemaType
      : template.slots.find((s) => s.id === binding?.slotId)?.schemaType;
  const factor = type === 'projectile' ? factors[binding?.field] : undefined;
  if (factor && factor !== 1) {
    if (control.props.staticValue !== undefined)
      control.props.staticValue = convertMeasure(control.props.staticValue, factor);
    for (const rule of control.props.colorRules ?? [])
      rule.value = convertMeasure(rule.value, factor);
    if (control.props.unitMode === 'custom' && control.props.unit) {
      const expected = binding.field === 'altitude' ? 'm' : 'm/s';
      if (control.props.unit !== expected) throw new Error(`控件 ${control.id} 的自定义单位不明确`);
      control.props.unit = binding.field === 'altitude' ? 'km' : 'km/h';
    }
  }
  if (control.type === 'table' && control.props.schemaType === 'projectile') {
    for (const column of control.props.tableColumnRules ?? []) {
      const scale = factors[column.field];
      if (scale && scale !== 1)
        for (const rule of column.rules) rule.value = convertMeasure(rule.value, scale);
    }
    const scale = factors[control.props.filterField];
    if (scale && scale !== 1 && control.props.filterValue !== undefined)
      control.props.filterValue = convertMeasure(control.props.filterValue, scale);
  }
}

/**
 * 计算升级后的文件集合；不进行文件写入，冲突在任何落盘之前抛出。
 * @param files - 数据目录相对文件名与 JSON 内容。
 * @param builtins - 内置模式。
 * @param templates - 内置模板。
 * @param demoRecords - 规范单位演示数据。
 * @param demo - 是否允许补齐演示数据。
 * @param screen - 可选的首次启动默认大屏；已有大屏保持原样。
 * @returns 新文件集合；输入保持不变。
 */
export function planUpgrade(files, builtins, templates, demoRecords, demo, screen) {
  const result = clone(files);
  const schemas = (result['schemas/default.json'] ??= clone(builtins));
  if (screen) result['screens/screen_main.json'] ??= clone(screen);
  if (!Array.isArray(schemas)) throw new Error('模式文件格式无效，升级未写入');
  const oldProjectile = schemas.find((s) => s.type === 'projectile');
  const factors = {};
  const oldUnits = {};
  if (oldProjectile) {
    for (const [key, legacy, canonical, factor] of [
      ['altitude', 'm', 'km', 0.001],
      ['speed', 'm/s', 'km/h', 3.6],
    ]) {
      const field = oldProjectile.fields.find((f) => f.key === key);
      if (!field) continue;
      if (field.type !== 'number' || ![legacy, canonical].includes(field.unit))
        throw new Error(`projectile.${key} 的类型或单位与升级不兼容，保留原文件`);
      oldUnits[key] = field.unit;
      factors[key] = field.unit === legacy ? factor : 1;
      field.unit = canonical;
      if (key === 'altitude' && factors[key] !== 1)
        field.precision = Math.max(2, field.precision ?? 0);
    }
  }
  for (const builtin of builtins.filter((s) => ['projectile', 'event_log'].includes(s.type))) {
    const existing = schemas.find((s) => s.type === builtin.type);
    if (!existing) {
      schemas.push(clone(builtin));
      continue;
    }
    if (existing.isEntity !== builtin.isEntity) throw new Error(`${builtin.type} 的实体类型冲突`);
    for (const field of builtin.fields) {
      const current = existing.fields.find((f) => f.key === field.key);
      if (!current) existing.fields.push(clone(field));
      else {
        if (current.type !== field.type)
          throw new Error(`${builtin.type}.${field.key} 的字段类型冲突`);
        if (field.options)
          current.options = [...new Set([...(current.options ?? []), ...field.options])];
      }
    }
    if (builtin.type === 'projectile') {
      if (existing.idField && existing.idField !== 'batch_no')
        throw new Error('自定义 projectile 记录身份不兼容');
      if (
        (existing.targetIdField && existing.targetIdField !== 'batch_no') ||
        (existing.sourceField && existing.sourceField !== 'source')
      )
        throw new Error('自定义 projectile 目标或来源字段不兼容');
      delete existing.idField;
      existing.targetIdField = 'batch_no';
      existing.sourceField = 'source';
    }
  }
  if (Object.values(factors).some((f) => f !== 1)) {
    // 已有输入配置无法证明与旧元数据一致时停止，而非覆盖用户配置。
    if (result['ingestion-units.json'])
      throw new Error('旧单位模式同时存在自定义接入单位配置，请先核对，升级未写入');
    result['ingestion-units.json'] = {
      default: { altitude: oldUnits.altitude ?? 'km', speed: oldUnits.speed ?? 'km/h' },
      sources: {},
    };
  }
  const oldTemplates = Object.entries(result)
    .filter(([key]) => key.startsWith('templates/'))
    .map(([, value]) => clone(value));
  for (const [key, value] of Object.entries(result))
    if (key.startsWith('templates/')) {
      const template = normalizeTemplate(value);
      const builtin = templates.find((t) => t.id === template.id);
      if (builtin) {
        const candidate = clone(template);
        const reference = normalizeTemplate(builtin);
        for (const model of [candidate, reference])
          for (const control of model.controls) delete control.props.tableColumnRules;
        // 只识别除此字段外完全一致的内置模板；明确空数组和自定义模板均保留。
        if (JSON.stringify(candidate) === JSON.stringify(reference))
          for (const control of template.controls) {
            const defaults = builtin.controls.find((c) => c.id === control.id)?.props
              .tableColumnRules;
            if (
              control.type === 'table' &&
              !Object.hasOwn(control.props, 'tableColumnRules') &&
              defaults
            )
              control.props.tableColumnRules = clone(defaults);
          }
      }
      for (const control of template.controls) convertControl(control, template, factors);
      result[key] = template;
    }
  for (const template of templates)
    result[`templates/${template.id}.json`] ??= normalizeTemplate(template);
  const currentTemplates = Object.entries(result)
    .filter(([key]) => key.startsWith('templates/'))
    .map(([, value]) => value);
  const records = result['entities/snapshot.json'] ?? (demo ? clone(demoRecords) : []);
  if (!Array.isArray(records)) throw new Error('实体快照格式无效');
  for (const record of records)
    if (record.type === 'projectile')
      for (const [key, factor] of Object.entries(factors)) {
        if (typeof record.data[key] === 'number') record.data[key] *= factor;
      }
  const store = new EntityStore();
  for (const record of records) {
    const schema = schemas.find((s) => s.type === record.type);
    if (schema?.targetIdField) {
      const checked = validateEnvelope(record, schemas, store);
      record.data = checked.data;
    }
    store.apply(record, true);
  }
  if (demo)
    for (const record of demoRecords.filter((e) => ['projectile', 'event_log'].includes(e.type))) {
      const schema = schemas.find((s) => s.type === record.type);
      const hasTargetSource =
        record.type === 'projectile' &&
        store
          .list(record.type)
          .some(
            (row) =>
              row.record.data.batch_no === record.data.batch_no &&
              row.record.data.source === record.data.source,
          );
      if (hasTargetSource || store.get(record.type, record.id)) continue;
      const checked = validateEnvelope(
        { ...record, id: schema.isEntity ? record.id : undefined },
        schemas,
        store,
      );
      store.apply(checked, true);
      records.push(checked);
    }
  result['entities/snapshot.json'] = records;
  for (const [key, value] of Object.entries(result))
    if (key.startsWith('screens/')) {
      const screen = normalizeScreen(value, currentTemplates, store, schemas);
      for (const instance of screen.components) {
        const old = oldTemplates.find((t) => t.id === instance.templateId);
        if (!old) continue;
        for (const [id, override] of Object.entries(instance.controlOverrides ?? {})) {
          const control = old.controls.find((c) => c.id === id);
          if (!control) continue;
          const effective = effectiveControl(control, instance);
          convertControl(effective, old, factors);
          // 只写回原来私有化的属性，避免把模板默认值固化为覆盖。
          for (const prop of Object.keys(override.props ?? {}))
            if (prop !== 'workshopPreviewTarget') override.props[prop] = effective.props[prop];
        }
      }
      result[key] = screen;
    }
  // 仅校验实际变化的资源，避免无关历史配置阻断本次补缺。
  for (const [key, value] of Object.entries(result)) {
    if (JSON.stringify(value) === JSON.stringify(files[key])) continue;
    if (key.startsWith('templates/')) validateTemplate(value, schemas);
    if (key.startsWith('screens/')) validateScreen(value, currentTemplates, schemas);
  }
  validateInputUnits(result['ingestion-units.json'] ?? {});
  return result;
}

/**
 * 检查接入单位文件的结构与支持的单位，写入升级文件前先排除配置冲突。
 * @param config - 数据目录中的单位配置。
 * @returns 校验通过时无返回值，否则抛出 Error。
 */
function validateInputUnits(config) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(config) || (config.sources !== undefined && !object(config.sources)))
    throw new Error('ingestion-units.json 的结构无效');
  for (const units of [config.default ?? {}, ...Object.values(config.sources ?? {})]) {
    if (
      !object(units) ||
      (units.altitude !== undefined && !['m', 'km'].includes(units.altitude)) ||
      (units.speed !== undefined && !['m/s', 'km/h'].includes(units.speed))
    )
      throw new Error('ingestion-units.json 中存在不支持的单位');
  }
}

/**
 * 原子写入单个 JSON 文件。
 * @param file - 已验证的目标路径。
 * @param text - 文件原文。
 * @returns 写入完成的 Promise。
 */
async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, text, { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await unlink(temp).catch(() => {});
  }
}

/**
 * 在持有数据目录锁时执行一次升级，使用原文日志恢复中断的多文件写入。
 * @param directory - 当前实例的数据目录。
 * @param options - 内置模式、模板、演示记录及演示开关。
 * @returns 当前输入单位配置；升级冲突或读写失败拒绝启动。
 */
export async function upgradeData(directory, options) {
  const root = path.resolve(directory);
  const locate = (key) => {
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error('升级路径超出当前数据目录');
    return file;
  };
  const readOptional = async (file) => {
    try {
      return await readFile(file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  };
  const journalFile = locate('.upgrade-v2/journal.json');
  const previousJournal = await readOptional(journalFile);
  if (previousJournal) {
    const journal = JSON.parse(previousJournal);
    if (journal.status === 'pending') {
      for (const [key, original] of Object.entries(journal.originals)) {
        if (original === null)
          await unlink(locate(key)).catch((e) => {
            if (e.code !== 'ENOENT') throw e;
          });
        else await writeAtomic(locate(key), original);
      }
      journal.status = 'recovered';
      await writeAtomic(journalFile, JSON.stringify(journal, null, 2));
    }
  }
  if (!(await readOptional(locate('.data-upgrade-v2.json')))) {
    const originals = {};
    for (const group of ['schemas', 'templates', 'screens', 'entities']) {
      for (const entry of await readdir(locate(group), { withFileTypes: true }))
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const key = `${group}/${entry.name}`;
          originals[key] = await readFile(locate(key), 'utf8');
        }
    }
    const units = await readOptional(locate('ingestion-units.json'));
    if (units) originals['ingestion-units.json'] = units;
    const files = Object.fromEntries(
      Object.entries(originals).map(([key, text]) => [key, JSON.parse(text)]),
    );
    const result = planUpgrade(
      files,
      options.schemas,
      options.templates,
      options.records,
      options.demo,
      options.screen,
    );
    const changes = Object.entries(result).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(files[key]),
    );
    changes.push(['.data-upgrade-v2.json', { version: 2, completedAt: new Date().toISOString() }]);
    const journal = {
      status: 'pending',
      originals: Object.fromEntries(changes.map(([key]) => [key, originals[key] ?? null])),
    };
    await writeAtomic(journalFile, JSON.stringify(journal, null, 2));
    for (const [key, value] of changes)
      await writeAtomic(locate(key), JSON.stringify(value, null, 2));
    journal.status = 'completed';
    await writeAtomic(journalFile, JSON.stringify(journal, null, 2));
  }
  const inputUnits = JSON.parse((await readOptional(locate('ingestion-units.json'))) ?? '{}');
  validateInputUnits(inputUnits);
  return inputUnits;
}
