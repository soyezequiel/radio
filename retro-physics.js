/* Receiver model in volts, seconds, ohms and metres. See README-retro-physics.md. */
(function(root,factory) {
  if (typeof module==='object'&&module.exports) module.exports=factory();
  else { root.RetroPhysics=factory(); root.RetroPhysicsFactory=factory.toString(); }
})(typeof window==='undefined'?globalThis:window,function() {
  'use strict';
  const PI2=2*Math.PI, KB=1.380649e-23;
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  const defaults={temperature:290,resistance:50,noiseFigureDb:6,antennaMicrovolts:20,deviation:75000,emphasis:75e-6};
  function thermalDensity(temperature=290,resistance=50,noiseFigureDb=6) { return 4*KB*temperature*resistance*10**(noiseFigureDb/10); }
  class Gaussian {
    constructor(seed=0x2a9f843d) { this.seed=seed>>>0||1; this.spare=null; }
    uniform() { let x=this.seed; x^=x<<13; x^=x>>>17; x^=x<<5; this.seed=x>>>0; return (this.seed+.5)/4294967296; }
    next() {
      if (this.spare!==null) { const value=this.spare; this.spare=null; return value; }
      let u,v,r; do { u=this.uniform()*2-1; v=this.uniform()*2-1; r=u*u+v*v; } while(r>=1||r===0);
      const scale=Math.sqrt(-2*Math.log(r)/r); this.spare=v*scale; return u*scale;
    }
  }
  class Biquad {
    constructor(fs,fc,q) { this.z1=0; this.z2=0; this.update(fs,fc,q); }
    update(fs,fc,q) {
      const w=PI2*Math.min(fc,fs*.46)/fs,c=Math.cos(w),a=Math.sin(w)/(2*q),den=1+a;
      this.b0=(1-c)/(2*den); this.b1=(1-c)/den; this.b2=this.b0;
      this.a1=-2*c/den; this.a2=(1-a)/den;
    }
    process(x) { const y=this.b0*x+this.z1; this.z1=this.b1*x-this.a1*y+this.z2; this.z2=this.b2*x-this.a2*y; return y; }
    magnitude(f,fs) {
      const t=PI2*f/fs,cr=Math.cos(t),ci=-Math.sin(t),c2=Math.cos(2*t),s2=-Math.sin(2*t);
      const nr=this.b0+this.b1*cr+this.b2*c2,ni=this.b1*ci+this.b2*s2,dr=1+this.a1*cr+this.a2*c2,di=this.a1*ci+this.a2*s2;
      return Math.hypot(nr,ni)/Math.hypot(dr,di);
    }
  }
  class Butterworth {
    constructor(fs,fc,order=4) {
      this.fs=fs; this.order=order;
      this.stages=Array.from({length:order/2},(_,i)=>new Biquad(fs,fc,1/(2*Math.cos(Math.PI*(2*i+1)/(2*order)))));
    }
    update(fc) { this.stages.forEach((s,i)=>s.update(this.fs,fc,1/(2*Math.cos(Math.PI*(2*i+1)/(2*this.order))))); }
    process(x) { for(const stage of this.stages) x=stage.process(x); return x; }
    magnitude(f) { return this.stages.reduce((v,s)=>v*s.magnitude(f,this.fs),1); }
    energyBandwidth() {
      let sum=0; const bins=1024,df=this.fs/(2*bins);
      for(let i=0;i<bins;i++) sum+=this.magnitude((i+.5)*df)**2;
      return 2*sum*df; // Two-sided complex-baseband bandwidth.
    }
  }
  function invert3(m) {
    const [a,b,c,d,e,f,g,h,i]=m,det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
    return [(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];
  }
  class Loudspeaker {
    constructor(fs,params={}) {
      this.p={Re:6,Le:.0002,Bl:4,Mms:.008,Cms:.0006,Rms:1.3,Sd:.008,distance:1,airDensity:1.2,...params};
      this.state=new Float64Array(3); this.previousVoltage=0; this.displacement=0; this.current=0;
      const p=this.p,A=[-p.Re/p.Le,0,-p.Bl/p.Le,0,0,1,p.Bl/p.Mms,-1/(p.Cms*p.Mms),-p.Rms/p.Mms],dt=1/(2*fs);
      const minus=A.map((v,j)=>(j%4===0?1:0)-dt*v),plus=A.map((v,j)=>(j%4===0?1:0)+dt*v),inv=invert3(minus);
      this.M=new Float64Array(9); this.B=new Float64Array(3);
      for(let r=0;r<3;r++) { for(let col=0;col<3;col++) for(let k=0;k<3;k++) this.M[r*3+col]+=inv[r*3+k]*plus[k*3+col]; this.B[r]=inv[r*3]*dt/p.Le; }
      this.radiation=p.airDensity*p.Sd/(PI2*p.distance); this.fs=1/(PI2*Math.sqrt(p.Mms*p.Cms));
    }
    process(voltage) {
      const s=this.state,m=this.M,u=voltage+this.previousVoltage;
      const i=m[0]*s[0]+m[1]*s[1]+m[2]*s[2]+this.B[0]*u,x=m[3]*s[0]+m[4]*s[1]+m[5]*s[2]+this.B[1]*u,v=m[6]*s[0]+m[7]*s[1]+m[8]*s[2]+this.B[2]*u;
      s[0]=i; s[1]=x; s[2]=v; this.previousVoltage=voltage; this.displacement=x; this.current=i;
      const p=this.p,acceleration=(p.Bl*i-p.Rms*v-x/p.Cms)/p.Mms;
      return this.radiation*acceleration; // Baffled small-piston pressure, pascals.
    }
  }
  class PeakDetector {
    constructor(fs) {
      this.Vd=.12; this.C=10e-9; this.Rs=220; this.Rl=22000; this.voltage=0;
      this.charge=Math.exp(-1/(fs*this.Rs*this.C)); this.release=Math.exp(-1/(fs*this.Rl*this.C));
    }
    process(amplitude) {
      this.voltage*=this.release; const rectified=Math.max(0,amplitude-this.Vd);
      if(rectified>this.voltage) this.voltage=rectified+(this.voltage-rectified)*this.charge;
      return this.voltage;
    }
  }
  class Receiver {
    constructor(fs=48000,options={}) {
      this.fs=fs; this.factor=16; this.rfRate=fs*this.factor; this.dt=1/this.rfRate;
      this.options={...defaults,noise:true,reflection:false,speaker:true,stereo:true,...options};
      this.band='FM'; this.f0=97.75e6; this.bandwidth=180000; this.volume=.65;
      this.branches=Array(5).fill(null); this.active=[]; this.output=new Float64Array(2); this.random=new Gaussian(options.seed);
      this.ifI=new Butterworth(this.rfRate,this.bandwidth/2); this.ifQ=new Butterworth(this.rfRate,this.bandwidth/2);
      this.audioL=new Butterworth(this.rfRate,15000,6); this.audioR=new Butterworth(this.rfRate,15000,6);
      this.detector=new PeakDetector(this.rfRate); this.speakers=[new Loudspeaker(fs),new Loudspeaker(fs)];
      this.previousI=0; this.previousQ=0; this.ifPower=0; this.agc=20000;
      this.dcInput=0; this.dcOutput=0; this.deemphasisL=0; this.deemphasisR=0; this.frontI=0; this.frontQ=0;
      this.pilotPhase=0; this.pilotI=0; this.pilotQ=0; this.pilotIntegrator=0; this.pilotError=1; this.stereoBlend=0;
      this.transmitPilot=0; this.sampleCount=0; this.pressurePower=0; this.clipCount=0;
      this.reflectionI=new Float64Array(8); this.reflectionQ=new Float64Array(8); this.reflectionIndex=0;
      this.taps=12; this.interpolation=[];
      for(let phase=0;phase<this.factor;phase++) {
        const coeff=new Float64Array(this.taps),delay=(this.taps-1)/2-phase/this.factor; let sum=0;
        for(let k=0;k<this.taps;k++) { const t=k-delay,sinc=Math.abs(t)<1e-12?1:Math.sin(Math.PI*t)/(Math.PI*t); coeff[k]=sinc*(.54-.46*Math.cos(PI2*k/(this.taps-1))); sum+=coeff[k]; }
        for(let k=0;k<this.taps;k++) coeff[k]/=sum; this.interpolation.push(coeff);
      }
      this.configure({});
    }
    configure(settings) {
      const changedBand=settings.band&&settings.band!==this.band,changedWidth=settings.bandwidth&&settings.bandwidth!==this.bandwidth;
      if(settings.band) this.band=settings.band;
      if(Number.isFinite(settings.f0)) this.f0=settings.f0;
      if(Number.isFinite(settings.bandwidth)) this.bandwidth=settings.bandwidth;
      for(const key of ['noise','reflection','speaker','stereo','temperature','antennaMicrovolts','noiseFigureDb','emphasis']) if(settings[key]!==undefined) this.options[key]=settings[key];
      if(settings.volume!==undefined) this.volume=clamp(settings.volume,0,1);
      if(changedBand||changedWidth) { this.ifI.update(this.bandwidth/2); this.ifQ.update(this.bandwidth/2); }
      if(changedBand) { this.audioL.update(this.band==='FM'?15000:3000); this.audioR.update(this.band==='FM'?15000:3000); this.pilotIntegrator=0; this.stereoBlend=0; }
      const o=this.options;
      this.sigma=Math.sqrt(thermalDensity(o.noise?o.temperature:0,o.resistance,o.noiseFigureDb)*this.rfRate);
      this.frontAlpha=1-Math.exp(-Math.PI*(this.band==='FM'?2000000:60000)/this.rfRate);
      if(changedBand||changedWidth||this.noiseBandwidth===undefined) {
        let integral=0; const bins=2048,df=this.rfRate/(2*bins),pole=1-this.frontAlpha;
        for(let i=0;i<bins;i++) { const f=(i+.5)*df,frontPower=this.frontAlpha**2/(1+pole*pole-2*pole*Math.cos(PI2*f/this.rfRate)); integral+=this.ifI.magnitude(f)**2*frontPower; }
        this.noiseBandwidth=2*integral*df;
      }
      this.ifNoisePower=2*thermalDensity(o.noise?o.temperature:0,o.resistance,o.noiseFigureDb)*this.noiseBandwidth;
      this.highpassDecay=Math.exp(-PI2*30/this.rfRate); this.deemphasisAlpha=1-Math.exp(-this.dt/o.emphasis);
      this.reflectionCos=Math.cos(-PI2*this.f0*4/this.rfRate); this.reflectionSin=Math.sin(-PI2*this.f0*4/this.rfRate);
      for(const branch of this.branches) if(branch) this.updateCarrier(branch);
    }
    updateCarrier(branch) {
      branch.offset=branch.frequency-this.f0;
      // Truncate out-of-window carriers before synthesis; finite FM sideband tails remain an approximation.
      branch.inWindow=Math.abs(branch.offset)<280000;
      branch.step=PI2*branch.offset/this.rfRate; branch.stepCos=Math.cos(branch.step); branch.stepSin=Math.sin(branch.step);
      branch.amplitude=(branch.microvolts??this.options.antennaMicrovolts)*1e-6;
    }
    setCarrier(slot,frequency,microvolts) {
      const old=this.branches[slot]; if(old&&old.frequency===frequency) { old.microvolts=microvolts; this.updateCarrier(old); return; }
      const branch={frequency,microvolts,phase:0,carrierI:Math.cos(slot*.713),carrierQ:Math.sin(slot*.713),pilotCos:Math.cos(slot*1.137),pilotSin:Math.sin(slot*1.137),stereoCos:Math.cos(slot*2.274),stereoSin:Math.sin(slot*2.274),emphasisL:0,emphasisR:0,left:new Float64Array(this.taps),right:new Float64Array(this.taps),ring:0};
      this.branches[slot]=branch; this.updateCarrier(branch);
    }
    removeCarrier(slot) { this.branches[slot]=null; }
    pushAudio(branch,left,right) {
      const alpha=1-Math.exp(-PI2*15000/this.fs);
      branch.emphasisL+=alpha*(left-branch.emphasisL); branch.emphasisR+=alpha*(right-branch.emphasisR);
      const scale=this.options.emphasis*PI2*15000;
      if(this.band==='FM') { left=clamp(branch.emphasisL+scale*(left-branch.emphasisL),-1,1); right=clamp(branch.emphasisR+scale*(right-branch.emphasisR),-1,1); }
      branch.ring=(branch.ring+1)%this.taps; branch.left[branch.ring]=left; branch.right[branch.ring]=right;
    }
    processFrame(inputs,frame) {
      const active=this.active; active.length=0;
      for(let j=0;j<this.branches.length;j++) {
        const branch=this.branches[j],channels=inputs[j]; if(!branch||!channels?.length) continue;
        const l=channels[0][frame]||0,r=channels[1]?.[frame]??l; this.pushAudio(branch,l,r); if(branch.inWindow) active.push(branch);
      }
      let audioL=0,audioR=0;
      const pilotAlpha=1-Math.exp(-PI2*180/this.rfRate),pilotOmega=PI2*19000/this.rfRate;
      const powerAlpha=1-Math.exp(-this.dt/.01),blendAlpha=1-Math.exp(-this.dt/.06);
      for(let sub=0;sub<this.factor;sub++) {
        let i=0,q=0; const weights=this.interpolation[sub],pilotCos=Math.cos(this.transmitPilot),pilotSin=Math.sin(this.transmitPilot),stereoCos=Math.cos(2*this.transmitPilot),stereoSin=Math.sin(2*this.transmitPilot);
        for(const branch of active) {
          let l=0,r=0; for(let k=0;k<this.taps;k++) { const index=(branch.ring-k+this.taps)%this.taps; l+=weights[k]*branch.left[index]; r+=weights[k]*branch.right[index]; }
          if(this.band==='FM') {
            const pilot=pilotCos*branch.pilotCos-pilotSin*branch.pilotSin,subcarrier=stereoCos*branch.stereoCos-stereoSin*branch.stereoSin;
            const mpx=clamp(.9*(l+r)/2+.9*(l-r)/2*subcarrier+.09*pilot,-1,1);
            branch.phase+=PI2*this.options.deviation*mpx/this.rfRate;
            if(branch.phase>Math.PI) branch.phase-=PI2; else if(branch.phase<-Math.PI) branch.phase+=PI2;
            const c=Math.cos(branch.phase),s=Math.sin(branch.phase);
            i+=branch.amplitude*(branch.carrierI*c-branch.carrierQ*s); q+=branch.amplitude*(branch.carrierQ*c+branch.carrierI*s);
          } else { const envelope=branch.amplitude*(1+.8*clamp((l+r)/2,-1,1)); i+=envelope*branch.carrierI; q+=envelope*branch.carrierQ; }
          const ci=branch.carrierI*branch.stepCos-branch.carrierQ*branch.stepSin;
          branch.carrierQ=branch.carrierI*branch.stepSin+branch.carrierQ*branch.stepCos; branch.carrierI=ci;
        }
        this.transmitPilot+=pilotOmega; if(this.transmitPilot>PI2) this.transmitPilot-=PI2;
        if(this.options.reflection) {
          const at=this.reflectionIndex,delayed=(at+4)&7,di=this.reflectionI[delayed],dq=this.reflectionQ[delayed];
          this.reflectionI[at]=i; this.reflectionQ[at]=q; this.reflectionIndex=(at+1)&7;
          i+=.2*(di*this.reflectionCos-dq*this.reflectionSin); q+=.2*(di*this.reflectionSin+dq*this.reflectionCos);
        }
        if(this.sigma) { i+=this.random.next()*this.sigma; q+=this.random.next()*this.sigma; }
        this.frontI+=this.frontAlpha*(i-this.frontI); this.frontQ+=this.frontAlpha*(q-this.frontQ);
        i=this.ifI.process(this.frontI); q=this.ifQ.process(this.frontQ); this.ifPower+=powerAlpha*(i*i+q*q-this.ifPower);
        let demod;
        if(this.band==='FM') {
          // Limiter/discriminator calibrated in Hz: arg(z[n] conjugate(z[n-1])).
          demod=Math.atan2(q*this.previousI-i*this.previousQ,i*this.previousI+q*this.previousQ)*this.rfRate/(PI2*this.options.deviation);
          this.previousI=i; this.previousQ=q;
        } else demod=this.detector.process(Math.hypot(i,q)*this.agc)/(.65*.8);
        this.dcOutput=this.highpassDecay*(this.dcOutput+demod-this.dcInput); this.dcInput=demod; demod=this.dcOutput;
        let l=demod,r=demod;
        if(this.band==='FM') {
          const pc=Math.cos(this.pilotPhase),ps=Math.sin(this.pilotPhase);
          this.pilotI+=pilotAlpha*(2*demod*pc-this.pilotI); this.pilotQ+=pilotAlpha*(-2*demod*ps-this.pilotQ);
          const error=Math.atan2(this.pilotQ,this.pilotI),wn=PI2*18;
          this.pilotIntegrator=clamp(this.pilotIntegrator+wn*wn*error*this.dt,-PI2*300,PI2*300);
          this.pilotPhase+=pilotOmega+(this.pilotIntegrator+2*.707*wn*error)*this.dt;
          if(this.pilotPhase>PI2) this.pilotPhase-=PI2; else if(this.pilotPhase<0) this.pilotPhase+=PI2;
          this.pilotError+=blendAlpha*(error*error-this.pilotError);
          const locked=clamp((Math.hypot(this.pilotI,this.pilotQ)-.02)/.04,0,1)*clamp((.5-this.pilotError)/.4,0,1);
          this.stereoBlend+=blendAlpha*((this.options.stereo?locked:0)-this.stereoBlend);
          const difference=2*demod*Math.cos(2*this.pilotPhase)*this.stereoBlend; l=(demod+difference)/.9; r=(demod-difference)/.9;
        }
        l=this.audioL.process(l); r=this.audioR.process(r);
        if(this.band==='FM') { this.deemphasisL+=this.deemphasisAlpha*(l-this.deemphasisL); this.deemphasisR+=this.deemphasisAlpha*(r-this.deemphasisR); l=this.deemphasisL; r=this.deemphasisR; }
        audioL=l; audioR=r; this.sampleCount++;
      }
      if(this.band==='AM') { const desired=clamp(.65/Math.max(Math.sqrt(this.ifPower),1e-9),2000,2000000),alpha=1-Math.exp(-1/(this.fs*(desired<this.agc ? .025 : .45))); this.agc+=alpha*(desired-this.agc); }
      const rail=3.4,vl=rail*Math.tanh(audioL*3*this.volume/rail),vr=rail*Math.tanh(audioR*3*this.volume/rail);
      if(Math.abs(audioL*3*this.volume)>rail||Math.abs(audioR*3*this.volume)>rail) this.clipCount++;
      const pl=this.speakers[0].process(vl),pr=this.speakers[1].process(vr);
      this.pressurePower+=(1-Math.exp(-1/(this.fs*.1)))*((pl*pl+pr*pr)/2-this.pressurePower);
      this.output[0]=this.options.speaker?pl:vl/3; this.output[1]=this.options.speaker?pr:vr/3; return this.output;
    }
    process(inputs,left,right) {
      for(let frame=0;frame<left.length;frame++) { const output=this.processFrame(inputs,frame); left[frame]=output[0]; if(right) right[frame]=output[1]; }
      for(const branch of this.branches) if(branch) { const n=Math.hypot(branch.carrierI,branch.carrierQ); branch.carrierI/=n; branch.carrierQ/=n; }
    }
    snapshot() {
      const signal=Math.max(0,this.ifPower-this.ifNoisePower);
      return {rfRate:this.rfRate,ifBandwidth:this.bandwidth,ifRmsMicrovolts:Math.sqrt(this.ifPower)*1e6,thermalRmsMicrovolts:Math.sqrt(this.ifNoisePower)*1e6,
        cnrDb:this.ifNoisePower?10*Math.log10(Math.max(signal,1e-30)/this.ifNoisePower):null,agcDb:this.band==='AM'?20*Math.log10(this.agc):null,
        stereoBlend:this.stereoBlend,pilotAmplitude:Math.hypot(this.pilotI,this.pilotQ),pressureDbSPL:10*Math.log10(Math.max(this.pressurePower,1e-30)/(20e-6)**2),
        displacementMm:this.speakers.map(s=>s.displacement*1000),currentAmps:this.speakers.map(s=>s.current),amplifierClips:this.clipCount,
        temperature:this.options.noise?this.options.temperature:0,sampledCarriers:this.branches.filter(s=>s?.inWindow).length,reflectionDelayUs:4/this.rfRate*1e6};
    }
  }
  return {Receiver,Gaussian,Biquad,Butterworth,PeakDetector,Loudspeaker,thermalDensity,defaults,KB};
});
