'use strict';
(() => {
  const colors = ['#c76a38', '#168478', '#7764bf'];
  const ink = '#223b3a', muted = '#7a8d86', grid = '#e5ece5';
  const frequencies = [0.5, 1, 1.5]; // MHz; display time is deliberately slowed.
  const L = 100e-6, R = 2 * Math.PI * 1e6 * L / 8;
  const durations = [6, 5, 5, 5, 10, 6, 6, 5, 6, 6];
  const starts = durations.map((_, i) => durations.slice(0, i).reduce((a, b) => a + b, 0));
  const chapters = ['Todas llegan a la vez', 'El circuito sintonizado', 'El capacitor', 'La bobina', 'La resonancia', 'Una banda de respuesta', 'Antes y después', 'Dentro de una radio', 'Cambiar la sintonía', 'La idea esencial'];
  const titles = ['La antena recibe todas las señales.', 'La señal induce tensión y corriente.', 'El capacitor almacena energía eléctrica.', 'La bobina almacena energía magnética.', 'Cerca de f₀, la respuesta es mucho mayor.', 'La resonancia tiene un ancho de banda.', 'La mezcla entra. Una banda predomina.', 'Seleccionar y demodular son pasos distintos.', 'Cambiar C desplaza la resonancia.', 'La selección es una respuesta física.'];
  const captions = ['Todas llegan simultáneamente: sus tensiones se superponen en la antena.', 'L y C fijan f₀. La carga y las pérdidas R limitan la respuesta.', 'La carga y el campo se invierten. A mayor frecuencia, menor X꜀.', 'La corriente crea un campo magnético. A mayor frecuencia, mayor Xₗ.', 'En resonancia, la energía oscila eficientemente entre L y C.', 'El circuito favorece una banda alrededor de la resonancia.', 'Las frecuencias alejadas se atenúan; su respuesta sigue presente.', 'El filtro selecciona primero la banda deseada.', 'Menor C → mayor f₀. Ahora predomina la señal C, en f₃.', 'Resonancia → selección de banda → demodulación'];
  const shortTitles = ['Todas llegan a la vez', 'Tensión y corriente', 'Campo eléctrico en C', 'Campo magnético en L', 'La resonancia', 'Una banda de respuesta', 'Antes y después', 'La cadena de la radio', 'Cambiar la sintonía', 'La respuesta física'];
  const shortCaptions = ['Todas llegan a la vez. Sus tensiones se suman.', 'L y C fijan f₀; R representa carga y pérdidas.', 'Mayor frecuencia → menor X꜀.', 'Mayor frecuencia → mayor Xₗ.', 'La energía oscila entre L y C.', 'Predomina una banda alrededor de f₀.', 'Las otras señales se atenúan, siguen presentes.', 'Primero selección. Después demodulación.', 'Menor C → mayor f₀. Ahora predomina f₃.', 'Resonancia → banda → demodulación'];
  const $ = id => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
  const n = v => Number(v.toFixed(2));
  const text = (x, y, value, size = 18, color = ink, anchor = 'start', weight = 400, extra = '') => `<text x="${n(x)}" y="${n(y)}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}" ${extra}>${value}</text>`;
  const line = (x1, y1, x2, y2, color = grid, width = 1, extra = '') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
  const path = (d, color = ink, width = 2, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const rect = (x,y,w,h,fill,rx=0,extra='') => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="${fill}" ${extra}/>`;
  const dot = (x,y,r,fill,extra='') => `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${fill}" ${extra}/>`;
  const group = (x,y,scale,body) => `<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})">${body}</g>`;
  const arrow = (x1,y1,x2,y2,color=muted,width=2) => line(x1,y1,x2,y2,color,width,`marker-end="url(#arrow-${color === ink ? 'ink' : color === colors[1] ? 'green' : 'gray'})"`);
  function response(f, f0 = 1) {
    const C = 1 / ((2 * Math.PI * f0 * 1e6) ** 2 * L);
    const omega = 2 * Math.PI * f * 1e6;
    const reactance = omega * L - 1 / (omega * C);
    return { amplitude: R / Math.hypot(R, reactance), phase: -Math.atan2(reactance, R) };
  }
  function wave(x,y,w,a,f,t,color,phase=0,cycles=4,opacity=1) {
    let d = '';
    for (let k=0;k<=180;k++) {
      const xx=x+w*k/180, yy=y-a*Math.sin(2*Math.PI*f*(cycles*k/180+t*.45)+phase);
      d += `${k ? 'L' : 'M'}${n(xx)},${n(yy)} `;
    }
    return path(d,color,2.5,`opacity="${opacity}"`);
  }
  function mixedWave(x,y,w,a,t,out=false,f0=1) {
    let d='';
    for(let k=0;k<=240;k++){
      let sum=0;
      frequencies.forEach(f=>{const h=out?response(f,f0):{amplitude:1,phase:0};sum+=h.amplitude*Math.sin(2*Math.PI*f*(4*k/240+t*.45)+h.phase);});
      d+=`${k?'L':'M'}${n(x+w*k/240)},${n(y-a*sum)} `;
    }
    return path(d,out?colors[1]:ink,3);
  }
  function antenna(x,y,scale=1,t=0) {
    let s=path('M0 100V20M-32 0L0 30L32 0M-18 116H18M-11 126H11M-4 136H4',ink,3);
    for(let j=0;j<3;j++)s+=path(`M${-48-j*19} ${15-j*10}Q${-76-j*22} 47 ${-48-j*19} ${78+j*10}`,colors[j],2,`opacity="${n(.35+.25*(1+Math.sin(t*1.5)))}"`);
    return group(x,y,scale,s);
  }
  function spectrum(x,y,w,h,amplitudes=[1,1,1],selected=-1,title='ESPECTRO') {
    let s=text(x,y-24,title,13,muted,'start',600,'letter-spacing="1.5"');
    s+=line(x,y+h,x+w,y+h,muted,1.5)+line(x,y,x,y+h,grid);
    frequencies.forEach((f,i)=>{
      const xx=x+w*f/1.9, a=amplitudes[i]*h*.82;
      if(selected===i)s+=rect(xx-23,y-4,46,h+9,colors[i],5,'opacity=".05"');
      s+=line(xx,y+h,xx,y+h-a,colors[i],5)+dot(xx,y+h-a,4,colors[i]);
      s+=text(xx,y+h+28,['f₁','f₂','f₃'][i],18,colors[i],'middle',selected===i?700:500);
    });
    return s+text(x+w,y+h+52,'Frecuencia',12,muted,'end');
  }
  function cap(x,y,t,scale=1) {
    const charge=-Math.cos(2*Math.PI*t*.45), mag=Math.abs(charge);
    let s=rect(-13,-69,26,138,colors[1],0,'opacity=".045"');
    s+=line(-70,0,-20,0,ink,3)+line(20,0,70,0,ink,3)+line(-20,-66,-20,66,ink,5)+line(20,-66,20,66,ink,5);
    for(let i=0;i<5;i++){
      const yy=-49+i*25;
      s+=text(-36,yy+5,charge>=0?'+':'−',18,colors[1],'middle',600,`opacity="${n(mag)}"`)+text(36,yy+5,charge>=0?'−':'+',18,colors[1],'middle',600,`opacity="${n(mag)}"`);
      s+=`<g opacity="${n(mag*.85)}">${charge>=0?arrow(-11,yy,11,yy,colors[1],1.5):arrow(11,yy,-11,yy,colors[1],1.5)}</g>`;
    }
    return group(x,y,scale,s);
  }
  function coil(x,y,t,scale=1) {
    const current=Math.sin(2*Math.PI*t*.45), mag=Math.abs(current);
    let s='';
    for(let j=0;j<4;j++)s+=`<ellipse cx="75" cy="0" rx="${89+j*12}" ry="${22+j*17}" fill="none" stroke="${colors[1]}" stroke-width="${1.2+mag}" opacity="${n(mag*(.46-j*.07))}"/>`;
    let d='M-30 0H0';for(let j=0;j<5;j++)d+=`q0 -30 15 -30q15 0 15 30`;d+='H180';
    s+=path(d,ink,3.5);
    for(let j=0;j<7;j++)s+=dot(-23+j*31-10*Math.cos(2*Math.PI*t*.45),0,3.5,colors[1],`opacity="${n(mag)}"`);
    s+=`<g opacity="${n(mag)}">${current>=0?arrow(34,71,116,71,colors[1]):arrow(116,71,34,71,colors[1])}</g>`;
    return group(x,y,scale,s);
  }
  function circuit(x,y,t,scale=1,fields=false) {
    const theta=2*Math.PI*t*.45;
    let s=path('M30 20H140M290 20H330M355 20H520V80M520 150V220H30V150M30 70V20',ink,2.8);
    s+=`<circle cx="30" cy="110" r="40" fill="white" stroke="${ink}" stroke-width="2.8"/>`+wave(7,110,46,11,1,0,ink,0,1);
    if(fields)s+=coil(140,20,t,1);else {let d='M140 20';for(let j=0;j<5;j++)d+='q0 -28 15 -28q15 0 15 28';s+=path(d,ink,3);}
    s+=line(330,-18,330,58,ink,4)+line(355,-18,355,58,ink,4);
    if(fields){const q=-Math.cos(theta);for(let j=0;j<3;j++)s+=`<g opacity="${n(Math.abs(q))}">${q>=0?arrow(335,j*18-15,350,j*18-15,colors[1],1.1):arrow(350,j*18-15,335,j*18-15,colors[1],1.1)}</g>`;}
    s+=path('M520 80l-10 6 20 9-20 9 20 9-20 9 20 9-10 10V150',muted,2.8);
    s+=dot(520,20,3.8,ink)+dot(520,220,3.8,ink)+line(520,20,567,20,ink,2)+line(520,220,567,220,ink,2);
    s+=text(215,-56,'L',24,ink,'middle',600)+text(343,-56,'C',24,ink,'middle',600)+text(545,124,'R',18,muted)+text(579,115,'V salida',16,colors[1]);
    s+=text(30,285,'V antena',16,muted,'middle')+text(325,273,'R: carga y pérdidas',13,muted,'middle');
    s+=line(253,220,253,237,ink,2)+line(234,237,272,237,ink,2)+line(240,245,266,245,ink,2)+line(247,253,259,253,ink,2);
    // Charge displacement reverses with AC. No charge crosses the capacitor dielectric.
    for(let j=0;j<6;j++){s+=dot(65+j*11-9*Math.cos(theta),20,3,colors[1],`opacity="${n(Math.abs(Math.sin(theta))*.8)}"`);s+=dot(384+j*17-9*Math.cos(theta),20,3,colors[1],`opacity="${n(Math.abs(Math.sin(theta))*.8)}"`);}
    return group(x,y,scale,s);
  }
  function plot(x,y,w,h,f0=1,t=0,animate=1,marks=true) {
    let s=''; const maxF=1.9, xx=f=>x+w*f/maxF, yy=a=>y+h-h*a;
    const q=2*Math.PI*f0*1e6*L/R;
    const low=f0*(Math.sqrt(4+1/q**2)-1/q)/2, high=f0*(Math.sqrt(4+1/q**2)+1/q)/2;
    s+=rect(xx(low),y,xx(high)-xx(low),h,'#e0f0e9');
    [0,.5,1].forEach(a=>s+=line(x,yy(a),x+w,yy(a),grid,1)+text(x-15,yy(a)+5,a===1?'1':a===0?'0':'0,5',12,muted,'end'));
    s+=line(x,y,x,y+h,muted,1.4)+line(x,y+h,x+w,y+h,muted,1.4);
    let d='';for(let i=0;i<=350*animate;i++){const f=.025+(maxF-.025)*i/350;d+=`${i?'L':'M'}${n(xx(f))},${n(yy(response(f,f0).amplitude))} `;}
    s+=path(d,ink,3.2);
    s+=line(xx(f0),y-7,xx(f0),y+h,colors[1],1.5,'stroke-dasharray="5 6"')+text(xx(f0),y-20,'f₀',19,colors[1],'middle',600);
    if(marks)frequencies.forEach((f,i)=>{const a=response(f,f0).amplitude;s+=line(xx(f),yy(a),xx(f),y+h,colors[i],1.7,'stroke-dasharray="3 5"')+dot(xx(f),yy(a),6,colors[i],'stroke="white" stroke-width="2"')+text(xx(f),y+h+28,['f₁','f₂','f₃'][i],20,colors[i],'middle',600);});
    s+=text(x,y-24,'Amplitud de salida / entrada',14,muted)+text(x+w,y+h+52,'Frecuencia',14,muted,'end');
    return s;
  }
  function compareReactance(isCap,t) {
    let s=text(705,173,isCap?'X꜀ = 1 / (2πfC)':'Xₗ = 2πfL',34,ink,'start',500)+text(705,207,'Oposición a la corriente alterna',15,muted);
    frequencies.forEach((f,i)=>{const y=266+i*76;const value=isCap?1/f:f;s+=text(705,y,['f₁','f₂','f₃'][i],20,colors[i],'start',600)+rect(755,y-16,280,14,'#f0f3ee',7)+rect(755,y-16,value/(isCap?2:1.5)*280,14,colors[i],7)+text(755,y+22,isCap?(i===0?'Mayor oposición':i===2?'Menor oposición':'Intermedia'):(i===0?'Menor oposición':i===2?'Mayor oposición':'Intermedia'),14,muted);});
    return s+text(705,519,'Mismo componente, distintas frecuencias.',15,muted);
  }
  function content(index,local,t) {
    let s='';
    if(index===0){
      s+=text(74,167,'SEÑALES SIMULTÁNEAS',13,muted,'start',600,'letter-spacing="1.5"');
      frequencies.forEach((f,i)=>{const y=240+i*82;s+=text(74,y+6,['A · f₁','B · f₂','C · f₃'][i],18,colors[i],'start',600)+line(166,y,405,y,grid)+wave(166,y,237,23,f,t,colors[i]);s+=path(`M427 ${y}C478 ${y} 475 323 522 323`,colors[i],1.5,'opacity=".5"');});
      s+=antenna(579,284,1.15,t)+text(579,481,'Antena',18,ink,'middle',500);
      s+=mixedWave(653,324,128,16,t)+arrow(783,324,814,324);
      s+=spectrum(844,232,276,208,[1,1,1],-1,'LAS MISMAS TRES FRECUENCIAS');
      s+=rect(163,484,255,39,'#edf5ee',6)+text(291,509,'Todas llegan simultáneamente',14,colors[1],'middle',500);
    }else if(index===1){
      s+=antenna(110,246,.75,t)+arrow(149,310,215,310);
      const zoom=.74+.17*smooth(local/1.6);
      s+=circuit(255,264,t,zoom);
      s+=text(888,252,'f₀ = 1 / (2π√LC)',29,ink,'middle',500)+text(888,292,'Frecuencia de resonancia',16,muted,'middle');
      s+=rect(787,325,202,58,'#eaf4ee',7)+text(888,362,'f₀ = f₂',28,colors[1],'middle',600);
      s+=text(888,415,'L = 100 μH',16,muted,'middle')+text(888,444,'C ≈ 253 pF',16,muted,'middle');
      s+=text(478,190,'CIRCUITO RESONANTE',13,muted,'middle',600,'letter-spacing="1.5"');
    }else if(index===2){
      s+=text(328,181,'C',39,colors[1],'middle',500)+cap(328,310,t,2.05);
      s+=text(328,500,'Campo eléctrico entre las placas',19,ink,'middle')+text(328,531,'Detalle de f₂ en la mezcla simultánea.',15,muted,'middle');
      s+=line(621,168,621,537,grid)+compareReactance(true,t);
    }else if(index===3){
      s+=text(332,181,'L',39,colors[1],'middle',500)+coil(211,317,t,1.6);
      s+=text(332,500,'Campo magnético alrededor de la bobina',18,ink,'middle')+text(332,531,'Detalle de f₂: el campo sigue a la corriente.',15,muted,'middle');
      s+=line(621,168,621,537,grid)+compareReactance(false,t);
    }else if(index===4){
      s+=text(62,163,'ENTRAN JUNTAS',12,muted,'start',600,'letter-spacing="1.2"');
      frequencies.forEach((f,i)=>s+=text(66,223+i*60,['f₁','f₂','f₃'][i],18,colors[i],'start',600)+wave(104,218+i*60,112,17,f,t,colors[i],0,2));
      s+=path('M225 218Q253 218 253 278M225 338Q253 338 253 278',muted,1.5)+arrow(225,278,287,278);
      s+=circuit(278,267,t,.66,true)+text(465,173,'f₀ = f₂',25,colors[1],'middle',600);
      s+=text(807,162,'RESPUESTAS SUPERPUESTAS',12,muted,'start',600,'letter-spacing="1.2"');
      frequencies.forEach((f,i)=>{const h=response(f), yy=226+i*91;s+=text(794,yy+5,['f₁','f₂','f₃'][i],19,colors[i],'start',600)+line(846,yy,1101,yy,grid)+wave(846,yy,255,31*h.amplitude,f,t,colors[i],h.phase,2)+text(1131,yy-34,i===1?'Grande':'Pequeña',13,i===1?colors[i]:muted,'end',i===1?600:400);});
      const theta=t*2*Math.PI*.45, ec=Math.cos(theta)**2, el=Math.sin(theta)**2;
      s+=text(339,473,'ENERGÍA DE LA COMPONENTE RESONANTE f₂',11,muted,'start',500,'letter-spacing="1"');
      s+=text(337,509,'C · campo eléctrico',14,colors[1])+rect(337,521,140,9,'#e8eeE7',4)+rect(337,521,140*ec,9,colors[1],4);
      s+=text(609,509,'L · campo magnético',14,colors[1])+rect(609,521,140,9,'#e8eee7',4)+rect(609,521,140*el,9,colors[1],4);
      s+=Math.sin(2*theta)>0?arrow(496,523,583,523,colors[1],2.5):arrow(583,523,496,523,colors[1],2.5);
      s+=text(573,572,'La señal recibida repone la energía disipada en R.',13,muted,'middle');
    }else if(index===5){
      s+=plot(126,219,948,270,1,t,smooth(local/1.4));
      s+=text(653,164,'Banda favorecida',16,colors[1],'middle',500);
      s+=text(126+948*.5/1.9,548,'Salida pequeña',15,colors[0],'middle')+text(126+948/1.9,548,'Salida grande',15,colors[1],'middle',600)+text(126+948*1.5/1.9,548,'Salida pequeña',15,colors[2],'middle');
    }else if(index===6){
      s+=line(600,158,600,554,grid);
      s+=text(74,180,'ANTES · ENTRADA',14,muted,'start',600,'letter-spacing="1.3"')+text(665,180,'DESPUÉS · SALIDA EN R',14,colors[1],'start',600,'letter-spacing="1.3"');
      for(let side=0;side<2;side++){
        const x=side?665:74;
        s+=line(x,285,x+450,285,grid)+mixedWave(x,285,450,30,t,!!side);
        frequencies.forEach((f,i)=>{const h=side?response(f):{amplitude:1,phase:0};s+=wave(x,285,450,30*h.amplitude,f,t,colors[i],h.phase,4,.22);});
        s+=text(x+450,365,'Tiempo',12,muted,'end');
        s+=spectrum(x+22,405,406,97,side?frequencies.map(f=>response(f).amplitude):[1,1,1],side?1:-1,'');
      }
      s+=rect(538,256,124,55,'#edf5ee',8)+text(600,291,'LC + R',18,colors[1],'middle',600);
    }else if(index===7){
      const xs=[98,302,525,747,989];
      const labels=['Antena','LC sintonizado','Amplificador','Demodulador','Parlante'];
      xs.forEach((x,i)=>{
        const width=i===1?190:163;
        s+=rect(x-65,258,width,116,i===1?'#e7f2eb':'#f5f7f2',8,`stroke="${i===1?colors[1]:grid}" stroke-width="${i===1?2:1}"`);
        if(i===0)s+=antenna(x+15,273,.44,t);
        if(i===1)s+=path(`M${x-17} 314h13q0 -17 10 -17t10 17q0 -17 10 -17t10 17h17m0 -19v38m13 -38v38m0 -19h20`,colors[1],2.5);
        if(i===2)s+=path(`M${x-8} 283v58l52 -29Z`,muted,2.3);
        if(i===3)s+=wave(x-20,311,88,15,.5,t,muted,0,2);
        if(i===4)s+=path(`M${x-11} 300h15l20 -17v57l-20 -17h-15Zm46 -5q22 17 0 34`,muted,2.5);
        s+=text(x+15+(i===1?14:0),410,labels[i],18,i===1?colors[1]:ink,'middle',i===1?600:400);
        if(i<4)s+=arrow(x-65+width+8,316,xs[i+1]-76,316,i===1?colors[1]:muted);
      });
      s+=text(398,466,'Selecciona la banda',16,colors[1],'middle')+text(843,466,'Recupera la información',16,muted,'middle');
      s+=text(600,534,'Después, el demodulador recupera la información.',22,ink,'middle');
    }else if(index===8){
      const f0=1+.5*smooth((local-.6)/4.3), C=1/((2*Math.PI*f0*1e6)**2*L)*1e12;
      s+=text(227,192,'L permanece fija',16,muted,'middle')+cap(227,309,t,1.4);
      s+=text(227,440,`C ≈ ${Math.round(C)} pF`,27,ink,'middle',500)+text(227,483,'f₀ = 1 / (2π√LC)',24,ink,'middle');
      s+=plot(513,219,604,270,f0,t);
      s+=text(823,170,`f₀ ≈ ${Math.round(f0*1000).toLocaleString('es-AR')} kHz`,22,f0>1.4?colors[2]:colors[1],'middle',600);
      s+=text(830,557,f0>1.4?'Ahora f₃ produce la mayor respuesta':'La curva se desplaza al disminuir C',17,f0>1.4?colors[2]:muted,'middle',500);
    }else{
      s+=text(600,236,'La radio no identifica la frecuencia',31,ink,'middle',500)+text(600,279,'como un número.',31,ink,'middle',500);
      s+=text(600,338,'El circuito responde físicamente de forma',24,muted,'middle')+text(600,372,'distinta según la frecuencia.',24,muted,'middle');
      frequencies.forEach((f,i)=>{const h=response(f,1.5);s+=wave(267,469,155,25,f,t,colors[i],0,2);s+=wave(789,469,155,38*h.amplitude,f,t,colors[i],h.phase,2);});
      s+=arrow(454,469,499,469)+rect(518,433,170,73,'#f1eef8',8)+text(603,479,'LC · f₀ = f₃',23,colors[2],'middle',600)+arrow(710,469,755,469);
      s+=text(344,539,'Muchas frecuencias',16,muted,'middle')+text(866,539,'Una banda predomina',16,colors[2],'middle',600);
    }
    return s;
  }
  const defs=`<defs>${[['gray',muted],['ink',ink],['green',colors[1]]].map(([id,c])=>`<marker id="arrow-${id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6Z" fill="${c}"/></marker>`).join('')}</defs>`;
  function locate(time){const index=starts.findLastIndex(s=>s<=Math.min(time,59.999));return {index,local:time-starts[index]};}
  function markup(time, mobile=false) {
    const {index,local}=locate(time);
    // Mobile uses a dedicated portrait composition, preserving legible type sizes.
    if(mobile)return mobileMarkup(time,index,local);
    const alpha=.55+.45*smooth(local/.45);
    const caption=index===8&&local<4.8?'Al disminuir C, aumenta f₀: la banda favorecida se desplaza.':captions[index];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680" role="img" aria-label="${titles[index]}" style="font-family:Segoe UI,Arial,sans-serif">${defs}${rect(0,0,1200,680,'white')}${text(56,40,`DENTRO DE UNA RADIO / ${String(index+1).padStart(2,'0')}`,12,muted,'start',500,'letter-spacing="1.5"')}${text(56,91,titles[index],30,ink,'start',500)}${text(1143,40,'RESONANCIA',12,colors[1],'end',600,'letter-spacing="1.5"')}<g opacity="${n(alpha)}">${content(index,local,time)}</g>${line(56,607,1144,607,grid)}${dot(67,641,4,colors[1])}${text(85,647,caption,18,ink)}${text(1144,647,`${String(index+1).padStart(2,'0')} / 10`,13,muted,'end')}</svg>`;
  }
  function mobileMarkup(t,index,local){
    let s='';const w=720;
    if(index===0){
      frequencies.forEach((f,i)=>s+=text(40,180+i*54,['A · f₁','B · f₂','C · f₃'][i],21,colors[i],'start',600)+wave(130,174+i*54,245,18,f,t,colors[i])+path(`M389 ${174+i*54}Q426 ${174+i*54} 449 246`,colors[i],1.5,'opacity=".5"'));
      s+=antenna(510,207,.7,t)+text(510,352,'Antena',19,ink,'middle')+spectrum(146,417,430,111);
    }else if(index===1){
      s+=circuit(80,236,t,.87)+text(360,180,'f₀ = 1 / (2π√LC)',30,ink,'middle',500)+text(360,568,'Sintonizado: f₀ = f₂',28,colors[1],'middle',600);
    }else if(index===2||index===3){
      s+=index===2?cap(360,270,t,1.65):coil(233,270,t,1.65);
      s+=text(360,409,index===2?'X꜀ = 1 / (2πfC)':'Xₗ = 2πfL',34,ink,'middle');
      frequencies.forEach((f,i)=>{const x=65+i*212;const v=index===2?1/f:f;s+=text(x+83,462,['f₁','f₂','f₃'][i],21,colors[i],'middle',600)+rect(x,481,165,16,'#f0f3ee',8)+rect(x,481,165*v/(index===2?2:1.5),16,colors[i],8)+text(x+83,535,index===2?(i===0?'Mayor X꜀':i===2?'Menor X꜀':'Intermedia'):(i===0?'Menor Xₗ':i===2?'Mayor Xₗ':'Intermedia'),19,muted,'middle');});
    }else if(index===4){
      s+=text(49,158,'ENTRAN JUNTAS',15,muted,'start',600)+text(409,158,'RESPUESTA EN R',15,muted,'start',600);
      frequencies.forEach((f,i)=>{const y=205+i*72,h=response(f);s+=text(40,y+5,['f₁','f₂','f₃'][i],21,colors[i])+wave(83,y,163,20,f,t,colors[i],0,2)+wave(418,y,229,32*h.amplitude,f,t,colors[i],h.phase,2);});
      s+=rect(271,221,114,65,'#e9f3ec',7)+text(328,249,'LC + R',21,colors[1],'middle',600)+text(328,274,'f₀ = f₂',17,colors[1],'middle');
      s+=arrow(250,254,269,254)+arrow(388,254,413,254);
      const theta=t*2*Math.PI*.45;s+=text(360,426,'Energía de la componente f₂',17,muted,'middle');
      s+=cap(185,501,t,.64)+coil(484,501,t,.65)+text(184,573,'Campo eléctrico',19,colors[1],'middle')+text(532,573,'Campo magnético',19,colors[1],'middle');
      s+=Math.sin(theta*2)>0?arrow(288,501,422,501,colors[1],3):arrow(422,501,288,501,colors[1],3);
    }else if(index===5){
      s+=plot(83,249,554,251,1,t,smooth(local/1.4))+text(370,183,'Banda de respuesta finita',22,colors[1],'middle');
    }else if(index===6){
      s+=text(51,168,'ANTES',18,muted,'start',600)+mixedWave(51,236,614,24,t)+spectrum(75,312,564,55,[1,1,1],-1,'');
      s+=text(51,439,'DESPUÉS · SALIDA EN R',18,colors[1],'start',600)+mixedWave(51,488,614,24,t,true)+spectrum(75,540,564,39,frequencies.map(f=>response(f).amplitude),1,'');
    }else if(index===7){
      ['Antena','Circuito sintonizado LC','Amplificador','Demodulador','Parlante'].forEach((label,i)=>{const y=142+i*82;s+=rect(143,y,435,56,i===1?'#e7f2eb':'#f5f7f2',6)+text(360,y+36,label,24,i===1?colors[1]:ink,'middle',i===1?600:400);if(i<4)s+=arrow(360,y+60,360,y+77);});
      s+=text(360,575,'El demodulador recupera la información.',19,muted,'middle');
    }else if(index===8){
      const f0=1+.5*smooth((local-.6)/4.3),C=1/((2*Math.PI*f0*1e6)**2*L)*1e12;
      s+=text(360,173,`C ≈ ${Math.round(C)} pF · L fija`,25,ink,'middle')+text(360,213,'f₀ = 1 / (2π√LC)',25,ink,'middle')+plot(83,288,554,242,f0,t);
    }else{
      s+=text(360,208,'La radio no identifica la',28,ink,'middle',500)+text(360,247,'frecuencia como un número.',28,ink,'middle',500)+text(360,325,'El circuito responde físicamente',25,muted,'middle')+text(360,363,'de forma distinta según',25,muted,'middle')+text(360,401,'la frecuencia.',25,muted,'middle');
      frequencies.forEach((f,i)=>s+=wave(80,490,180,25,f,t,colors[i],0,2)+wave(468,490,175,35*response(f,1.5).amplitude,f,t,colors[i],response(f,1.5).phase,2));
      s+=rect(298,458,123,64,'#f1eef8',8)+text(360,497,'LC · f₃',23,colors[2],'middle',600)+arrow(267,490,294,490)+arrow(426,490,460,490);
      s+=text(360,574,'Una banda queda predominando.',23,colors[2],'middle',500);
    }
    const caption=index===8&&local<4.8?'Menor C → mayor f₀. La banda se desplaza.':shortCaptions[index];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="680" viewBox="0 0 720 680" role="img" aria-label="${titles[index]}" style="font-family:Segoe UI,Arial,sans-serif">${defs}${rect(0,0,w,680,'white')}${text(36,39,`DENTRO DE UNA RADIO / ${String(index+1).padStart(2,'0')}`,16,muted,'start',500)}${text(36,90,shortTitles[index],32,ink,'start',500)}${s}${line(36,620,684,620,grid)}${text(36,656,caption,20,ink)}</svg>`;
  }
  let time=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,speed=1,last=performance.now(),lastDraw=0,exporting=false;
  const mobile=matchMedia('(max-width: 800px)');
  $('chapters').innerHTML=chapters.map((title,i)=>`<button class="chapter" data-index="${i}" aria-label="Escena ${i+1}: ${title}"><span class="number">${String(i+1).padStart(2,'0')}</span><span>${title}</span></button>`).join('');
  $('timeline-ticks').innerHTML=starts.slice(1).map(t=>`<span style="left:${t/60*100}%"></span>`).join('');
  const format=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  function render(){
    $('stage').innerHTML=markup(time,mobile.matches);
    $('timeline').value=time;$('timeline').style.setProperty('--progress',`${time/60*100}%`);
    $('time').innerHTML=`${format(time)} <span>/ 01:00</span>`;
    const {index}=locate(time);
    document.querySelectorAll('.chapter').forEach((el,i)=>{el.classList.toggle('active',i===index);el.classList.toggle('completed',i<index);if(i===index)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
    $('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'Pausar':'Reproducir');$('play').title=(playing?'Pausar':'Reproducir')+' (espacio)';
  }
  function toggle(){if(time>=60)time=0;playing=!playing;last=performance.now();render();}
  $('play').onclick=toggle;
  $('restart').onclick=()=>{time=0;playing=true;last=performance.now();render();};
  $('timeline').addEventListener('input',e=>{time=+e.target.value;last=performance.now();if(time>=60)playing=false;render();});
  $('speed').onchange=e=>speed=+e.target.value;
  $('chapters').onclick=e=>{const b=e.target.closest('.chapter');if(b){time=starts[+b.dataset.index];last=performance.now();render();}};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage-wrap').requestFullscreen();}catch{$('export-status').textContent='Este navegador no permite pantalla completa.';}};
  document.addEventListener('keydown',e=>{if(['INPUT','SELECT','BUTTON','SUMMARY','A'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();toggle();}if(e.code==='ArrowRight'||e.code==='ArrowLeft'){e.preventDefault();time=clamp(time+(e.code==='ArrowRight'?5:-5),0,60);if(time>=60)playing=false;last=performance.now();render();}});
  mobile.addEventListener('change',render);
  function frame(now){const delta=Math.max(0,Math.min((now-last)/1000,.1));last=now;if(playing&&!exporting){time=Math.min(60,time+delta*speed);if(time>=60)playing=false;}if(now-lastDraw>1000/30){render();lastDraw=now;}requestAnimationFrame(frame);}
  async function svgImage(svg){const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));try{const img=new Image();img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}}
  async function exportVideo({download=true,onProgress=()=>{}}={}){
    if(exporting)throw new Error('Ya hay una exportación en curso.');
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw new Error('Usá Chrome o Edge para exportar el video.');
    exporting=true;const wasPlaying=playing;playing=false;render();$('export').disabled=true;
    const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=816;
    const ctx=canvas.getContext('2d',{alpha:false});let stream,recorder;
    try{
      await document.fonts.ready;
      ctx.drawImage(await svgImage(markup(0)),0,0,1440,816);
      stream=canvas.captureStream(0);const track=stream.getVideoTracks()[0];
      const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
      if(!mime)throw new Error('El navegador no dispone de un formato de video compatible.');
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5500000});
      const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Error de grabación.'));});
      recorder.start(1000);const begin=performance.now();let lastProgress=-1;
      for(let frameIndex=0;frameIndex<1800;frameIndex++){
        const exportTime=frameIndex/30;
        ctx.drawImage(await svgImage(markup(exportTime)),0,0,1440,816);track.requestFrame();
        const progress=Math.floor(exportTime);
        if(progress!==lastProgress){$('export-status').textContent=`Generando video: ${progress} / 60 s. Mantené esta pestaña visible.`;onProgress(progress);lastProgress=progress;}
        const delay=begin+(frameIndex+1)*1000/30-performance.now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
      }
      recorder.stop();await stopped;const blob=new Blob(chunks,{type:recorder.mimeType});
      if(download){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`resonancia-radio.${mime.includes('mp4')?'mp4':'webm'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
      $('export-status').textContent='Video listo · 60 segundos · sin audio.';return blob;
    }finally{if(recorder&&recorder.state!=='inactive')recorder.stop();if(stream)stream.getTracks().forEach(t=>t.stop());exporting=false;playing=wasPlaying;last=performance.now();$('export').disabled=false;render();}
  }
  $('export').onclick=()=>exportVideo().catch(e=>{$('export-status').textContent=e.message;});
  // Deterministic entry points also allow scene-by-scene visual verification.
  window.RadioLC={seek:(t)=>{time=clamp(t,0,60);playing=false;render();},play:()=>{playing=true;last=performance.now();render();},pause:()=>{playing=false;render();},markup,response,exportVideo,starts,durations,getState:()=>({time,playing,speed,scene:locate(time).index})};
  render();requestAnimationFrame(frame);
})();
