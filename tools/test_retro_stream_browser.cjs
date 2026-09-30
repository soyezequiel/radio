'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.RADIO_URL || 'http://127.0.0.1:8877';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(), responses = [];
    await page.goto(base + '/retro.html');
    page.on('response', response => { if (/\/api\/media\/|\/radio-cache\//.test(response.url())) responses.push(response.status()); });
    // Exercise native media decoding and seeking independently of UI/DSP edits.
    await page.setContent('<button id="play">Play</button><audio id="audio" preload="metadata"></audio>');
    await page.evaluate(() => {
      document.querySelector('#play').onclick = async () => {
        const audio = document.querySelector('#audio');
        audio.muted = true;
        const start = performance.now();
        audio.onloadedmetadata = () => { window.loaded = { ms: performance.now() - start, duration: audio.duration }; audio.currentTime = 7000; };
        audio.onplaying = () => { window.played = { ms: performance.now() - start, time: audio.currentTime }; };
        audio.onerror = () => { window.audioError = audio.error.code; };
        audio.src = '/radio-cache/K4cLY9DEpYI.source.webm';
        await audio.play();
      };
    });
    await page.click('#play');
    await page.waitForFunction(() => window.played || window.audioError, { timeout: 30000 });
    let local = await page.evaluate(() => ({ loaded: window.loaded, played: window.played, error: window.audioError }));
    assert.equal(local.error, undefined);
    assert.ok(local.played.time >= 7000, 'Long cached audio can start at the broadcast position');
    assert.ok(responses.includes(206), 'Audio seeks use partial responses');
    await page.evaluate(() => {
      const audio = document.querySelector('#audio'); audio.pause();
      window.played = undefined; window.audioError = undefined;
      const start = performance.now();
      audio.onloadedmetadata = () => { window.loaded = { ms: performance.now() - start, duration: audio.duration }; audio.currentTime = 7000; };
      audio.onplaying = () => { window.played = { ms: performance.now() - start, time: audio.currentTime }; };
      audio.src = '/api/media/K4cLY9DEpYI'; audio.play();
    });
    await page.waitForFunction(() => window.played || window.audioError, { timeout: 30000 });
    const stream = await page.evaluate(() => ({ loaded: window.loaded, played: window.played, error: window.audioError }));
    assert.equal(stream.error, undefined);
    assert.ok(stream.played.time >= 7000, 'Remote streaming seeks to the broadcast position');
    assert.ok(stream.played.ms < 30000, 'A two-hour podcast starts without waiting for a full download or conversion');
    const app = await browser.newPage(), appErrors = [];
    app.on('pageerror', error => appErrors.push(error.message));
    await app.addInitScript(() => localStorage.setItem('frecuencia90.v1', JSON.stringify({
      version: 1, band: 'FM', frequency: 97.75, volume: .4,
      stations: [{ id: 'K4cLY9DEpYI', title: 'Long podcast', artist: 'Streaming test', source: 'youtube' }]
    })));
    await app.goto(base + '/retro.html');
    const start = Date.now();
    await app.locator('#power-main').click();
    await app.waitForFunction(() => window.RetroRadio.state().audioRms > .00001);
    const radioStartMs = Date.now() - start;
    assert.deepEqual(appErrors, [], 'Native audio also plays through the radio DSP');
    console.log(JSON.stringify({ result: 'PASS', local, stream, radioStartMs, partialResponses: responses.filter(s => s === 206).length }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
