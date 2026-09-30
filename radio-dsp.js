/* Physical AM receiver model. The complex envelope preserves RF frequencies. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else{root.RadioDSP=factory();root.RadioDSPFactory=factory.toString();}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const TWO_PI=2*Math.PI, L=100e-6, CARRIERS=[900000,1000000,1100000], REFERENCE=1000000, MU=.8;
  function resonance(C){return 1/(TWO_PI*Math.sqrt(L*C));}
  function capacitance(f){return 1/((TWO_PI*f)**2*L);}
  function transfer(f,f0=1000000,bandwidth=10000){
    const R=TWO_PI*L*bandwidth, X=TWO_PI*L*(f-f0*f0/f), den=R*R+X*X;
    return {re:R*R/den,im:-R*X/den,amplitude:R/Math.sqrt(den),phase:-Math.atan2(X,R)};
  }
  function divide(ar,ai,br,bi){const den=br*br+bi*bi;return [(ar*br+ai*bi)/den,(ai*br-ar*bi)/den];}
  class RFBranch{
    constructor(fs,carrier,f0,bandwidth){this.fs=fs;this.carrier=carrier;this.update(f0,bandwidth);this.reset();}
    update(f0,bandwidth){
      const k=2*this.fs,w=TWO_PI*this.carrier,w0=TWO_PI*f0,g=TWO_PI*bandwidth;
      const a0r=k*k-w*w+g*k+w0*w0,a0i=2*k*w+g*w;
      this.b0=divide(g*k,g*w,a0r,a0i);this.b1=divide(0,2*g*w,a0r,a0i);this.b2=divide(-g*k,g*w,a0r,a0i);
      this.a1=divide(2*(-k*k-w*w+w0*w0),2*g*w,a0r,a0i);this.a2=divide(k*k-w*w-g*k+w0*w0,-2*k*w+g*w,a0r,a0i);
      this.f0=f0;this.bandwidth=bandwidth;
    }
    reset(){const h=transfer(this.carrier,this.f0,this.bandwidth);this.x1=1;this.x2=1;this.y1r=h.re;this.y2r=h.re;this.y1i=h.im;this.y2i=h.im;this.re=h.re;this.im=h.im;}
    process(x){
      const yr=this.b0[0]*x+this.b1[0]*this.x1+this.b2[0]*this.x2-this.a1[0]*this.y1r+this.a1[1]*this.y1i-this.a2[0]*this.y2r+this.a2[1]*this.y2i;
      const yi=this.b0[1]*x+this.b1[1]*this.x1+this.b2[1]*this.x2-this.a1[0]*this.y1i-this.a1[1]*this.y1r-this.a2[0]*this.y2i-this.a2[1]*this.y2r;
      this.x2=this.x1;this.x1=x;this.y2r=this.y1r;this.y2i=this.y1i;this.y1r=yr;this.y1i=yi;this.re=yr;this.im=yi;
    }
    frequencyResponse(audioFrequency){
      const theta=TWO_PI*audioFrequency/this.fs;
      const z1r=Math.cos(theta),z1i=-Math.sin(theta),z2r=Math.cos(2*theta),z2i=-Math.sin(2*theta);
      const nr=this.b0[0]+this.b1[0]*z1r-this.b1[1]*z1i+this.b2[0]*z2r-this.b2[1]*z2i;
      const ni=this.b0[1]+this.b1[0]*z1i+this.b1[1]*z1r+this.b2[0]*z2i+this.b2[1]*z2r;
      const dr=1+this.a1[0]*z1r-this.a1[1]*z1i+this.a2[0]*z2r-this.a2[1]*z2i;
      const di=this.a1[0]*z1i+this.a1[1]*z1r+this.a2[0]*z2i+this.a2[1]*z2r;
      return divide(nr,ni,dr,di);
    }
  }
  class Lowpass{
    constructor(fs,fc,q){const w=TWO_PI*fc/fs,c=Math.cos(w),a=Math.sin(w)/(2*q),a0=1+a;this.b0=(1-c)/2/a0;this.b1=(1-c)/a0;this.b2=this.b0;this.a1=-2*c/a0;this.a2=(1-a)/a0;this.z1=0;this.z2=0;}
    process(x){const y=this.b0*x+this.z1;this.z1=this.b1*x-this.a1*y+this.z2;this.z2=this.b2*x-this.a2*y;return y;}
    prime(dc){this.z1=dc*(1-this.b0);this.z2=dc*(this.b2-this.a2);}
  }
  class Detector{
    constructor(fs,dc=1){this.p1=new Lowpass(fs,3000,.541196100146);this.p2=new Lowpass(fs,3000,1.306562964876);this.p1.prime(dc);this.p2.prime(dc);this.value=dc;this.hp=0;this.previous=dc;this.dcDecay=Math.exp(-TWO_PI*30/(fs/10));}
    process(r,i){this.value=this.p2.process(this.p1.process(Math.hypot(r,i)));return this.value;}
    audio(){this.hp=this.dcDecay*(this.hp+this.value-this.previous);this.previous=this.value;return this.hp/MU;}
  }
  class Receiver{
    constructor(fs=48000){
      this.fs=fs;this.factor=10;this.rfRate=fs*this.factor;this.f0=1000000;this.targetF0=this.f0;this.bandwidth=10000;this.targetBandwidth=10000;
      this.branches=CARRIERS.map(f=>new RFBranch(fs,f,this.f0,this.bandwidth));
      this.osc=CARRIERS.map(f=>({r:1,i:0,c:Math.cos(TWO_PI*(f-REFERENCE)/this.rfRate),s:Math.sin(TWO_PI*(f-REFERENCE)/this.rfRate)}));
      this.detector=new Detector(this.rfRate,1);this.bypassDetector=new Detector(this.rfRate,1.57);
      this.buffers=[];this.indices=[0,0,0];this.active=[true,true,true];this.previousX=[1,1,1];this.previousR=this.branches.map(b=>b.re);this.previousI=this.branches.map(b=>b.im);
      this.lastMessages=[0,0,0];this.lastR=[0,0,0];this.lastI=[0,0,0];this.count=0;
      this.rfR=new Float32Array(4096);this.rfI=new Float32Array(4096);this.filteredR=new Float32Array(4096);this.filteredI=new Float32Array(4096);this.rfIndex=0;
      this.demod=new Float32Array(1024);this.bypass=new Float32Array(1024);this.source=new Float32Array(1024);this.sourceChannels=CARRIERS.map(()=>new Float32Array(1024));this.audioIndex=0;
    }
    setBuffers(buffers){this.buffers=buffers;this.reset();}
    reset(){this.indices=[0,0,0];this.count=0;this.branches.forEach(b=>b.reset());this.previousX=[1,1,1];this.previousR=this.branches.map(b=>b.re);this.previousI=this.branches.map(b=>b.im);this.osc.forEach(o=>{o.r=1;o.i=0;});this.detector=new Detector(this.rfRate,1);this.bypassDetector=new Detector(this.rfRate,1.57);this.audioIndex=0;this.rfIndex=0;}
    tune(f0,bandwidth=this.bandwidth){this.targetF0=f0;this.targetBandwidth=bandwidth;}
    updateBlock(frames=128){const k=1-Math.exp(-frames/this.fs/.025);this.f0+=(this.targetF0-this.f0)*k;this.bandwidth+=(this.targetBandwidth-this.bandwidth)*k;this.branches.forEach(b=>b.update(this.f0,this.bandwidth));}
    message(index){
      const buffer=this.buffers[index];if(!buffer||!this.active[index])return 0;
      let at=this.indices[index], value=buffer[at];const fade=Math.min(Math.floor(.08*this.fs),Math.floor(buffer.length/8));
      if(at>=buffer.length-fade){const blend=(at-(buffer.length-fade))/fade;value=value*(1-blend)+buffer[at-(buffer.length-fade)]*blend;}
      at++;if(at>=buffer.length)at=fade;this.indices[index]=at;return value;
    }
    processFrame(){
      let sources=0;
      for(let j=0;j<3;j++){
        const m=this.message(j);sources+=m;this.lastMessages[j]=m;
        const input=this.active[j]?1+MU*m:0;this.branches[j].process(input);this.lastR[j]=this.branches[j].re;this.lastI[j]=this.branches[j].im;
      }
      for(let sub=1;sub<=this.factor;sub++){
        const a=sub/this.factor;let rawR=0,rawI=0,outR=0,outI=0;
        for(let j=0;j<3;j++){
          const o=this.osc[j],x=(this.active[j]?1+MU*this.lastMessages[j]:0)*a+this.previousX[j]*(1-a);
          const fr=this.lastR[j]*a+this.previousR[j]*(1-a),fi=this.lastI[j]*a+this.previousI[j]*(1-a);
          rawR+=x*o.r;rawI+=x*o.i;outR+=fr*o.r-fi*o.i;outI+=fr*o.i+fi*o.r;
          const nr=o.r*o.c-o.i*o.s;o.i=o.r*o.s+o.i*o.c;o.r=nr;
        }
        this.detector.process(outR,outI);this.bypassDetector.process(rawR,rawI);
        const ri=this.rfIndex;this.rfR[ri]=rawR;this.rfI[ri]=rawI;this.filteredR[ri]=outR;this.filteredI[ri]=outI;this.rfIndex=(ri+1)&4095;
      }
      for(let j=0;j<3;j++){this.previousX[j]=this.active[j]?1+MU*this.lastMessages[j]:0;this.previousR[j]=this.lastR[j];this.previousI[j]=this.lastI[j];}
      this.filteredAudio=this.detector.audio();this.unfilteredAudio=this.bypassDetector.audio();this.originalAudio=sources/3;
      const ai=this.audioIndex;this.demod[ai]=this.filteredAudio;this.bypass[ai]=this.unfilteredAudio;this.source[ai]=this.originalAudio;for(let j=0;j<3;j++)this.sourceChannels[j][ai]=this.lastMessages[j];this.audioIndex=(ai+1)&1023;this.count++;
      if((this.count&4095)===0)this.osc.forEach(o=>{const norm=Math.hypot(o.r,o.i);o.r/=norm;o.i/=norm;});
    }
    ordered(buffer,index){const a=new Float32Array(buffer.length);a.set(buffer.subarray(index));a.set(buffer.subarray(0,index),buffer.length-index);return a;}
    snapshot(){return {time:this.count/this.fs,f0:this.f0,bandwidth:this.bandwidth,messages:this.lastMessages.slice(),branchR:this.lastR.slice(),branchI:this.lastI.slice(),positions:this.indices.slice(),rfRate:this.rfRate,
      rfR:this.ordered(this.rfR,this.rfIndex),rfI:this.ordered(this.rfI,this.rfIndex),filteredR:this.ordered(this.filteredR,this.rfIndex),filteredI:this.ordered(this.filteredI,this.rfIndex),
      demod:this.ordered(this.demod,this.audioIndex),bypass:this.ordered(this.bypass,this.audioIndex),source:this.ordered(this.source,this.audioIndex),sources:this.sourceChannels.map(a=>this.ordered(a,this.audioIndex))};}
  }
  return {Receiver,RFBranch,transfer,resonance,capacitance,L,CARRIERS,REFERENCE,MU};
});
