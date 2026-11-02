import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOrigins, isLocalOrigin, corsHeaders, timingSafeEqual, sha256,
} from '../../feed-worker/src/http.js';

test('CORS allows listed origins and localhost, never *', async () => {
  assert.deepEqual(parseOrigins(' https://a.example ,https://b.example '), ['https://a.example', 'https://b.example']);
  assert.equal(isLocalOrigin('http://localhost:5173'), true);
  assert.equal(isLocalOrigin('https://evil.example'), false);
  const ok = corsHeaders('https://a.example', ['https://a.example']);
  assert.equal(ok['access-control-allow-origin'], 'https://a.example');
  const local = corsHeaders('http://127.0.0.1:8080', []);
  assert.equal(local['access-control-allow-origin'], 'http://127.0.0.1:8080');
  const deny = corsHeaders('https://evil.example', ['https://a.example']);
  assert.equal(deny['access-control-allow-origin'], undefined);
});

test('timing-safe compare and sha256', async () => {
  const a = await sha256('secret');
  const b = await sha256('secret');
  const c = await sha256('other');
  assert.equal(timingSafeEqual(a, b), true);
  assert.equal(timingSafeEqual(a, c), false);
  assert.equal(timingSafeEqual(a, a.slice(0, 16)), false);
});
