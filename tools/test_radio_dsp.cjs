'use strict';
const assert=require('node:assert/strict');
const {Receiver,RFBranch,transfer,capacitance,resonance,CARRIERS}=require('../radio-dsp.js');
const fs=48000,tones=[523,997,2701];
const buffers=tones.map(f=>Float32Array.from({length:fs*2},(_,n)=>.4*Math.sin(2*Math.PI*f*n/fs)));
function run(f0,bandwidth=10000){
  const receiver=new Receiver(fs);receiver.setBuffers(buffers);receiver.tune(f0,bandwidth);
  const audio=new Float64Array(fs),bypass=new Float64Array(fs);let maximum=0;
  for(let n=0;n<fs*1.5;n++){if(n%128===0)receiver.updateBlock();receiver.processFrame();assert(Number.isFinite(receiver.filteredAudio));maximum=Math.max(maximum,Math.abs(receiver.filteredAudio));if(n>=fs/2){audio[n-fs/2]=receiver.filteredAudio;bypass[n-fs/2]=receiver.unfilteredAudio;}}
  return {audio,bypass,maximum};
}
function magnitude(samples,f){let re=0,im=0;for(let n=0;n<samples.length;n++){const p=2*Math.PI*f*n/fs;re+=samples[n]*Math.cos(p);im+=samples[n]*Math.sin(p);}return 2*Math.hypot(re,im)/samples.length;}
const output=[];
for(const fc of CARRIERS){
  assert(Math.abs(resonance(capacitance(fc))-fc)<1e-8);
  for(const f0 of [9e5,1e6,11e5])for(const band of [4000,10000,60000,200000]){
    const branch=new RFBranch(fs,fc,f0,band);
    for(const audioFrequency of [-3000,-1000,0,1000,3000]){
      const digital=branch.frequencyResponse(audioFrequency);
      const equivalentFrequency=fc+fs/Math.PI*Math.tan(Math.PI*audioFrequency/fs);
      const expected=transfer(equivalentFrequency,f0,band);
      assert(Math.hypot(digital[0]-expected.re,digital[1]-expected.im)<1e-9,'Complex filter must match analog RLC including sidebands and phase');
    }
  }
}
for(let i=0;i<3;i++){
  const result=run(CARRIERS[i]),levels=tones.map(t=>magnitude(result.audio,t));
  assert(levels[i]>.27,'Selected message must be recovered');
  for(let j=0;j<3;j++)if(i!==j)assert(levels[j]<levels[i]*.04,'Other messages must be attenuated by the physical receiver');
  assert(result.maximum<1.5,'Steady tuning must not create numerical instability');
  output.push({tuned:CARRIERS[i],messageAmplitudes:levels});
}
const low=run(9e5),high=run(11e5);
assert.deepEqual(low.bypass,high.bypass,'Removing LC must make the detected input independent of C');
const noFilter=tones.map(t=>magnitude(low.bypass,t));noFilter.forEach(a=>assert(a>.08,'All messages must remain audible without selection'));
const narrow=run(11e5,4000),normal=run(11e5,10000);
assert(magnitude(narrow.audio,2701)<magnitude(normal.audio,2701)*.72,'A narrow LC must also attenuate high audio sidebands');
const sweep=new Receiver(fs);sweep.setBuffers(buffers);let peak=0;
for(let n=0;n<fs*3;n++){if(n%128===0){sweep.tune(865000+260000*(.5+.5*Math.sin(2*Math.PI*n/fs)),[4000,10000,60000,200000][Math.floor(n/(fs*.4))%4]);sweep.updateBlock();}sweep.processFrame();assert(Number.isFinite(sweep.filteredAudio));peak=Math.max(peak,Math.abs(sweep.filteredAudio));}
assert(peak<5,'Tuning must remain numerically stable');
console.log(JSON.stringify({result:'PASS',carrierAndSidebandChecks:180,simultaneousMessages:output,withoutLC:noFilter,narrowAudioRatio:magnitude(narrow.audio,2701)/magnitude(normal.audio,2701),tuningSweepPeak:peak},null,2));
