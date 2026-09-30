'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.RADIO_URL || 'http://127.0.0.1:8877';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('frecuencia90.v1', JSON.stringify({
      version: 1, band: 'FM', frequency: 87.5, volume: 0,
      stations: Array.from({ length: 12 }, (_, i) => ({ id: 'testvideo' + String(i).padStart(2, '0'), title: 'Test ' + i, artist: 'Test', source: 'youtube' }))
    })));
    let attempts = 0, busy = true;
    const accepted = [], completed = new Set();
    await page.route('**/api/audio', async route => {
      attempts++;
      const { id } = route.request().postDataJSON();
      if (busy) return route.fulfill({ status: 429, json: { code: 'queue_busy', error: 'Busy', retryAfter: 1 } });
      accepted.push(id);
      return route.fulfill({ status: 202, json: { job: id } });
    });
    await page.route('**/api/jobs/*', route => {
      const id = route.request().url().split('/').pop();
      return route.fulfill({ json: completed.has(id) ? { state: 'done', result: { url: '/radio-assets/emisora-1.mp3' } } : { state: 'loading' } });
    });
    await page.goto(base + '/retro.html');
    await page.locator('#prepare-all').uncheck();
    await page.locator('.station-row').first().click();
    await page.locator('#power-main').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Esperando un lugar'));
    assert.equal(await page.locator('#retry-audio').isVisible(), false, 'Busy server is not a failed station');
    busy = false;
    await page.waitForFunction(() => document.querySelector('#station-subtitle').textContent.includes('preparando'));
    await page.waitForTimeout(1200);
    assert.ok(attempts >= 2, 'Busy preparation retries automatically');
    assert.deepEqual(accepted, ['testvideo00']);
    // Move quickly through twelve stations while downloads remain pending.
    for (let i = 1; i < 12; i++) {
      await page.evaluate(i => {
        const station = window.RetroRadio.state().stations[i];
        window.RetroRadio.tune(station.frequency, { instant: true });
      }, i);
      await page.waitForTimeout(140);
    }
    assert.equal(accepted.length, 2, 'Only two jobs accepted during rapid tuning');
    completed.add('testvideo00');
    await page.waitForTimeout(1000);
    assert.equal(accepted.at(-1), 'testvideo11', 'Latest tuned station takes the next free slot');
    completed.add('testvideo11');
    await page.waitForFunction(() => window.RetroRadio.state().slots.includes('testvideo11'));
    assert.equal(await page.locator('#retry-audio').isVisible(), false);
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Audio preparado'));
    // Off cancels queued stations, while accepted work can finish into the cache.
    await page.evaluate(() => window.RetroRadio.tune(window.RetroRadio.state().stations[9].frequency, { instant: true }));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.RetroRadio.tune(window.RetroRadio.state().stations[8].frequency, { instant: true }));
    await page.waitForTimeout(200);
    const beforeOff = accepted.length;
    await page.locator('#power-main').click();
    for (const id of accepted) completed.add(id);
    await page.waitForTimeout(1000);
    assert.equal(accepted.length, beforeOff, 'Off prevents pending stations from starting');
    assert.deepEqual(errors, []);
    const queued = await context.newPage();
    await queued.addInitScript(() => {
      const now = Date.now; window.testTimeOffset = 0;
      Date.now = () => now() + window.testTimeOffset;
    });
    let polls = 0;
    await queued.route('**/api/audio', route => route.fulfill({ status: 202, json: { job: 'queued-test' } }));
    await queued.route('**/api/jobs/*', async route => {
      polls++;
      await route.fulfill({ json: polls < 3 ? { state: 'queued' } : { state: 'done', result: { url: '/radio-assets/emisora-1.mp3' } } });
      if (polls === 1) await queued.evaluate(() => { window.testTimeOffset = 400000; });
    });
    await queued.goto(base + '/retro.html');
    await queued.locator('#prepare-all').uncheck();
    await queued.locator('.station-row').first().click();
    await queued.locator('#power-main').click();
    await queued.waitForFunction(() => window.RetroRadio.state().stations[0].prepared);
    assert.equal(polls, 3, 'More than 330 seconds queued does not time out the preparation');
    assert.equal(await queued.locator('#retry-audio').isVisible(), false);
    await context.close();
    const real = await browser.newPage();
    await real.goto(base + '/retro.html');
    await real.locator('#power-main').click();
    await real.waitForFunction(() => window.RetroRadio.state().slots.some(Boolean));
    const result = await real.evaluate(async () => {
      const response = await fetch('/api/audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '5rAOyh7YmEc' }) });
      const { job } = await response.json();
      const status = await fetch('/api/jobs/' + job).then(r => r.json());
      return { status: status.state, url: status.result?.url };
    });
    assert.equal(result.status, 'done');
    assert.equal(result.url, '/radio-cache/5rAOyh7YmEc.mp3');
    console.log('PASS: browser busy retry, rapid tuning, current-station priority, power-off cancellation, queue timeout, demo playback and real cache');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
