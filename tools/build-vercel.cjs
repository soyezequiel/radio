'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
const apiBase = (process.env.RADIO_API_URL || '').trim().replace(/\/$/, '');
if (apiBase) {
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('RADIO_API_URL must be an HTTPS origin without paths or credentials');
}
// Only this generated directory is cleared; private cache and source stay intact.
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = [
  'index.html', 'app.js', 'styles.css',
  'radio.html', 'radio.js', 'radio.css', 'radio-dsp.js', 'radio-audio.js',
  'retro.html', 'retro.js', 'retro.css', 'retro-core.js', 'retro-physics.js',
  'retro-preparation.js', 'retro-worklet.js', 'retro-backend.js', 'radio-config.js',
  'README-retro-physics.md', 'README-radio.md', 'resonancia-radio.webm'
];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(out, file));
fs.mkdirSync(path.join(out, 'radio-assets'));
for (const file of ['emisora-1.mp3', 'emisora-2.mp3', 'emisora-3.mp3', 'recortes.json']) {
  fs.copyFileSync(path.join(root, 'radio-assets', file), path.join(out, 'radio-assets', file));
}
fs.writeFileSync(path.join(out, 'radio-config.js'), 'window.RADIO_CONFIG = ' + JSON.stringify({ apiBase }).replace(/</g, '\\u003c') + ';\n');
const html = path.join(out, 'retro.html');
fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('<script src="retro-physics.js">', '<script>window.RADIO_HOSTED = true;</script><script src="retro-physics.js">'));
// The portable archive is local-only and deliberately excluded from deployment.
const lab = path.join(out, 'radio.html');
fs.writeFileSync(lab, fs.readFileSync(lab, 'utf8').replace(/<a class="back-link" href="radio-laboratorio\.zip"[^>]*>.*?<\/a>/, ''));
console.log(`Built ${files.length + 4} public assets in dist/`);
