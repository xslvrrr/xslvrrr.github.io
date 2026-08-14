import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDesktopBridgeUrl,
  createDesktopLoginUrl,
  extractDesktopLoginPayload,
  extractDesktopToken,
  getAppOrigin
} from './links.ts';

const TOKEN = '123e4567-e89b-42d3-a456-426614174000';
const STATE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

test('createDesktopLoginUrl builds the state-bound custom protocol URL', () => {
  assert.equal(
    createDesktopLoginUrl(TOKEN, STATE),
    `millennium://login?token=${TOKEN}&state=${STATE}`
  );
});

test('createDesktopBridgeUrl preserves token and state on a trusted loopback origin', () => {
  assert.equal(
    createDesktopBridgeUrl(TOKEN, STATE, 'http://127.0.0.1:3001/'),
    `http://127.0.0.1:3001/app-open?token=${TOKEN}&state=${STATE}`
  );
});

test('createDesktopBridgeUrl rejects an untrusted HTTPS origin', () => {
  assert.equal(
    createDesktopBridgeUrl(TOKEN, STATE, 'https://example.com/'),
    `http://millennium-five.vercel.app/app-open?token=${TOKEN}&state=${STATE}`
  );
});

test('extractDesktopLoginPayload accepts state-bound custom-scheme and loopback links', () => {
  assert.deepEqual(
    extractDesktopLoginPayload(`millennium://login?token=${TOKEN}&state=${STATE}`),
    { token: TOKEN, state: STATE }
  );
  assert.deepEqual(
    extractDesktopLoginPayload(`http://127.0.0.1:3001/app-open?token=${TOKEN}&state=${STATE}`),
    { token: TOKEN, state: STATE }
  );
});

test('extractDesktopToken requires the state-bound login payload', () => {
  assert.equal(extractDesktopToken(`millennium://login?token=${TOKEN}&state=${STATE}`), TOKEN);
  assert.equal(extractDesktopToken(`millennium://login?token=${TOKEN}`), null);
});

test('extractDesktopLoginPayload rejects unrelated, malformed, and incomplete URLs', () => {
  assert.equal(extractDesktopLoginPayload(`https://example.com/dashboard?token=${TOKEN}&state=${STATE}`), null);
  assert.equal(extractDesktopLoginPayload(`millennium://dashboard?token=${TOKEN}&state=${STATE}`), null);
  assert.equal(extractDesktopLoginPayload(`millennium://login?token=${TOKEN}`), null);
  assert.equal(extractDesktopLoginPayload(`millennium://login?token=not-a-uuid&state=${STATE}`), null);
  assert.equal(extractDesktopLoginPayload(`millennium://login?token=${TOKEN}&state=short`), null);
  assert.equal(extractDesktopLoginPayload(`http://localhost.example.com/app-open?token=${TOKEN}&state=${STATE}`), null);
  assert.equal(extractDesktopLoginPayload(`http://user@millennium-five.vercel.app/app-open?token=${TOKEN}&state=${STATE}`), null);
  assert.equal(extractDesktopLoginPayload('not a url'), null);
});

test('getAppOrigin normalizes explicit loopback origins', () => {
  assert.equal(getAppOrigin('http://millennium-five.vercel.app///'), 'http://millennium-five.vercel.app');
});

test('getAppOrigin rejects configured non-loopback origins', () => {
  const previous = process.env.MILLENNIUM_APP_URL;
  process.env.MILLENNIUM_APP_URL = 'https://app.example.com/';

  try {
    assert.equal(getAppOrigin(), 'http://millennium-five.vercel.app');
  } finally {
    if (previous === undefined) {
      delete process.env.MILLENNIUM_APP_URL;
    } else {
      process.env.MILLENNIUM_APP_URL = previous;
    }
  }
});
