'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../retro-core.js');
const DSP = require('../radio-dsp.js');
const root = path.resolve(__dirname, '..');
let broadcastNow = 0, randomCalls = 0;
const broadcast = Core.createBroadcastClock(() => broadcastNow, () => ++randomCalls / 4);
assert.equal(broadcast('a', 100), 25);
assert.equal(broadcast('b', 100), 50);
broadcastNow = 20;
assert.equal(broadcast('a', 100), 45, 'Returning to a station preserves its progressing broadcast');
broadcastNow = 90;
assert.equal(broadcast('a', 100), 15, 'Broadcasts advance while the receiver is off and wrap at the end');
assert.equal(randomCalls, 2, 'Retuning never picks a new random position');
assert.equal(broadcast('unknown', NaN), 0);
assert.equal(randomCalls, 2, 'Unknown duration does not allocate a broadcast offset');
for (const band of ['FM', 'AM']) {
  const b = Core.bands[band];
  for (const f of [b.min, (b.min + b.max) / 2, b.max]) {
    assert.ok(Math.abs(Core.frequency(Core.capacitance(f, band), band) - f) < 1e-9);
    assert.ok(Math.abs(Core.response(f, f, band) - 1) < 1e-12);
    assert.ok(Core.frequency(Core.capacitance(f, band) * 1.1, band) < f);
  }
}
const assigned = Core.assign(Array.from({ length: 180 }, (_, i) => ({ id: 'test-' + i })));
for (const band of ['FM', 'AM']) {
  const frequencies = assigned.map(s => s.frequencies[band]);
  assert.equal(new Set(frequencies).size, 180);
  assert.ok(frequencies[0] > Core.bands[band].min && frequencies.at(-1) < Core.bands[band].max);
}
assert.equal(Core.parseSource('https://music.youtube.com/playlist?list=PLabcdefghijk&si=abc').kind, 'playlist');
assert.equal(Core.parseSource('https://youtu.be/5rAOyh7YmEc?t=25').id, '5rAOyh7YmEc');
assert.equal(Core.parseSource('@channel-name').kind, 'channel');
assert.equal(Core.parseSource('https://youtube.com/@channel-name/videos').url, 'https://www.youtube.com/@channel-name/videos');
assert.equal(Core.parseSource('rock argentino').kind, 'search');
assert.throws(() => Core.parseSource('https://evil.example/watch?v=5rAOyh7YmEc'));
let Processor;
const PHYSICS = require('../retro-physics.js');
const sandbox = { PHYSICS, sampleRate: 48000, AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {} }; } }, registerProcessor: (_, cls) => Processor = cls };
vm.runInNewContext(fs.readFileSync(path.join(root, 'retro-worklet.js'), 'utf8'), sandbox);
const processor = new Processor();
processor.port.onmessage({data:{type:'tune',noise:false}});
const left = new Float32Array(128), right = new Float32Array(128);
assert.equal(processor.process([],[[left,right]]),true);
assert.equal(left.reduce((s,v)=>s+Math.abs(v),0),0);
require('./test_retro_physics.cjs');
console.log('PASS: dial, broadcast clock, sources and stereo worklet');
