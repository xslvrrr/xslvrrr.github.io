import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTransitionTarget,
  getTokenLoginFallbackData,
  stepAfterExtensionPresence,
} from './loginState.ts';

test('token login user alone is not ready portal data', () => {
  assert.equal(getTokenLoginFallbackData({ success: true, user: { name: 'Ryan', school: 'Millennium' } }), null);
});

test('extension presence only advances unresolved login steps', () => {
  assert.equal(stepAfterExtensionPresence('checking'), 'checking');
  assert.equal(stepAfterExtensionPresence('install'), 'sync');
  assert.equal(stepAfterExtensionPresence('syncing'), 'syncing');
  assert.equal(stepAfterExtensionPresence('ready'), 'ready');
  assert.equal(stepAfterExtensionPresence('sync'), 'sync');
});

test('duplicate transitions do not replay the same step animation', () => {
  assert.equal(getTransitionTarget('ready', null, 'ready'), null);
  assert.equal(getTransitionTarget('syncing', 'ready', 'ready'), null);
  assert.equal(getTransitionTarget('syncing', null, 'ready'), 'ready');
});
