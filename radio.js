'use strict';
(() => {
  const $=id=>document.getElementById(id), DSP=window.RadioDSP, tracks=window.RadioAudioAssets||[];
  const colors=['#c76a38','#168478','#7764bf'],ink='#223b3a',muted='#7a8d86',grid='#e5ece5';
  const fmt=(v,d=1)=>v.toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const timeText=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  let C=DSP.capacitance(1e6),bandwidth=10000,monitor='radio',sourceIndex=-1,context,node,volume,ready=false,starting=false,running=false,zoom=false,packet=null,spectra=null,guideIndex=-1,guideTimer=0,lastPaint=0,lastPacketAt=0;
  const guides=[
    {mode:'source',source:0,f:1e6,b:1e4,seconds:7,text:'1 / Este es Todo Cambia antes de modular. Las otras dos emisoras siguen transmitiendo: sólo cambiaste el punto donde escuchás.'},
    {mode:'antenna',f:1e6,b:1e4,seconds:7,text:'2 / En la antena ya están las tres señales AM juntas. Se observan sus ondas, pero no se oye música: todavía están en radiofrecuencia.'},
    {mode:'lc',f:1e6,b:1e4,seconds:7,text:'3 / El LC favorece la banda de 1.000 kHz. Sigue siendo RF: filtrar todavía no recuperó el sonido.'},
    {mode:'radio',f:1e6,b:1e4,seconds:10,text:'4 / Después del detector, se escucha This Love. La música se recupera de la envolvente de la señal filtrada.'},
    {mode:'radio',f:9e5,b:1e4,seconds:10,text:'5 / Aumentamos C: f₀ baja a 900 kHz y predomina Todo Cambia. Las amplitudes recibidas por la antena no cambiaron.'},
    {mode:'radio',f:11e5,b:1e4,seconds:10,text:'6 / Disminuimos C: f₀ sube a 1.100 kHz y predomina el tercer audio. Las tres músicas continúan en sus portadoras.'},
    {mode:'bypass',f:1e6,b:1e4,seconds:10,text:'7 / Omitimos el LC, pero conservamos el detector. Ahora todas las emisoras llegan juntas al detector y sus músicas se interfieren.'},
    {mode:'radio',f:1e6,b:4000,seconds:9,text:'8 / Volvemos a This Love con una banda de 4 kHz: se atenúan también las bandas laterales más alejadas. El sonido pierde agudos.'}
  ];
  const probes={
    source:{symbol:'♫',title:()=>sourceIndex<0?'Escuchás los tres audios antes de modular.':`Escuchás el audio original de ${tracks[sourceIndex].title}.`,description:'Este punto está en los transmisores, antes de AM. Cambiar C no cambia estas músicas; las tres emisoras siguen activas.',scope:'AUDIO ANTES DE MODULAR'},
    antenna:{symbol:'∿',title:()=> 'Observás la mezcla RF en la antena.',description:'Las tres portadoras AM están presentes. No oís música porque están en 900–1.100 kHz: el sonido sólo se recupera al demodular.',scope:'TENSIÓN RF EN ANTENA'},
    lc:{symbol:'∿',title:()=> 'Observás la RF que salió del LC.',description:'Una banda tiene mayor amplitud y las otras están atenuadas. Todavía es radiofrecuencia, así que este punto no reproduce música.',scope:'TENSIÓN RF DESPUÉS DEL LC'},
    radio:{symbol:'♫',title:()=> 'Escuchás después de demodular.',description:'El detector extrae la envolvente de la mezcla que salió del LC. Al cambiar C, cambia qué música predomina.',scope:'SONIDO RECUPERADO'},
    bypass:{symbol:'≋',title:()=> 'Escuchás el detector sin selección de banda.',description:'Las tres emisoras llegan juntas al mismo detector AM. Se mezclan e interfieren. Cambiar C no afecta esta ruta, porque omitimos el LC.',scope:'DETECTOR AM SIN FILTRO LC'}
  };
  $('stations').innerHTML=tracks.map((t,i)=>`<article class="station" style="--station-color:${t.color}"><div class="station-head"><span>${['A','B','C'][i]} · ${fmt(t.frequency/1000,0)} kHz</span><small id="position-${i}">00:00</small></div><button class="station-tune" data-station="${i}" aria-label="Sintonizar ${t.title} en ${t.frequency/1000} kHz"><strong>${t.title}</strong><span>${t.artist}</span></button><div class="station-meter-row"><span>Salida de portadora</span><div class="station-meter"><i id="station-meter-${i}"></i></div><span class="station-percent" id="station-percent-${i}"></span></div><div class="station-footer"><button class="original-button" data-original="${i}">♫ Oír original</button><small>${timeText(t.duration)} · en bucle</small></div></article>`).join('');
  $('trim-notes').innerHTML='<p><strong>Recortes:</strong></p><ul>'+tracks.map(t=>`<li>${t.title}: inicio ${fmt(t.trimStart,2)} s; final ${fmt(t.originalDuration-t.trimEnd,2)} s. Duración útil ${timeText(t.duration)}. Se quita únicamente silencio en los extremos; los silencios internos se conservan.</li>`).join('')+'</ul>';
  function f0(){return DSP.resonance(C);}
  function send(message){if(node)node.port.postMessage(message);}
  function updateTuning(){
    const f=f0();$('f0-number').textContent=fmt(f/1000);$('capacitor-number').value=C*1e12;$('capacitor-number').value=(C*1e12).toFixed(1);$('capacitor').value=C*1e12;
    $('r-number').textContent=fmt(2*Math.PI*DSP.L*bandwidth,2)+' Ω';
    const gains=tracks.map(t=>DSP.transfer(t.frequency,f,bandwidth).amplitude),best=gains.indexOf(Math.max(...gains));
    tracks.forEach((t,i)=>{$(`station-meter-${i}`).style.width=`${gains[i]*100}%`;$(`station-percent-${i}`).textContent=fmt(gains[i]*100,1)+'%';document.querySelectorAll('.station')[i].classList.toggle('dominant',i===best);});
    $('tuning-observation').textContent=gains[best]>.65?`Predomina ${['A','B','C'][best]}: ${tracks[best].title}. La entrada de la antena sigue siendo la misma.`:`Estás entre emisoras. Baja la respuesta; la antena sigue recibiendo las tres señales.`;
    $('band-note').textContent=bandwidth===4000?'La banda es menor que los ≈6 kHz de cada señal AM: atenúa también sus agudos.':bandwidth===200000?'La banda abarca otras emisoras: sus músicas interfieren más después del detector.':bandwidth===60000?'Pasan más frecuencias alejadas de f₀. Se pierde selectividad.':'Incluye las bandas laterales de audio. Cerca de f₀ la respuesta es mayor.';
    send({type:'tune',f0:f,bandwidth});
  }
  function setMonitor(mode,index=-1){monitor=mode;sourceIndex=index;const p=probes[mode];document.querySelectorAll('[data-monitor]').forEach(b=>{const on=b.dataset.monitor===mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});$('listen-symbol').textContent=p.symbol;$('listen-title').textContent=p.title();$('listen-description').textContent=p.description;$('scope-title').textContent=p.scope;$('scope-scale').textContent=['antenna','lc'].includes(mode)?'20 μs · escala fija · RF real':'21,3 ms · escala fija';send({type:'monitor',mode,source:index});}
  function setFrequency(f){C=DSP.capacitance(f);updateTuning();}
  function stopGuide(){guideIndex=-1;$('guide-message').hidden=true;$('guide').textContent='▷ Recorrido guiado';}
  function guideStep(){
    const g=guides[guideIndex];if(!g){stopGuide();bandwidth=10000;$('bandwidth').value=bandwidth;setFrequency(1e6);setMonitor('radio');return;}
    bandwidth=g.b;$('bandwidth').value=bandwidth;setFrequency(g.f);setMonitor(g.mode,g.source??-1);$('guide-message').hidden=false;$('guide-message').textContent=g.text;guideTimer=context.currentTime+g.seconds;
  }
  const workletCode=()=>`const DSP=(${window.RadioDSPFactory})();
  class RadioProcessor extends AudioWorkletProcessor {
    constructor(){super();this.engine=new DSP.Receiver(sampleRate);this.loaded=false;this.mode='radio';this.source=-1;this.weights=[1,0,0];this.lastMessage=0;
      this.port.onmessage=event=>{const m=event.data;if(m.type==='buffers'){this.engine.setBuffers(m.buffers);this.loaded=true;this.port.postMessage({type:'ready'});}if(m.type==='tune')this.engine.tune(m.f0,m.bandwidth);if(m.type==='monitor'){this.mode=m.mode;this.source=m.source;}if(m.type==='restart'){this.engine.reset();}};
    }
    process(inputs,outputs){const out=outputs[0][0];if(!this.loaded){out.fill(0);return true;}this.engine.updateBlock(out.length);const targets=[this.mode==='radio'?1:0,this.mode==='bypass'?1:0,this.mode==='source'?1:0];let peak=0;
      for(let k=0;k<out.length;k++){this.engine.processFrame();for(let j=0;j<3;j++)this.weights[j]+=(targets[j]-this.weights[j])*.001;const src=this.source<0?this.engine.originalAudio:this.engine.lastMessages[this.source];const v=.6*(this.engine.filteredAudio*this.weights[0]+this.engine.unfilteredAudio*this.weights[1]+src*this.weights[2]);out[k]=v;peak=Math.max(peak,Math.abs(v));}
      if(this.engine.count-this.lastMessage>=sampleRate/10){const data=this.engine.snapshot();data.type='snapshot';data.outputPeak=peak;const transfer=[data.rfR.buffer,data.rfI.buffer,data.filteredR.buffer,data.filteredI.buffer,data.demod.buffer,data.bypass.buffer,data.source.buffer,...data.sources.map(a=>a.buffer)];this.port.postMessage(data,transfer);this.lastMessage=this.engine.count;}return true;
    }
  }registerProcessor('radio-physical-am',RadioProcessor);`;
  async function startAudio(){
    if(starting)return;starting=true;$('radio-play').disabled=true;
    try{
      if(!context){context=new AudioContext({sampleRate:48000,latencyHint:'interactive'});await context.resume();if(!context.audioWorklet)throw new Error('Usá Chrome o Edge para abrir el laboratorio; este navegador no ofrece AudioWorklet.');
        $('engine-state').textContent='Preparando señales';$('radio-status').textContent='Cargando y modulando tus tres audios…';
        // A data URL also works on file://, where blob:null worklets are rejected.
        await context.audioWorklet.addModule('data:application/javascript;charset=utf-8,'+encodeURIComponent(workletCode()));
        node=new AudioWorkletNode(context,'radio-physical-am',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
        volume=context.createGain();volume.gain.value=+$('volume').value;node.connect(volume).connect(context.destination);
        node.onprocessorerror=()=>{$('radio-status').textContent='El procesador de audio se detuvo. Recargá la página para reiniciar.';running=false;updatePlaybackUI();};
        node.port.onmessage=event=>{if(event.data.type==='snapshot'){packet=event.data;lastPacketAt=performance.now();spectra={input:fft(packet.rfR,packet.rfI),output:fft(packet.filteredR,packet.filteredI)};}if(event.data.type==='ready')ready=true;};
        const buffers=[];
        for(let i=0;i<tracks.length;i++){
          $('radio-status').textContent=`Preparando emisora ${i+1} de 3: ${tracks[i].title}…`;
          const binary=atob(tracks[i].base64),bytes=new Uint8Array(binary.length);for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);
          const decoded=await context.decodeAudioData(bytes.buffer);const samples=decoded.getChannelData(0).slice();let peak=0;for(let j=0;j<samples.length;j++)peak=Math.max(peak,Math.abs(samples[j]));const scale=peak>0?.95/peak:1;for(let j=0;j<samples.length;j++)samples[j]*=scale;buffers.push(samples);
        }
        node.port.postMessage({type:'buffers',buffers},buffers.map(a=>a.buffer));updateTuning();setMonitor(monitor,sourceIndex);
      }
      await context.resume();running=true;$('radio-status').textContent='Las tres emisoras están activas. Cambiá C o elegí un punto de escucha.';updatePlaybackUI();
    }catch(e){$('radio-status').textContent=e.message;running=false;if(context){await context.close().catch(()=>{});context=null;node=null;ready=false;}updatePlaybackUI();}
    finally{starting=false;$('radio-play').disabled=false;}
  }
  function updatePlaybackUI(){$('radio-play').textContent=running?'Ⅱ Pausar experimento':context?'▶ Continuar experimento':'▶ Iniciar experimento';$('engine-state').textContent=running?'Tres emisoras en el aire':context?'Experimento en pausa':'Listo para iniciar';document.querySelector('.live-status').classList.toggle('running',running);}
  $('radio-play').onclick=async()=>{if(running){await context.suspend();running=false;updatePlaybackUI();}else await startAudio();};
  $('radio-restart').onclick=()=>{send({type:'restart'});packet=null;spectra=null;stopGuide();};
  $('capacitor').oninput=e=>{stopGuide();C=+e.target.value*1e-12;updateTuning();};
  $('capacitor-number').onchange=e=>{const value=+e.target.value;if(!Number.isFinite(value)||value<200||value>340){updateTuning();return;}stopGuide();C=value*1e-12;updateTuning();};
  $('bandwidth').onchange=e=>{stopGuide();bandwidth=+e.target.value;updateTuning();};
  $('volume').oninput=e=>{const value=+e.target.value;$('volume-value').textContent=Math.round(value*100)+'%';if(volume)volume.gain.setTargetAtTime(value,context.currentTime,.015);};
  $('stations').onclick=e=>{const tune=e.target.closest('[data-station]'),original=e.target.closest('[data-original]');if(tune){stopGuide();setFrequency(tracks[+tune.dataset.station].frequency);}if(original){stopGuide();setMonitor('source',+original.dataset.original);}};
  document.querySelectorAll('[data-monitor]').forEach(button=>button.onclick=()=>{stopGuide();setMonitor(button.dataset.monitor);});
  $('spectrum-wide').onclick=()=>{zoom=false;$('spectrum-wide').classList.add('selected');$('spectrum-zoom').classList.remove('selected');$('spectrum-wide').setAttribute('aria-pressed','true');$('spectrum-zoom').setAttribute('aria-pressed','false');};
  $('spectrum-zoom').onclick=()=>{zoom=true;$('spectrum-zoom').classList.add('selected');$('spectrum-wide').classList.remove('selected');$('spectrum-wide').setAttribute('aria-pressed','false');$('spectrum-zoom').setAttribute('aria-pressed','true');};
  $('guide').onclick=async()=>{if(guideIndex>=0){stopGuide();return;}if(!running)await startAudio();if(!running)return;guideIndex=0;$('guide').textContent='■ Detener recorrido';guideStep();};
  function fft(real,imag){
    const N=real.length,r=new Float64Array(N),im=new Float64Array(N);let weight=0;
    for(let i=0;i<N;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(N-1));r[i]=real[i]*w;im[i]=imag[i]*w;weight+=w;}
    for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[r[i],r[j]]=[r[j],r[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let len=2;len<=N;len<<=1){const angle=-2*Math.PI/len,cr=Math.cos(angle),ci=Math.sin(angle);for(let i=0;i<N;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const a=i+j,b=a+len/2,vr=r[b]*wr-im[b]*wi,vi=r[b]*wi+im[b]*wr;r[b]=r[a]-vr;im[b]=im[a]-vi;r[a]+=vr;im[a]+=vi;const nr=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=nr;}}}
    const amplitudes=new Float32Array(N);for(let i=0;i<N;i++)amplitudes[i]=Math.hypot(r[i],im[i])/weight;return amplitudes;
  }
  function canvas(id){const el=$(id),bounds=el.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);const w=Math.round(bounds.width),h=Math.round(bounds.height);if(el.width!==Math.round(w*dpr)||el.height!==Math.round(h*dpr)){el.width=Math.round(w*dpr);el.height=Math.round(h*dpr);}const ctx=el.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return {ctx,w,h};}
  function drawSpectrum(){
    const {ctx,w,h}=canvas('spectrum'),left=44,right=w-25,top=28,bottom=h-44,span=right-left,low=zoom?f0()-15000:850000,high=zoom?f0()+15000:1150000;
    const xx=f=>left+(f-low)/(high-low)*span,yy=a=>bottom-a/1.8*(bottom-top);ctx.font='10px Segoe UI, Arial';ctx.fillStyle=muted;
    const q=f0()/bandwidth,lo=f0()*(Math.sqrt(4+1/(q*q))-1/q)/2,hi=f0()*(Math.sqrt(4+1/(q*q))+1/q)/2;
    ctx.fillStyle='#e5f2e9';ctx.fillRect(Math.max(left,xx(lo)),top,Math.max(0,Math.min(right,xx(hi))-Math.max(left,xx(lo))),bottom-top);
    [0,.5,1,1.5].forEach(a=>{ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,yy(a));ctx.lineTo(right,yy(a));ctx.stroke();ctx.fillStyle=muted;ctx.textAlign='right';ctx.fillText(fmt(a,1),left-10,yy(a)+3);});
    ctx.fillStyle=muted;ctx.textAlign='left';ctx.fillText('Amplitud relativa',left,15);
    const ticks=zoom?[low,low+7500,f0(),f0()+7500,high]:[850000,900000,950000,1000000,1050000,1100000,1150000];
    ticks.forEach((f,i)=>{if(w<440&&!zoom&&i%2===0)return;ctx.fillStyle=tracks.find(t=>Math.abs(t.frequency-f)<2)?.color||muted;ctx.textAlign='center';ctx.fillText(fmt(f/1000,zoom?1:0),xx(f),bottom+19);});
    ctx.textAlign='right';ctx.fillStyle=muted;ctx.fillText('Frecuencia (kHz)',right,h-5);
    ctx.save();ctx.beginPath();ctx.rect(left,top-7,span,bottom-top+8);ctx.clip();
    ctx.strokeStyle='#168478';ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.beginPath();for(let k=0;k<=500;k++){const f=low+(high-low)*k/500,y=yy(DSP.transfer(f,f0(),bandwidth).amplitude);k?ctx.lineTo(xx(f),y):ctx.moveTo(xx(f),y);}ctx.stroke();ctx.setLineDash([]);
    if(spectra){
      const N=spectra.input.length,rfRate=packet.rfRate;const points=[];for(let j=-N/2;j<N/2;j++){const f=DSP.REFERENCE+j*rfRate/N;if(f>=low&&f<=high)points.push({f,index:(j+N)%N});}
      ctx.strokeStyle='#a6b5a9';ctx.lineWidth=1.2;ctx.beginPath();points.forEach(({f,index},j)=>{const y=yy(spectra.input[index]);j?ctx.lineTo(xx(f),y):ctx.moveTo(xx(f),y);});ctx.stroke();
      for(let station=0;station<3;station++){
        const selected=points.filter(p=>Math.abs(p.f-tracks[station].frequency)<40000);ctx.strokeStyle=colors[station];ctx.lineWidth=1.7;ctx.beginPath();selected.forEach(({f,index},j)=>{const y=yy(spectra.output[index]);j?ctx.lineTo(xx(f),y):ctx.moveTo(xx(f),y);});ctx.stroke();
      }
    }else{tracks.forEach((t,i)=>{if(t.frequency<low||t.frequency>high)return;ctx.strokeStyle='#a6b5a9';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(xx(t.frequency)-2,bottom);ctx.lineTo(xx(t.frequency)-2,yy(1));ctx.stroke();ctx.strokeStyle=colors[i];ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(xx(t.frequency)+2,bottom);ctx.lineTo(xx(t.frequency)+2,yy(DSP.transfer(t.frequency,f0(),bandwidth).amplitude));ctx.stroke();});}
    ctx.strokeStyle=colors[1];ctx.lineWidth=1;ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(xx(f0()),top);ctx.lineTo(xx(f0()),bottom);ctx.stroke();ctx.setLineDash([]);ctx.restore();ctx.textAlign='center';ctx.fillStyle=colors[1];ctx.fillText('f₀',Math.max(left+15,Math.min(right-15,xx(f0()))),top-10);
    $('spectrum-caption').textContent=monitor==='bypass'?'El gráfico sigue mostrando el LC para comparar: la rama «Sin filtro LC» lleva la mezcla de entrada directamente al detector.':zoom?'Las bandas laterales llevan la música: el filtro debe abarcar también esas frecuencias.':'La banda sombreada se mueve con C. Las otras señales conservan una respuesta menor.';
  }
  function drawScope(){
    const {ctx,w,h}=canvas('audio-scope'),left=17,right=w-17,center=h/2;
    ctx.strokeStyle=grid;ctx.lineWidth=1;[center,h*.25,h*.75].forEach(y=>{ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();});
    ctx.beginPath();ctx.strokeStyle=['antenna','lc'].includes(monitor)?ink:monitor==='bypass'?colors[2]:colors[1];ctx.lineWidth=1.5;
    if(['antenna','lc'].includes(monitor)){
      const count=Math.max(500,Math.floor(w*2));for(let k=0;k<=count;k++){const t=(packet?.time||0)+(k/count-.5)*20e-6;let v=0;tracks.forEach((track,j)=>{const phase=2*Math.PI*track.frequency*t;const message=packet?.messages[j]||0;const hr=packet?.branchR[j]??DSP.transfer(track.frequency,f0(),bandwidth).re,hi=packet?.branchI[j]??DSP.transfer(track.frequency,f0(),bandwidth).im;v+=monitor==='antenna'?(1+DSP.MU*message)*Math.cos(phase):hr*Math.cos(phase)-hi*Math.sin(phase);});const x=left+(right-left)*k/count,y=center-v/5.5*(h*.43);k?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    }else{
      const samples=packet?(monitor==='radio'?packet.demod:monitor==='bypass'?packet.bypass:sourceIndex<0?packet.source:packet.sources[sourceIndex]):null;
      if(samples){for(let k=0;k<samples.length;k++){const x=left+(right-left)*k/(samples.length-1),y=center-samples[k]/3*(h*.43);k?ctx.lineTo(x,y):ctx.moveTo(x,y);}}else{ctx.moveTo(left,center);ctx.lineTo(right,center);}
    }ctx.stroke();
  }
  const svgText=(x,y,s,size=15,c=ink,anchor='start')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${c}" text-anchor="${anchor}">${s}</text>`;
  function drawCircuit(now){
    const mobile=matchMedia('(max-width:800px)').matches;
    const gains=tracks.map(t=>DSP.transfer(t.frequency,f0(),bandwidth).amplitude),best=gains.indexOf(Math.max(...gains)),theta=now/1000*2*Math.PI*.55+(packet?Math.atan2(packet.branchI[best],packet.branchR[best]):0),mag=Math.min(1.5,gains[best]),q=Math.sin(theta)*mag,current=Math.cos(theta)*mag;
    const qOpacity=Math.abs(q),iOpacity=Math.abs(current),selected=colors[best];
    let s=`<defs><marker id="route-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="${muted}"/></marker></defs>`;
    s+=`<path d="M58 89V53M36 37L58 58L80 37M44 102H72M49 110H67M54 118H62" fill="none" stroke="${ink}" stroke-width="2.4"/><path d="M83 84H114" fill="none" stroke="${muted}" stroke-width="1.5" marker-end="url(#route-arrow)"/>`;
    s+=`<path d="M134 62H213M333 62H441M464 62H579V88M579 128V166H134V124M134 87V62" fill="none" stroke="${ink}" stroke-width="2.3"/><circle cx="134" cy="106" r="19" fill="white" stroke="${ink}" stroke-width="2.3"/><path d="M121 108Q125 90 131 108Q135 120 144 103" fill="none" stroke="${ink}" stroke-width="1.5"/>`;
    for(let j=0;j<3;j++)s+=`<ellipse cx="273" cy="62" rx="${68+j*13}" ry="${19+j*11}" stroke="${selected}" fill="none" stroke-width="1.3" opacity="${Math.min(.6,iOpacity*(.5-j*.1))}"/>`;
    s+=`<path d="M213 62${Array(5).fill('q0 -23 12 -23q12 0 12 23').join('')}" fill="none" stroke="${ink}" stroke-width="2.7"/>`;
    s+=`<rect x="442" y="38" width="21" height="49" fill="${selected}" opacity="${qOpacity*.07}"/><path d="M441 32V92M464 32V92" stroke="${ink}" stroke-width="3.5"/>`;
    for(let j=0;j<3;j++){const y=45+j*17;s+=svgText(430,y+4,q>=0?'+':'−',15,selected,'middle').replace('<text','<text opacity="'+Math.min(1,qOpacity)+'"');s+=svgText(475,y+4,q>=0?'−':'+',15,selected,'middle').replace('<text','<text opacity="'+Math.min(1,qOpacity)+'"');s+=`<path d="M${q>=0?447:458} ${y}H${q>=0?458:447}" stroke="${selected}" opacity="${Math.min(1,qOpacity)}" marker-end="url(#route-arrow)"/>`;}
    s+=`<path d="M579 88l-7 5 14 6-14 6 14 6-14 6 7 5v6" fill="none" stroke="${muted}" stroke-width="2.3"/>`;
    for(let j=0;j<4;j++)s+=`<circle cx="${173+j*9+8*Math.sin(theta)}" cy="62" r="2.5" fill="${selected}" opacity="${Math.min(1,iOpacity)}"/>`;
    s+=svgText(58,144,'Antena',13,muted,'middle')+svgText(273,18,'L · 100 μH',14,ink,'middle')+svgText(452,18,`C · ${fmt(C*1e12,1)} pF`,15,colors[1],'middle')+svgText(599,112,'R',14,muted)+svgText(368,191,'Salida sobre R · corriente mayor cerca de f₀',12,muted,'middle');
    s+=`<path d="M579 62H660" stroke="${muted}" stroke-width="1.5" marker-end="url(#route-arrow)"/>`+svgText(624,52,'RF',12,muted,'middle');
    s+=`<rect x="677" y="37" width="137" height="71" rx="7" fill="${monitor==='bypass'?'#f1eef8':'#eef5ef'}" stroke="${grid}"/>`+svgText(745,68,'Detector AM',15,ink,'middle')+svgText(745,92,'Envolvente → audio',11,muted,'middle');
    s+=`<path d="M826 73H880" stroke="${muted}" stroke-width="1.5" marker-end="url(#route-arrow)"/><path d="M895 58h13l22 -15v57l-22 -15h-13Zm47 -8q24 21 0 42" fill="none" stroke="${ink}" stroke-width="2.5"/>`+svgText(924,132,'Parlante',13,muted,'middle');
    if(monitor==='bypass')s+=`<path d="M134 167V205H744V121" stroke="${colors[2]}" fill="none" stroke-width="2" stroke-dasharray="5 5" marker-end="url(#route-arrow)"/>`+svgText(757,188,'Sin LC',12,colors[2]);
    if(mobile){
      s=`<path d="M80 65H177M297 65H415M443 65H600V95M600 149V188H80V142M80 86V65" fill="none" stroke="${ink}" stroke-width="3"/><circle cx="80" cy="114" r="28" fill="white" stroke="${ink}" stroke-width="3"/><path d="M62 114q9 -25 18 0t18 0" fill="none" stroke="${ink}" stroke-width="2"/>`;
      for(let j=0;j<3;j++)s+=`<ellipse cx="237" cy="65" rx="${68+j*15}" ry="${21+j*12}" stroke="${selected}" fill="none" stroke-width="2" opacity="${Math.min(.6,iOpacity*(.5-j*.1))}"/>`;
      s+=`<path d="M177 65${Array(5).fill('q0 -26 12 -26q12 0 12 26').join('')}" fill="none" stroke="${ink}" stroke-width="3.5"/><path d="M415 31V99M443 31V99" stroke="${ink}" stroke-width="4.5"/><path d="M600 95l-10 6 20 9-20 9 20 9-20 9 10 7v5" stroke="${muted}" stroke-width="3" fill="none"/>`;
      s+=svgText(237,21,'L · 100 μH',23,ink,'middle')+svgText(429,21,`C · ${fmt(C*1e12,1)} pF`,23,colors[1],'middle')+svgText(630,128,'R',24,muted)+svgText(80,229,'Antena',24,muted,'middle')+svgText(434,229,'Salida sobre R',23,muted,'middle');
      for(let j=0;j<3;j++){const y=44+j*22;s+=svgText(399,y+8,q>=0?'+':'−',24,selected,'middle').replace('<text','<text opacity="'+Math.min(1,qOpacity)+'"')+svgText(458,y+8,q>=0?'−':'+',24,selected,'middle').replace('<text','<text opacity="'+Math.min(1,qOpacity)+'"');}
      for(let j=0;j<4;j++)s+=`<circle cx="${117+j*10+8*Math.sin(theta)}" cy="65" r="3" fill="${selected}" opacity="${Math.min(1,iOpacity)}"/>`;
      s+=svgText(360,281,monitor==='bypass'?'Antena → detector AM → audio (sin LC)':'Antena → LC → detector AM → audio',25,monitor==='bypass'?colors[2]:ink,'middle');
    }
    $('live-circuit').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${mobile?'720 315':'1000 220'}" role="img" aria-label="Circuito RLC serie y detector AM" style="font-family:Segoe UI,Arial,sans-serif">${s}</svg>`;
  }
  function updateReadouts(){
    if(packet){$('elapsed').textContent=timeText(packet.time);tracks.forEach((t,i)=>$(`position-${i}`).textContent=timeText(packet.positions[i]/48000));}
    const audible=!['antenna','lc'].includes(monitor),samples=packet?(monitor==='radio'?packet.demod:monitor==='bypass'?packet.bypass:sourceIndex<0?packet.source:packet.sources[sourceIndex]):null;
    const rms=audible&&samples&&running?Math.sqrt(samples.reduce((a,v)=>a+v*v,0)/samples.length)*.6*+$('volume').value:0;
    $('level-bar').style.width=Math.min(100,rms*650)+'%';$('audio-level').textContent=rms>1e-6?fmt(20*Math.log10(rms),1)+' dBFS':'−∞ dBFS';
  }
  function paint(now){
    if(now-lastPaint>1000/24){drawSpectrum();drawScope();drawCircuit(running?now:(packet?.time||0)*1000);updateReadouts();lastPaint=now;}
    if(guideIndex>=0&&running&&context.currentTime>=guideTimer){guideIndex++;guideStep();}
    requestAnimationFrame(paint);
  }
  window.RadioLab={start:startAudio,pause:async()=>{if(context)await context.suspend();running=false;updatePlaybackUI();},tune:setFrequency,monitor:setMonitor,setBandwidth:b=>{bandwidth=b;$('bandwidth').value=b;updateTuning();},state:()=>({ready,running,monitor,sourceIndex,f0:f0(),C,bandwidth,contextState:context?.state,sampleRate:context?.sampleRate,time:packet?.time,packetAge:performance.now()-lastPacketAt,outputPeak:packet?.outputPeak,sourceRms:packet?packet.sources.map(a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length)):[],gains:tracks.map(t=>DSP.transfer(t.frequency,f0(),bandwidth).amplitude)}),snapshot:()=>packet,fft};
  updateTuning();setMonitor('radio');requestAnimationFrame(paint);
})();
