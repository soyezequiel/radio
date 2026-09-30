'use strict';
const assert=require('node:assert/strict');
const P=require('../retro-physics');
const fs=48000, blockSize=128;
const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
function amplitude(a,f) { let i=0,q=0; a.forEach((v,k)=>{i+=v*Math.cos(2*Math.PI*f*k/fs);q+=v*Math.sin(2*Math.PI*f*k/fs)});return 2*Math.hypot(i,q)/a.length; }
function receive({band='FM',noise=false,stereo=false,temperature=290,seconds=.7,carriers=[{offset:0,uv:20,left:1000,right:1000}],width,volume=.5,speaker=false,sweep=false}={}) {
 const r=new P.Receiver(fs,{noise,stereo,speaker,temperature,seed:1234});
 r.configure({band,f0:1e6,bandwidth:width||(band==='FM'?180000:9000),volume});
 carriers.forEach((c,j)=>r.setCarrier(j,1e6+c.offset,c.uv));
 const left=[],right=[]; let ifPower=0,n=0,peak=0; const start=performance.now();
 for(let b=0;b<seconds*fs/blockSize;b++) {
   if(sweep&&b%4===0) r.configure({f0:1e6+Math.sin(b)*300000});
   const inputs=carriers.map(c=>[Float32Array.from({length:blockSize},(_,i)=>c.left?.15*Math.sin(2*Math.PI*c.left*(b*blockSize+i)/fs):0),Float32Array.from({length:blockSize},(_,i)=>c.right?.15*Math.sin(2*Math.PI*c.right*(b*blockSize+i)/fs):0)]);
   const l=new Float32Array(blockSize),rr=new Float32Array(blockSize);r.process(inputs,l,rr);
   for(const v of [...l,...rr]) { assert.ok(Number.isFinite(v),'Unstable numerical state');peak=Math.max(peak,Math.abs(v)); }
   if(b>seconds*fs/blockSize*.55){left.push(...l);right.push(...rr);ifPower+=r.ifPower;n++;}
 }
 return {r,left,right,rms:rms(left),ifPower:ifPower/n,peak,milliseconds:performance.now()-start};
}
const silent=receive({carriers:[]});assert.equal(silent.peak,0,'No arbitrary effects in ideal silence');
const thermal=receive({carriers:[],noise:true,seconds:1});
assert.ok(thermal.rms>.02,'Physical RF noise demodulates to FM hiss');
assert.ok(Math.abs(thermal.ifPower/thermal.r.ifNoisePower-1)<.06,'Measured noise agrees with integrated 4kTR spectrum');
const hot=receive({carriers:[],noise:true,temperature:580,seconds:1});
assert.ok(Math.abs(hot.ifPower/thermal.ifPower-2)<1e-5,'Noise power doubles with absolute temperature');
const smallBand=receive({band:'AM',carriers:[],noise:true,seconds:1,width:5400});
const bigBand=receive({band:'AM',carriers:[],noise:true,seconds:1,width:18000});
assert.ok(bigBand.ifPower/smallBand.ifPower>3&&bigBand.ifPower/smallBand.ifPower<3.4,'Noise grows with equivalent receiver bandwidth');
const am=receive({band:'AM'});assert.ok(amplitude(am.left,1000)>.04,'AM envelope recovers message');
const sidebands=[{offset:0,uv:20,left:2500,right:2500}];
const amWide=receive({band:'AM',carriers:sidebands,width:9000});
const amNarrow=receive({band:'AM',carriers:sidebands,width:5400});
assert.ok(amNarrow.rms/amWide.rms<.85,'Narrow AM IF attenuates musical sidebands');
const beat=receive({band:'AM',carriers:[{offset:0,uv:20},{offset:1000,uv:20}]});
assert.ok(amplitude(beat.left,1000)>.2,'Two unmodulated RF fields produce a real detector beat');
const fm=receive();const weaker=receive({carriers:[{offset:0,uv:2,left:1000,right:1000}]});
assert.ok(amplitude(fm.left,1000)>.05);
assert.ok(Math.abs(weaker.rms/fm.rms-1)<.001,'FM discriminator is independent of carrier amplitude in noiseless conditions');
const stereo=receive({stereo:true,carriers:[{offset:0,uv:20,left:1000,right:2300}],seconds:1});
const separationLeft=20*Math.log10(amplitude(stereo.left,1000)/amplitude(stereo.right,1000));
const separationRight=20*Math.log10(amplitude(stereo.right,2300)/amplitude(stereo.left,2300));
assert.ok(separationLeft>24&&separationRight>24,'Pilot PLL recovers stereo with more than 24 dB separation');
assert.ok(stereo.r.stereoBlend>.95);
const capture=receive({carriers:[{offset:0,uv:20,left:1000,right:1000},{offset:25000,uv:2,left:2300,right:2300}]});
assert.ok(amplitude(capture.left,1000)>10*amplitude(capture.left,2300),'Common FM discriminator captures stronger carrier');
const sweep=receive({noise:true,speaker:true,sweep:true,seconds:1,carriers:Array.from({length:5},(_,j)=>({offset:(j-2)*50000,uv:20,left:500+j*300,right:500+j*300}))});
assert.ok(sweep.milliseconds<1000,'Five physical carriers must run faster than real time');
const muted=receive({noise:true,volume:0});assert.equal(muted.peak,0,'Volume zero also mutes receiver noise');
// Independently solve the sinusoidal electromechanical impedance of a moving-coil speaker.
function mul(a,b){return [a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];}
function div(a,b){return mul(a,[b[0],-b[1]]).map(v=>v/(b[0]**2+b[1]**2));}
const driver=new P.Loudspeaker(fs),p=driver.p,f=500,w=2*Math.PI*f;
const Zm=[p.Rms,w*p.Mms-1/(w*p.Cms)],back=div([p.Bl**2,0],Zm),Ze=[p.Re+back[0],w*p.Le+back[1]];
const velocity=div(mul([p.Bl,0],div([1,0],Ze)),Zm),pressure=mul([0,w*p.airDensity*p.Sd/(2*Math.PI*p.distance)],velocity);
const expected=Math.hypot(...pressure),samples=[];
for(let k=0;k<fs*.5;k++){const value=driver.process(Math.sin(w*k/fs));if(k>fs*.25)samples.push(value);}
assert.ok(Math.abs(amplitude(samples,f)/expected-1)<.015,'Speaker integration agrees with independent impedance solution');
for(let k=0;k<fs*2;k++)driver.process(0);
assert.ok(Math.abs(driver.displacement)<1e-12,'Passive driver loses stored energy after excitation stops');
console.log(JSON.stringify({result:'PASS',thermalMicrovolts:Math.sqrt(thermal.ifPower)*1e6,predictedMicrovolts:Math.sqrt(thermal.r.ifNoisePower)*1e6,stereoSeparationDb:[separationLeft,separationRight],captureRatio:amplitude(capture.left,1000)/amplitude(capture.left,2300),fiveCarrierMsPerSecond:sweep.milliseconds,speakerResonanceHz:driver.fs},null,2));
