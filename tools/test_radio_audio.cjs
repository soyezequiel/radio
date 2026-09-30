'use strict';
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {Receiver,CARRIERS}=require('../radio-dsp.js');
const files=['emisora-1.mp3','emisora-2.mp3','emisora-3.mp3'];
const buffers=files.map(file=>{
  const result=spawnSync('ffmpeg',['-v','error','-i',path.join(__dirname,'..','radio-assets',file),'-ar','48000','-ac','1','-f','f32le','-'],{maxBuffer:90_000_000});
  if(result.status!==0)throw new Error(result.stderr.toString());
  const samples=new Float32Array(result.stdout.buffer,result.stdout.byteOffset,result.stdout.length/4);
  let peak=0;for(let i=0;i<samples.length;i++)peak=Math.max(peak,Math.abs(samples[i]));
  const copy=new Float32Array(samples.length),scale=.95/peak;for(let i=0;i<samples.length;i++)copy[i]=samples[i]*scale;
  return copy;
});
const fs=48000,receiver=new Receiver(fs);receiver.setBuffers(buffers);
let maxRadio=0,maxBypass=0,maxSource=0,meanRadio=0,meanBypass=0;
const samples=fs*280,options=[10000,4000,200000,10000,60000];
for(let n=0;n<samples;n++){
  if(n%128===0){const section=Math.floor(n/fs/8);receiver.tune(CARRIERS[section%3],options[section%options.length]);receiver.updateBlock();}
  receiver.processFrame();
  const radio=receiver.filteredAudio,bypass=receiver.unfilteredAudio,source=receiver.originalAudio;
  assert(Number.isFinite(radio)&&Number.isFinite(bypass)&&Number.isFinite(source),'No NaNs in supplied recordings');
  maxRadio=Math.max(maxRadio,Math.abs(radio));maxBypass=Math.max(maxBypass,Math.abs(bypass));maxSource=Math.max(maxSource,Math.abs(source));
  meanRadio+=radio*radio;meanBypass+=bypass*bypass;
}
assert(.6*Math.max(maxRadio,maxBypass,maxSource,.95)<1,'Fixed receiver gain must avoid clipping on supplied audio');
console.log(JSON.stringify({result:'PASS',testedSeconds:samples/fs,inputLengthsSeconds:buffers.map(b=>b.length/fs),audioPeaksAfterFixedGain:{filtered:.6*maxRadio,withoutLC:.6*maxBypass,originalMix:.6*maxSource,originalSolo:.6*.95},rmsAtReceiver:{filtered:Math.sqrt(meanRadio/samples),withoutLC:Math.sqrt(meanBypass/samples)}},null,2));
