import test from 'node:test';
import assert from 'node:assert/strict';

import { compareDesktopVersions, isNewerDesktopVersion } from './version.ts';

test('orders releases by numeric precedence', () => {
  assert.equal(compareDesktopVersions('1.0.7', '1.0.6'), 1);
  assert.equal(compareDesktopVersions('1.0.6', '1.0.7'), -1);
  assert.equal(compareDesktopVersions('1.0.7', '1.0.7'), 0);
  assert.equal(compareDesktopVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareDesktopVersions('2.0.0', '1.99.99'), 1);
});

test('sorts a pre-release below the matching release', () => {
  assert.equal(compareDesktopVersions('1.0.7-beta.1', '1.0.7'), -1);
  assert.equal(compareDesktopVersions('1.0.7', '1.0.7-beta.1'), 1);
  assert.equal(compareDesktopVersions('1.0.7-beta.2', '1.0.7-beta.1'), 1);
});

test('ignores build metadata', () => {
  assert.equal(compareDesktopVersions('1.0.7+build.9', '1.0.7'), 0);
});

test('treats unparseable versions as equal so no update is offered', () => {
  assert.equal(compareDesktopVersions('not-a-version', '1.0.7'), 0);
  assert.equal(isNewerDesktopVersion('not-a-version', '1.0.7'), false);
});

test('only reports strictly newer candidates as updates', () => {
  assert.equal(isNewerDesktopVersion('1.0.8', '1.0.7'), true);
  assert.equal(isNewerDesktopVersion('1.0.7', '1.0.7'), false);
  assert.equal(isNewerDesktopVersion('1.0.6', '1.0.7'), false);
});
