import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/gitlab.js';

test('invalid paths, arrays and unsupported methods never reach GitLab', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({url, options}); return new Response('{}'); };
  const response = () => ({ setHeader() {}, status(n) { this.code = n; return this; }, json(data) { this.data = data; } });
  try {
    for (const username of ['../admin', 'alice?redirect=evil', ['alice', 'bob'], undefined, 'a'.repeat(256)]) {
      const res = response();
      await handler({ method: 'GET', query: { username } }, res);
      assert.equal(res.code, 400);
    }
    const denied = response();
    await handler({ method: 'POST', query: { username: 'alice' } }, denied);
    assert.equal(denied.code, 405);
    assert.equal(calls.length, 0);
    const res = response();
    await handler({ method: 'GET', query: { username: 'alice.test' } }, res);
    assert.equal(res.code, 200);
    assert.equal(calls[0].url, 'https://gitlab.com/users/alice.test/calendar.json');
    assert.equal(calls[0].options.redirect, 'error');
  } finally { globalThis.fetch = originalFetch; }
});
