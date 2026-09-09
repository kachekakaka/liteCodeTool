import test from 'node:test';
import assert from 'node:assert/strict';
import { copyScreenConfiguration } from '../src/utils/screens.ts';
import type { ScreenConfig } from '../src/types.ts';

test('复制大屏替换身份，保留模板引用及三种来源含义，不共享可变配置', () => {
  const source: ScreenConfig = {
    id: 'screen_main',
    name: '原始',
    resolution: { width: 1920, height: 1080 },
    background: '#000000',
    bindingVersion: 2,
    components: ['inherit', 'auto', 'named'].map((id, index) => ({
      instanceId: id,
      templateId: 'shared_template',
      position: { x: 0, y: 0, w: 300, h: 200 },
      slotBindings: { target: 'P-101' },
      controlOverrides: {},
      ...(index ? { slotSourceBindings: { target: index === 1 ? '' : '雷达2' } } : {}),
    })),
  };
  let id = 0;
  const copy = copyScreenConfiguration(source, ' 副本 ', () => `generated_${++id}`);
  assert.equal(copy.name, '副本');
  assert.equal(new Set([copy.id, ...copy.components.map((row) => row.instanceId)]).size, 4);
  assert.ok(copy.components.every((row) => row.templateId === 'shared_template'));
  assert.equal(copy.components[0].slotSourceBindings, undefined);
  assert.equal(copy.components[1].slotSourceBindings?.target, '');
  assert.equal(copy.components[2].slotSourceBindings?.target, '雷达2');
  copy.components[0].slotBindings.target = 'P-102';
  copy.resolution.width = 1000;
  assert.equal(source.components[0].slotBindings.target, 'P-101');
  assert.equal(source.resolution.width, 1920);
});
