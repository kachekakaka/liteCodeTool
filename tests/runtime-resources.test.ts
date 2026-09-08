import test from 'node:test';
import assert from 'node:assert/strict';
import { checksumFor, assertBinaryTarget } from '../tools/runtime-resources.mjs';

test('官方摘要清单按完整平台路径匹配，兼容 CRLF', () => {
  const hash = 'AB'.repeat(32);
  assert.equal(
    checksumFor(
      `${hash}  win-x64/node.exe\r\n${'cd'.repeat(32)}  win-arm64/node.exe\r\n`,
      'win-x64/node.exe',
    ),
    hash.toLowerCase(),
  );
  assert.throws(() => checksumFor(`${hash}  win-x64/node.exe`, 'node.exe'));
  assert.throws(() => checksumFor('1234  win-x64/node.exe', 'win-x64/node.exe'));
  assert.throws(() => checksumFor(`${hash}  node.exe\n${hash}  node.exe`, 'node.exe'));
});

test('Linux 包只接受 64 位小端 ARM ELF，拒绝 x64 和截断文件', () => {
  const header = Buffer.alloc(64);
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
  header.writeUInt16LE(183, 18);
  assert.doesNotThrow(() => assertBinaryTarget(header, 'linux-arm64'));
  assert.throws(() => assertBinaryTarget(header, 'win32-x64'));
  header.writeUInt16LE(62, 18);
  assert.throws(() => assertBinaryTarget(header, 'linux-arm64'));
  assert.throws(() => assertBinaryTarget(Buffer.alloc(0), 'linux-arm64'));
});

test('Windows 包验证 PE 标头和 x64 架构，不因越界标头崩溃', () => {
  const header = Buffer.alloc(128);
  header.write('MZ');
  header.writeUInt32LE(64, 60);
  header.write('PE\0\0', 64);
  header.writeUInt16LE(0x8664, 68);
  assert.doesNotThrow(() => assertBinaryTarget(header, 'win32-x64'));
  header.writeUInt16LE(0xaa64, 68);
  assert.throws(() => assertBinaryTarget(header, 'win32-x64'));
  header.writeUInt32LE(0xffffffff, 60);
  assert.throws(() => assertBinaryTarget(header, 'win32-x64'), /目标平台不符/);
});
