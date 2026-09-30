'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
(async () => {
  const fixture = spawn('python', [path.join(__dirname, 'render_browser_fixture.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let browser;
  try {
    const addresses = await new Promise((resolve, reject) => {
      let text = ''; const timer = setTimeout(() => reject(new Error('Fixture startup timeout')), 10000);
      fixture.once('error', reject);
      fixture.stdout.on('data', data => { text += data; if (text.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(text.split('\n')[0])); } });
    });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.route('**/radio-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.RADIO_CONFIG = ' + JSON.stringify({ apiBase: addresses.backend }) }));
    await page.goto(addresses.frontend + '/retro.html');
    assert.equal(await page.locator('#capture-start').count(), 0);
    await page.fill('#source-input', 'https://youtu.be/5rAOyh7YmEc'); await page.click('#import-button');
    await page.waitForFunction(() => document.querySelector('#station-title').textContent === 'Backend test station');
    await page.click('#power-main');
    await page.locator('#circuit-panel').evaluate(el => { el.open = true; });
    await page.waitForFunction(() => /audio preparado/.test(document.querySelector('#station-subtitle').textContent));
    await page.waitForFunction(() => Number(document.querySelector('#physical-readouts').textContent.match(/FI: ([\d.]+)/)?.[1]) > 1, null, { timeout: 20000 });
    assert.ok(requests.some(url => url === addresses.backend + '/api/resolve'));
    assert.ok(requests.some(url => url === addresses.backend + '/radio-cache/5rAOyh7YmEc.mp3'));
    assert.deepEqual(errors, []);
    const initial = await page.locator('#physical-readouts').textContent();
    const tuned = Number(initial.match(/FI: ([\d.]+)/)?.[1]);
    await page.locator('#frequency-slider').evaluate(el => { el.value = el.min; el.dispatchEvent(new Event('input')); });
    await page.waitForFunction(level => Number(document.querySelector('#physical-readouts').textContent.match(/FI: ([\d.]+)/)?.[1]) < level * .1, tuned);
    console.log('PASS: two-origin import, CORS preflight, audio streaming into circuit and detuning');
  } finally {
    if (browser) await browser.close();
    fixture.stdin.end();
    const timer = setTimeout(() => fixture.kill(), 5000); timer.unref();
    fixture.once('exit', () => clearTimeout(timer));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
