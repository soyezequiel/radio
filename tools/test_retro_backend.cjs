'use strict';
const assert = require('node:assert/strict');
const factory = require('../retro-backend.js');
(async () => {
  const location = { origin: 'https://radio.vercel.app' };
  let attempts = 0, notices = 0;
  const backend = factory({ apiBase: 'https://radio.onrender.com/' }, location, async url => {
    assert.equal(url, 'https://radio.onrender.com/api/health');
    attempts++;
    if (attempts === 1) return { ok: false, status: 503 };
    if (attempts === 2) return { ok: true, status: 200, json: async () => { throw new Error('Render loading page'); } };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  assert.equal(backend.mediaUrl('/api/media/5rAOyh7YmEc'), 'https://radio.onrender.com/api/media/5rAOyh7YmEc');
  assert.equal(backend.mediaUrl('/radio-cache/5rAOyh7YmEc.mp3'), 'https://radio.onrender.com/radio-cache/5rAOyh7YmEc.mp3');
  assert.throws(() => backend.mediaUrl('https://evil.example/api/media/5rAOyh7YmEc'));
  assert.throws(() => backend.mediaUrl('/tools/secret'));
  assert.throws(() => factory({ apiBase: 'http://remote.example' }, location, () => {}));
  assert.equal(await backend.ready({ wait: true, retryMs: 1, timeoutMs: 500, onWaiting: () => notices++ }), true);
  assert.equal(attempts, 3); assert.equal(notices, 1);
  let rejectedCalls = 0;
  const rejected = factory({}, location, async () => { rejectedCalls++; return { status: 403, ok: false }; });
  assert.equal(await rejected.ready({ wait: true, retryMs: 1 }), false); assert.equal(rejectedCalls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(backend.ready({ wait: true, signal: controller.signal }), error => error.name === 'AbortError');
  console.log('PASS: external API/media URLs, cold-start retry, configuration errors and cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
