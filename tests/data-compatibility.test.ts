import test from 'node:test';
import assert from 'node:assert/strict';
import { schemas, templates, demoEnvelopes, defaultScreen } from '../server/defaults.mjs';
import { validateEnvelope } from '../server/ingestion.mjs';
import { planUpgrade, convertMeasure } from '../server/data-upgrade.mjs';
import {
  clone,
  EntityStore,
  resolveEntityEntry,
  extractUniqueTargets,
  normalizeScreen,
  normalizeTemplate,
  effectiveSource,
} from '../src/engine/core.ts';

/** 创建旧版仅有船舶和统计模式的数据目录内容，不进行文件写入。 */
function legacyFiles() {
  return {
    'schemas/default.json': clone(schemas.filter((s) => ['vessel', 'port_stats'].includes(s.type))),
    'entities/snapshot.json': demoEnvelopes().filter((e) =>
      ['vessel', 'port_stats'].includes(e.type),
    ),
    ...Object.fromEntries(
      templates
        .filter((t) => t.id !== 'atom_stream')
        .map((t) => [`templates/${t.id}.json`, clone(t)]),
    ),
    'screens/screen_main.json': defaultScreen(true),
  };
}

test('旧目录补模式且幂等，真实模式不注入演示记录', () => {
  const input = legacyFiles();
  const before = JSON.stringify(input);
  const next = planUpgrade(input, schemas, templates, demoEnvelopes(), true);
  assert.equal(JSON.stringify(input), before);
  assert.equal(
    next['schemas/default.json']
      .find((s) => s.type === 'projectile')
      .fields.find((f) => f.key === 'altitude').unit,
    'km',
  );
  assert.equal(next['entities/snapshot.json'].filter((e) => e.type === 'projectile').length, 96);
  assert.deepEqual(planUpgrade(next, schemas, templates, demoEnvelopes(), true), next);
  const live = planUpgrade(input, schemas, templates, demoEnvelopes(), false);
  assert.equal(live['entities/snapshot.json'].filter((e) => e.type === 'projectile').length, 0);
});

test('首次启动的资源也在同一升级计划中生成，真实目录不生成演示数据', () => {
  const next = planUpgrade({}, schemas, templates, demoEnvelopes(), true, defaultScreen(true));
  assert.ok(next['screens/screen_main.json']);
  assert.equal(next['entities/snapshot.json'].filter((e) => e.type === 'projectile').length, 96);
  assert.ok(next['entities/snapshot.json'].some((e) => e.type === 'vessel'));
  assert.deepEqual(
    planUpgrade({}, schemas, templates, demoEnvelopes(), false, defaultScreen(false))[
      'entities/snapshot.json'
    ],
    [],
  );
});

test('可识别旧表格仅补缺失默认规则，保留明确清空与自定义模板', () => {
  const files = legacyFiles();
  const table = files['templates/tpl_table.json'];
  delete table.controls[0].props.tableColumnRules;
  const next = planUpgrade(files, schemas, templates, [], false);
  assert.ok(next['templates/tpl_table.json'].controls[0].props.tableColumnRules.length);
  table.controls[0].props.tableColumnRules = [];
  assert.deepEqual(
    planUpgrade(files, schemas, templates, [], false)['templates/tpl_table.json'].controls[0].props
      .tableColumnRules,
    [],
  );
  delete table.controls[0].props.tableColumnRules;
  table.name = '用户定制';
  assert.equal(
    planUpgrade(files, schemas, templates, [], false)['templates/tpl_table.json'].controls[0].props
      .tableColumnRules,
    undefined,
  );
});

test('96 条飞行示例通过真实接入校验，目标排重及来源隔离', () => {
  const store = new EntityStore();
  for (const e of demoEnvelopes().filter((e) => e.type === 'projectile'))
    store.apply(validateEnvelope(e, schemas, store));
  assert.equal(extractUniqueTargets(store, 'projectile').length, 12);
  assert.equal(resolveEntityEntry(store, 'projectile', 'P-101', '雷达2')?.id, 'P-101_src2');
  assert.equal(resolveEntityEntry(store, 'projectile', 'P-101', '缺失来源'), undefined);
  assert.notEqual(
    resolveEntityEntry(store, 'projectile', 'P-101', '雷达1')?.record,
    resolveEntityEntry(store, 'projectile', 'P-101', '雷达2')?.record,
  );
});

test('所有演示包通过共同校验，全局消息不携带实体标识', () => {
  const store = new EntityStore();
  for (const envelope of demoEnvelopes()) store.apply(validateEnvelope(envelope, schemas, store));
  assert.ok(resolveEntityEntry(store, 'event_log', '_global'));
  assert.ok(resolveEntityEntry(store, 'port_stats', '_global'));
});

test('无主记录时稳定选单一来源，不用 ID 前缀猜测目标', () => {
  const store = new EntityStore();
  const now = Date.now();
  for (const [id, target, source] of [
    ['z_record', 'P-1', '雷达2'],
    ['a_record', 'P-1', '雷达1'],
    ['P-1_suffix', 'P-10', '遥测1'],
  ])
    store.apply(
      validateEnvelope(
        { type: 'projectile', id, timestamp: now, data: { batch_no: target, source, altitude: 1 } },
        schemas,
        store,
      ),
    );
  assert.equal(resolveEntityEntry(store, 'projectile', 'P-1')?.id, 'a_record');
  assert.equal(resolveEntityEntry(store, 'projectile', 'P-1', '遥测1'), undefined);
  assert.equal(
    resolveEntityEntry(store, 'projectile', 'P-1_suffix', '遥测1')?.record.data.batch_no,
    'P-10',
  );
});

