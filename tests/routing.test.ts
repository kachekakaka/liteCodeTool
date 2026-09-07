import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyTarget, validResourceId, replacesDraft } from '../src/router/legacy.ts';

test('旧显示态地址保留显式资源身份', () => {
  assert.equal(legacyTarget('/', '#viewer', 'screen_1'), '/screens/screen_1/view');
  assert.equal(legacyTarget('/', '', 'screen_2'), '/screens/screen_2/edit');
  assert.equal(legacyTarget('/', '#viewer', undefined), '/viewer');
});
test('标准路径不被旧参数改写，未知旧入口明确失败', () => {
  assert.equal(legacyTarget('/screens/a/edit', '#viewer', 'b'), null);
  assert.equal(legacyTarget('/', '#oops', undefined), '/invalid-entry');
  assert.equal(legacyTarget('/', '#workshop', undefined), '/workshop');
});
test('资源身份拒绝路径穿越与保留键', () => {
  for (const id of ['../a', 'a/b', '__proto__', 'constructor', ''])
    assert.equal(validResourceId(id), false);
  assert.equal(validResourceId('screen_main'), true);
});
test('只替换不同资源，同一资源切换模式不替换草稿', () => {
  assert.equal(replacesDraft('screen_1', 'screen_1'), false);
  assert.equal(replacesDraft(undefined, 'screen_1'), false);
  assert.equal(replacesDraft('screen_1', 'screen_2'), true);
});