test('身份不随部分字段增量改变，同目标来源不允许重复记录', () => {
  const store = new EntityStore();
  const e = demoEnvelopes().find((e) => e.type === 'projectile');
  store.apply(validateEnvelope(e, schemas, store));
  assert.doesNotThrow(() => validateEnvelope({ ...e, data: { altitude: 2 } }, schemas, store));
  assert.throws(
    () => validateEnvelope({ ...e, data: { source: '遥测1' } }, schemas, store),
    /不能更换/,
  );
  assert.throws(() => validateEnvelope({ ...e, id: 'duplicate' }, schemas, store), /其他记录/);
  assert.throws(
    () => validateEnvelope({ ...e, data: { batch_no: null } }, schemas, store),
    /不能清空/,
  );
  assert.equal(
    validateEnvelope(
      { type: 'projectile', id: 'legacy', timestamp: Date.now(), data: { altitude: 5 } },
      schemas,
      new EntityStore(),
    ).data.batch_no,
    'legacy',
  );
});

test('旧米制快照与持续输入同时转换，按来源新单位覆盖不重复转换', () => {
  const files = legacyFiles();
  const projectile = clone(schemas.find((s) => s.type === 'projectile'));
  delete projectile.targetIdField;
  delete projectile.sourceField;
  projectile.idField = 'batch_no';
  projectile.fields.find((f) => f.key === 'altitude').unit = 'm';
  projectile.fields.find((f) => f.key === 'speed').unit = 'm/s';
  files['schemas/default.json'].push(projectile);
  files['entities/snapshot.json'].push({
    type: 'projectile',
    id: 'P-101',
    timestamp: 1,
    fieldTimestamps: { altitude: 1 },
    data: { batch_no: 'P-101', source: '雷达1', altitude: 1000, speed: 10 },
  });
  const next = planUpgrade(files, schemas, templates, [], false);
  const sample = next['entities/snapshot.json'].find((e) => e.type === 'projectile');
  assert.equal(sample.data.altitude, 1);
  assert.equal(sample.data.speed, 36);
  assert.equal(sample.fieldTimestamps.altitude, 1);
  const store = new EntityStore();
  store.apply(sample, true);
  const incoming = {
    type: 'projectile',
    id: 'P-101',
    timestamp: Date.now(),
    data: { altitude: 2000, speed: 20 },
  };
  const converted = validateEnvelope(
    incoming,
    next['schemas/default.json'],
    store,
    next['ingestion-units.json'],
  );
  assert.equal(converted.data.altitude, 2);
  assert.equal(converted.data.speed, 72);
  const units = {
    ...next['ingestion-units.json'],
    sources: { 雷达1: { altitude: 'km', speed: 'km/h' } },
  };
  assert.equal(
    validateEnvelope(
      { ...incoming, data: { altitude: 2 } },
      next['schemas/default.json'],
      store,
      units,
    ).data.altitude,
    2,
  );
  assert.deepEqual(planUpgrade(next, schemas, templates, [], false), next);
});

test('阈值换算与冲突不修改原输入', () => {
  assert.equal(convertMeasure('>=1000', 0.001), '>=1');
  assert.equal(convertMeasure('10..20', 3.6), '36..72');
  assert.throws(() => convertMeasure('按公式计算', 3.6), /无法安全/);
  const files = legacyFiles();
  const p = clone(schemas.find((s) => s.type === 'projectile'));
  p.fields.find((f) => f.key === 'altitude').unit = 'ft';
  files['schemas/default.json'].push(p);
  const before = JSON.stringify(files);
  assert.throws(() => planUpgrade(files, schemas, templates, [], false), /不兼容/);
  assert.equal(JSON.stringify(files), before);
});

test('旧空来源跟随曲线，新空来源显式自动且保存重开幂等', () => {
  const screen = defaultScreen(true);
  const instance = screen.components[0];
  instance.slotSourceBindings = { slot_1: '' };
  const normalized = normalizeScreen(screen);
  assert.equal(effectiveSource(normalized.components[0], 'slot_1', '雷达2'), '雷达2');
  normalized.components[0].slotSourceBindings.slot_1 = '';
  const reopened = normalizeScreen(JSON.parse(JSON.stringify(normalized)));
  assert.equal(effectiveSource(reopened.components[0], 'slot_1', '雷达2'), '');
  assert.equal(reopened.bindingVersion, 2);
});

test('旧后缀绑定保留真实来源，预览字段不再出现在持久化输出', () => {
  const template = clone(templates.find((t) => t.id === 'atom_line'));
  template.slots[0].schemaType = 'projectile';
  template.controls[0].props.workshopPreviewTarget = 'P-101';
  const store = new EntityStore();
  demoEnvelopes()
    .filter((e) => e.type === 'projectile')
    .forEach((e) => store.apply(e, true));
  const screen = {
    id: 's',
    name: '测试',
    resolution: { width: 1920, height: 1080 },
    background: '#000000',
    components: [
      {
        instanceId: 'i',
        templateId: template.id,
        position: { x: 0, y: 0, w: 560, h: 260 },
        slotBindings: { slot_1: 'P-101_src2' },
        controlOverrides: { content: { props: { workshopPreviewTarget: 'P-102', precision: 3 } } },
      },
    ],
  };
  const result = normalizeScreen(screen, [template], store, schemas);
  assert.equal(result.components[0].slotBindings.slot_1, 'P-101');
  assert.equal(result.components[0].slotSourceBindings.slot_1, '雷达2');
  assert.equal(
    result.components[0].controlOverrides.content.props.workshopPreviewTarget,
    undefined,
  );
  assert.equal(result.components[0].controlOverrides.content.props.precision, 3);
  assert.equal(normalizeTemplate(template).controls[0].props.workshopPreviewTarget, undefined);
  assert.equal(template.controls[0].props.workshopPreviewTarget, 'P-101');
});
