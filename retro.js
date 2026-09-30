'use strict';
(() => {
  const $ = id => document.getElementById(id), Core = window.RetroCore;
  const KEY = 'frecuencia90.v1', MAX = 180, SLOTS = 5;
  const Backend = window.RadioBackend;
  const youtubeUnavailable = window.RADIO_HOSTED
    ? Backend.base ? 'No se pudo conectar con el servidor de audio. Reintentá en un momento; las emisoras locales siguen disponibles.' : 'Falta configurar la conexión con el servidor de audio.'
    : 'Abrí Iniciar-radio.cmd para conectar YouTube y preparar su audio.';
  const demo = [
    { id: 'demo-1', title: 'Todo Cambia', artist: 'Mercedes Sosa', source: 'demo', file: 'radio-assets/emisora-1.mp3' },
    { id: 'demo-2', title: 'This Love', artist: 'Maroon 5', source: 'demo', file: 'radio-assets/emisora-2.mp3' },
    { id: 'demo-3', title: "i’m upping my p(doom)", artist: 'Audio proporcionado', source: 'demo', file: 'radio-assets/emisora-3.mp3' }
  ];
  let stationLimit = MAX;
  let stations = Core.assign(demo), band = 'FM', frequency = 97.75, volume = .65, width = 1;
  let powered = false, starting = false, context, master, analyser, receiver;
  let activeId = null, serverAvailable = false, importController;
  let scanTimer, tuningTimer, lastWheel = 0, lastPaint = 0, lastPlot = 0;
  let prepareLoopRunning = false, prepareGeneration = 0, audioGeneration = 0;
  let ytPlayer, ytReady = false, ytLoading = false, videoVisible = false, videoGeneration = 0;
  const prepared = new Map(), preparing = new Map(), failed = new Map(), media = new Map(), slots = Array(SLOTS).fill(null);
  const preparationQueue = new window.RadioPreparationQueue(2);
  const preparationWanted = s => powered && stations.some(t => t.id === s.id) && (nearest()?.id === s.id || $('prepare-all').checked);
  const colors = ['#ab5836', '#426047', '#8a7b54', '#667d85', '#8b677b'];
  let wave = new Uint8Array(256), spectrum = new Uint8Array(256), outputRms = 0, physics = null;
  const delay = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Cancelado', 'AbortError')); return; }
    const stop = () => { clearTimeout(timer); reject(new DOMException('Cancelado', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
  const formatFrequency = f => f.toFixed(band === 'FM' ? 2 : 0);
  const bandInfo = () => Core.bands[band];
  const stationFrequency = s => s.frequencies[band];
  const strength = s => Core.response(stationFrequency(s), frequency, band, width);
  const nearest = () => stations.reduce((a, s) => !a || Math.abs(stationFrequency(s) - frequency) < Math.abs(stationFrequency(a) - frequency) ? s : a, null);
  const ranked = () => [...stations].sort((a, b) => Math.abs(stationFrequency(a) - frequency) - Math.abs(stationFrequency(b) - frequency));
  const broadcastPosition = Core.createBroadcastClock();
  function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
  function feedback(text, error = false) { $('import-feedback').textContent = text; $('import-feedback').classList.toggle('error', error); }
  function isValidStation(s) {
    return s && typeof s.title === 'string' && s.title.length <= 1000 && typeof s.artist === 'string' && s.artist.length <= 1000 &&
      ((s.source === 'youtube' && /^[\w-]{11}$/.test(s.id)) || (s.source === 'demo' && demo.some(d => d.id === s.id)));
  }
  function normalizeStation(s) {
    return s.source === 'demo' ? { ...demo.find(d => d.id === s.id) } : { id: s.id, title: s.title, artist: s.artist, source: 'youtube', duration: Number(s.duration) || null, live: !!s.live };
  }
  function save() {
    try {
      const durable = stations.filter(s => s.source === 'demo' || s.source === 'youtube').map(normalizeStation);
      localStorage.setItem(KEY, JSON.stringify({ version: 1, stations: durable, stationLimit, band, frequency, volume, width, noise: $('nostalgia').checked, control: $('control-mode').value }));
      $('save-status').textContent = stations.some(s => s.source === 'local') ? 'Archivos y capturas: disponibles durante esta sesión.' : 'Tu dial se guarda en este navegador.';
    } catch { $('save-status').textContent = 'El navegador no permite guardar este dial.'; }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.version === 1 && Array.isArray(saved.stations) && saved.stations.length && saved.stations.length <= MAX && saved.stations.every(isValidStation)) {
      stationLimit = Number.isInteger(saved.stationLimit) ? Core.clamp(saved.stationLimit, 1, MAX) : MAX;
      stations = Core.assign(saved.stations.slice(0, stationLimit).map(normalizeStation));
      band = saved.band === 'AM' ? 'AM' : 'FM';
      frequency = Core.clamp(Number(saved.frequency) || stationFrequency(stations[0]), bandInfo().min, bandInfo().max);
      volume = Core.clamp(Number(saved.volume) || 0, 0, 1);
      width = [.6, 1, 2].includes(saved.width) ? saved.width : 1;
      $('nostalgia').checked = saved.noise !== false;
      $('control-mode').value = saved.control === 'laptop' ? 'laptop' : 'wheel';
    }
  } catch { /* A malformed save leaves the ready-to-play demo intact. */ }
  $('station-limit').value = stationLimit;
  $('volume').value = Math.round(volume * 100); $('bandwidth').value = width;
  function renderStations() {
    const filter = $('station-filter').value.trim().toLocaleLowerCase('es');
    $('station-count').textContent = String(stations.length).padStart(2, '0');
    $('station-list').replaceChildren();
    for (const s of stations) {
      if (filter && !(s.title + ' ' + s.artist + ' ' + formatFrequency(stationFrequency(s))).toLocaleLowerCase('es').includes(filter)) continue;
      const row = document.createElement('button'); row.className = 'station-row'; row.dataset.stationId = s.id;
      row.setAttribute('aria-label', `${s.title}, ${s.artist}, ${formatFrequency(stationFrequency(s))} ${bandInfo().unit}`);
      const f = document.createElement('span'); f.className = 'station-freq'; f.textContent = formatFrequency(stationFrequency(s));
      const unit = document.createElement('small'); unit.textContent = bandInfo().unit; f.append(unit);
      const info = document.createElement('span'); info.className = 'station-name';
      const title = document.createElement('strong'); title.textContent = s.title;
      const artist = document.createElement('small'); artist.textContent = s.artist; info.append(title, artist);
      const symbol = document.createElement('span'); symbol.textContent = failed.has(s.id) ? '!' : (prepared.has(s.id) || s.source !== 'youtube') ? '↗' : preparing.has(s.id) ? '◌' : '·';
      row.append(f, info, symbol); row.addEventListener('click', () => { stopScan(); tuneStation(s); }); $('station-list').append(row);
    }
    if (!$('station-list').childElementCount) { const p = document.createElement('p'); p.className = 'station-empty'; p.textContent = 'No hay emisoras con ese nombre.'; $('station-list').append(p); }
    const markers = $('station-markers'); markers.replaceChildren();
    stations.forEach((s, i) => { const marker = document.createElement('i'); marker.style.left = (stationFrequency(s) - bandInfo().min) / (bandInfo().max - bandInfo().min) * 100 + '%'; marker.style.background = colors[i % colors.length]; markers.append(marker); });
    updateReadouts();
  }
  function updateReadouts() {
    const b = bandInfo(), s = nearest(), gain = s ? strength(s) : 0, tuned = gain > .45;
    const c = Core.capacitance(frequency, band), proportion = (frequency - b.min) / (b.max - b.min);
    $('frequency-number').textContent = formatFrequency(frequency); $('frequency-unit').textContent = b.unit;
    $('frequency-slider').min = b.min; $('frequency-slider').max = b.max; $('frequency-slider').step = band === 'FM' ? .005 : .2; $('frequency-slider').value = frequency;
    $('dial-needle').style.left = proportion * 100 + '%'; $('tuning-knob').style.setProperty('--rotation', (-140 + proportion * 280) + 'deg');
    $('tuning-knob').setAttribute('aria-valuemin', b.min); $('tuning-knob').setAttribute('aria-valuemax', b.max); $('tuning-knob').setAttribute('aria-valuenow', frequency.toFixed(3));
    $('tuning-knob').setAttribute('aria-valuetext', `${formatFrequency(frequency)} ${b.unit}, ${c.toFixed(2)} picofaradios`);
    $('capacitance-output').textContent = c.toFixed(2) + ' pF'; $('capacitor').min = Core.capacitance(b.max, band); $('capacitor').max = Core.capacitance(b.min, band); $('capacitor').value = c;
    $('coil-label').textContent = 'L = ' + (band === 'FM' ? '100 nH' : '100 μH');
    const frontBandwidth = band === 'FM' ? 2000000 : 60000;
    const resistance = 2 * Math.PI * b.L * frontBandwidth;
    $('circuit-values').textContent = `B = ${(Core.bandwidth(band, width) / 1000).toFixed(1)} kHz · R = ${resistance.toFixed(3)} Ω · Q RF = ${(frequency * b.scale / frontBandwidth).toFixed(0)}`;
    $('tape-band').textContent = band + (band === 'FM' && physics?.stereoBlend > .5 ? ' STEREO' : ' RADIO');
    document.querySelectorAll('[data-band]').forEach(el => { const yes = el.dataset.band === band; el.classList.toggle('active', yes); el.setAttribute('aria-pressed', yes); });
    $('volume-output').textContent = Math.round(volume * 100) + '%';
    $('station-title').textContent = tuned && s ? s.title : 'Entre frecuencias';
    $('station-subtitle').textContent = tuned && s ? `${s.artist} · ${s.source === 'youtube' ? prepared.has(s.id) ? 'audio preparado · filtro LC' : preparing.has(s.id) ? 'preparando audio…' : 'YouTube' : 'audio local · filtro LC'}` : 'Mové el dial hasta encontrar una señal.';
    $('reception-label').textContent = !powered ? 'LISTA PARA ENCENDER' : tuned ? preparing.has(s.id) ? 'PREPARANDO EMISORA' : 'SEÑAL SINTONIZADA' : 'BUSCANDO SEÑAL';
    $('signal-dot').classList.toggle('receiving', powered && tuned);
    document.querySelectorAll('.station-row').forEach(el => { const yes = tuned && s?.id === el.dataset.stationId; el.classList.toggle('active', yes); el.setAttribute('aria-pressed', yes); });
    $('show-video').hidden = !s || s.source !== 'youtube' || !tuned;
    $('retry-audio').hidden = !s || !failed.has(s.id);
    $('power-main').textContent = powered ? '⏻ Apagar radio' : '⏻ Encender radio';
    $('power-main').setAttribute('aria-pressed', powered);
    $('show-video').textContent = videoVisible ? 'Ocultar video' : 'Ver video de esta emisora ↗';
    if (receiver) receiver.port.postMessage({ type: 'tune', band, f0: frequency * b.scale, bandwidth: Core.bandwidth(band, width), volume, noise: $('nostalgia').checked,
      antennaMicrovolts: +$('antenna-strength').value, temperature: +$('temperature').value, reflection: $('reflection').checked });
    updateMeasurements();
    if (videoVisible && ytReady) ytPlayer.setVolume(0);
    updatePreparationProgress();
  }
  function updateMeasurements() {
    const stereo = powered && band === 'FM' && physics?.stereoBlend > .5;
    $('stereo-indicator').textContent = stereo ? '● STEREO' : 'MONO';
    $('stereo-indicator').style.opacity = stereo ? '1' : '.45';
    if (physics && powered) {
      $('physical-readouts').textContent = `Antena / FI: ${physics.ifRmsMicrovolts.toFixed(2)} µV · ruido: ${physics.thermalRmsMicrovolts.toFixed(2)} µV · C/N: ${physics.cnrDb === null ? 'ideal' : physics.cnrDb.toFixed(1) + ' dB'} · ${physics.temperature} K · cono L: ${physics.displacementMm[0].toFixed(4)} mm`;
      [...$('signal-bars').children].forEach((el, i) => el.classList.toggle('on', physics.ifRmsMicrovolts > physics.thermalRmsMicrovolts * 1.5 && (physics.cnrDb === null || physics.cnrDb > 6 + i * 6)));
      const receiving = physics.ifRmsMicrovolts > Math.max(.01, physics.thermalRmsMicrovolts * 1.5);
      $('signal-dot').classList.toggle('receiving', receiving);
      $('tape-band').textContent = band + (stereo ? ' STEREO' : ' RADIO');
      $('reception-label').textContent = preparing.has(nearest()?.id) ? 'PREPARANDO EMISORA' : receiving ? 'SEÑAL RECIBIDA' : 'BUSCANDO SEÑAL';
    } else {
      $('physical-readouts').textContent = 'Encendé la radio para medir la señal del receptor.';
      [...$('signal-bars').children].forEach(el => el.classList.remove('on'));
    }
    $('antenna-output').textContent = $('antenna-strength').value + ' µV';
    $('temperature-output').textContent = $('temperature').value + ' K';
  }
  function updatePreparationProgress() {
    const yt = stations.filter(s => s.source === 'youtube'), count = yt.filter(s => prepared.has(s.id)).length, errors = yt.filter(s => failed.has(s.id)).length;
    $('preparation-progress').textContent = yt.length ? `Audio listo: ${count}/${yt.length}${errors ? ` · ${errors} sin preparar` : ''}${prepareLoopRunning ? ' · preparando…' : ''}` : '';
  }
  function setFrequency(value, opts = {}) {
    frequency = Core.clamp(Number(value), bandInfo().min, bandInfo().max); if (!Number.isFinite(frequency)) frequency = bandInfo().min;
    updateReadouts(); save();
    clearTimeout(tuningTimer); tuningTimer = setTimeout(() => syncAudio(), opts.instant ? 0 : 110);

  }
  function tuneStation(s) { setFrequency(stationFrequency(s), { instant: true }); if (!powered) status('Emisora elegida. Pulsá POWER para escuchar.'); }
  function changeStation(direction) {
    const sorted = [...stations].sort((a, b) => stationFrequency(a) - stationFrequency(b));
    const target = direction > 0 ? sorted.find(s => stationFrequency(s) > frequency + (band === 'FM' ? .035 : 2)) || sorted[0] : [...sorted].reverse().find(s => stationFrequency(s) < frequency - (band === 'FM' ? .035 : 2)) || sorted.at(-1);
    if (target) tuneStation(target);
  }
  function switchBand(value) {
    if (value === band) return; const s = nearest(); band = value;
    slots.forEach((id, slot) => { if (id) { const station = stations.find(t => t.id === id); if (station) receiver?.port.postMessage({ type: 'carrier', slot, frequency: stationFrequency(station) * bandInfo().scale }); } });
    frequency = s ? stationFrequency(s) : bandInfo().min; renderStations(); setFrequency(frequency, { instant: true });
  }
  async function api(path, body, signal) {
    const response = await fetch(Backend.apiUrl(path), { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal });
    let data; try { data = await response.json(); } catch { throw new Error(youtubeUnavailable); }
    if (!response.ok) {
      const error = new Error(data.error || 'No se pudo completar la carga.');
      error.code = data.code; error.retryAfter = data.retryAfter;
      throw error;
    }
    return data;
  }
  async function submitWhenAvailable(path, body, signal, wanted = () => true) {
    const start = Date.now();
    while (Date.now() - start < 1800000) {
      if (signal?.aborted || !wanted()) throw new DOMException('Cancelado', 'AbortError');
      try { return await api(path, body, signal); }
      catch (error) {
        if (error.code !== 'queue_busy') throw error;
        if (path === '/api/audio' && nearest()?.id === body.id) status('Esperando un lugar para preparar esta emisora…');
        await delay(Math.max(1, Math.min(10, Number(error.retryAfter) || 2)) * 1000, signal);
      }
    }
    throw new Error('El servidor sigue ocupado. Volvé a intentar en unos minutos.');
  }
  async function waitJob(job, signal, limit = 330000) {
    const start = Date.now(); let started;
    while (Date.now() - start < 1800000) {
      const data = await api('/api/jobs/' + job, null, signal);
      if (data.state === 'done') return data.result;
      if (data.state === 'error') throw new Error(data.error);
      if (data.state !== 'queued') {
        started ??= Date.now();
        if (Date.now() - started >= limit) break;
      }
      await delay(800, signal);
    }
    throw new Error('La preparación está tardando demasiado. Volvé a intentar en unos minutos.');
  }
  async function checkServer({ wait = false, signal } = {}) {
    if (location.protocol === 'file:' || (window.RADIO_HOSTED && !Backend.base)) return false;
    try {
      serverAvailable = await Backend.ready({ wait, signal, onWaiting: () => { if (importController) feedback('Iniciando el servidor de audio. Render Free puede tardar cerca de un minuto…'); else status('Iniciando el servidor de audio…'); } });
      return serverAvailable;
    } catch (error) { if (error.name === 'AbortError' && signal?.aborted) throw error; serverAvailable = false; return false; }
  }
  async function ensurePrepared(s) {
    if (s.source !== 'youtube') return s.file;
    if (prepared.has(s.id)) return prepared.get(s.id);
    if (preparing.has(s.id)) return preparing.get(s.id);
    if (s.live) { failed.set(s.id, 'Un directo no se puede preparar como archivo. Cargá un video grabado para usar el filtro LC.'); throw new Error(failed.get(s.id)); }
    const promise = preparationQueue.run(async () => {
      if (!serverAvailable && !await checkServer({ wait: true })) throw new Error(youtubeUnavailable);
      const { job } = await submitWhenAvailable('/api/audio', { id: s.id }, undefined, () => preparationWanted(s));
      const result = await waitJob(job);
      const file = Backend.mediaUrl(result.url);
      prepared.set(s.id, file); failed.delete(s.id); return file;
    }, () => nearest()?.id === s.id ? -1 : Math.abs(stationFrequency(s) - frequency), () => preparationWanted(s));
    preparing.set(s.id, promise); renderStations();
    try { return await promise; } catch (error) { if (error.name !== 'AbortError') failed.set(s.id, error.message); throw error; }
    finally { preparing.delete(s.id); renderStations(); }
  }
  async function backgroundPreparation() {
    if (prepareLoopRunning || !powered || !$('prepare-all').checked) return;
    prepareLoopRunning = true; const generation = prepareGeneration; updatePreparationProgress();
    try {
      while (powered && $('prepare-all').checked && generation === prepareGeneration) {
        const next = ranked().find(s => s.source === 'youtube' && !prepared.has(s.id) && !failed.has(s.id) && !preparing.has(s.id));
        if (!next) break;
        try { await ensurePrepared(next); if (powered && generation === prepareGeneration) await syncAudio(); } catch { /* Each failed row remains usable through a local replacement. */ }
      }
    } finally { prepareLoopRunning = false; updatePreparationProgress(); if (generation !== prepareGeneration && powered) backgroundPreparation(); }
  }
  async function initializeAudio() {
    if (location.protocol === 'file:') throw new Error('Abrí Iniciar-radio.cmd para habilitar el filtro LC y la conexión con YouTube.');
    context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    if (!context.audioWorklet) throw new Error('El filtro necesita Chrome o Edge mediante Iniciar-radio.cmd.');
    const codeResponse = await fetch('retro-worklet.js');
    if (!codeResponse.ok) throw new Error('No se pudo cargar el filtro de audio.');
    const code = `const PHYSICS = (${window.RetroPhysicsFactory})();\n` + await codeResponse.text();
    const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try { await context.audioWorklet.addModule(blobUrl); } finally { URL.revokeObjectURL(blobUrl); }
    receiver = new AudioWorkletNode(context, 'retro-receiver', { numberOfInputs: SLOTS, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
    receiver.onprocessorerror = () => { powerOff(); status('El filtro de audio se detuvo. Recargá la radio para reiniciarlo.', true); };
    master = context.createGain(); master.gain.value = 1;
    analyser = context.createAnalyser(); analyser.fftSize = 2048;
    receiver.connect(master); master.connect(analyser); analyser.connect(context.destination);
    receiver.port.onmessage = ({ data }) => { physics = data; updateMeasurements(); };
    updateReadouts();
  }
  async function attachStation(s, file, generation) {
    if (!powered || generation !== audioGeneration) return;
    let slot = slots.indexOf(s.id);
    if (slot !== -1) return;
    slot = slots.indexOf(null); if (slot === -1) return;
    let entry = media.get(s.id);
    if (!entry) {
      const audio = new Audio(); audio.crossOrigin = 'anonymous'; audio.preload = 'auto'; audio.loop = true; audio.src = file;
      const source = context.createMediaElementSource(audio);
      entry = { audio, source, slot: -1 }; media.set(s.id, entry);
      audio.addEventListener('error', () => { failed.set(s.id, 'No se pudo leer el archivo de audio. Volvé a cargar la emisora.'); if (activeId === s.id) status(failed.get(s.id), true); });
    }
    if (entry.audio.error) { entry.audio.src = file; entry.audio.load(); }
    if (entry.slot >= 0) entry.source.disconnect();
    slots[slot] = s.id; entry.slot = slot;
    receiver.port.postMessage({ type: 'carrier', slot, frequency: stationFrequency(s) * bandInfo().scale });
    entry.source.connect(receiver, 0, slot);
    try {
      if (entry.audio.readyState < 1) await Promise.race([new Promise((resolve, reject) => { entry.audio.addEventListener('loadedmetadata', resolve, { once: true }); entry.audio.addEventListener('error', () => reject(new Error('El archivo de audio no está disponible.')), { once: true }); }), delay(18000).then(() => { throw new Error('El audio tardó demasiado en cargar.'); })]);
      if (!powered || slots[slot] !== s.id || media.get(s.id) !== entry || !stations.some(t => t.id === s.id)) { if (slots[slot] === s.id && media.get(s.id) === entry) releaseSlot(slot); return; }
      const duration = entry.audio.duration;
      if (Number.isFinite(duration) && duration > 0) entry.audio.currentTime = broadcastPosition(s.id, duration);
      await entry.audio.play();
    } catch (error) { if (slots[slot] === s.id && media.get(s.id) === entry) releaseSlot(slot); throw error; }
  }
  function releaseSlot(slot) {
    const id = slots[slot]; if (!id) return;
    const entry = media.get(id); if (entry) { entry.audio.pause(); entry.source.disconnect(); entry.slot = -1; }
    slots[slot] = null; receiver?.port.postMessage({ type: 'remove', slot });
  }
  function clearMedia() {
    audioGeneration++; slots.forEach((id, slot) => releaseSlot(slot));
    media.forEach(entry => { entry.audio.src = ''; entry.audio.load(); }); media.clear();
    activeId = null;
  }
  async function syncAudio() {
    if (!powered || !receiver) return;
    const generation = ++audioGeneration, near = ranked(), selected = near[0];
    const candidates = near.filter((s, i) => i < SLOTS && (i === 0 || Math.abs(stationFrequency(s) - frequency) * bandInfo().scale < 280000));
    const ids = new Set(candidates.map(s => s.id));
    slots.forEach((id, i) => { if (id && !ids.has(id)) releaseSlot(i); });
    activeId = selected?.id || null;
    if (selected && strength(selected) > .45) {
      if (failed.has(selected.id)) status(failed.get(selected.id) + ' Podés cargar el audio con «Agregar mis archivos».', true);
      else if (selected.source === 'youtube' && !prepared.has(selected.id)) status('Preparando el audio de esta emisora para pasarlo por el filtro LC…');
      else status('La música pasa por el filtro LC. Girá despacio para escuchar cómo pierde la señal.');
    } else status('Entre emisoras. Más C baja la frecuencia; menos C la sube.');
    // Attach ready neighbours immediately; a network request never delays local sound.
    const ready = candidates.filter(s => s.source !== 'youtube' || prepared.has(s.id));
    const attached = await Promise.allSettled(ready.map(s => attachStation(s, s.source === 'youtube' ? prepared.get(s.id) : s.file, generation)));
    attached.forEach((result, i) => {
      if (result.status === 'rejected' && generation === audioGeneration) {
        failed.set(ready[i].id, result.reason.message);
        if (ready[i].id === activeId) status(result.reason.message, true);
      }
    });
    // Bound decoded media resources while the shared clock preserves positions.
    for (const [id, entry] of media) {
      if (media.size <= SLOTS + 2) break;
      if (entry.slot < 0 && !ids.has(id)) { entry.audio.removeAttribute('src'); entry.audio.load(); entry.source.disconnect(); media.delete(id); }
    }
    if (selected?.source === 'youtube' && !prepared.has(selected.id) && !failed.has(selected.id)) {
      try { const file = await ensurePrepared(selected); if (powered && generation === audioGeneration) { await attachStation(selected, file, generation); status('Audio preparado. Estás escuchando a través del filtro LC.'); } }
      catch (error) { if (error.name !== 'AbortError' && generation === audioGeneration) status(error.message + ' Podés usar un archivo de audio local.', true); }
    }
    if (videoVisible) syncVideo();
    backgroundPreparation();
  }
  function powerOff() {
    powered = false; audioGeneration++; stopScan();
    preparationQueue.drain();
    media.forEach(entry => entry.audio.pause()); context?.suspend(); ytPlayer?.pauseVideo?.();
    $('boombox').classList.remove('powered', 'playing'); $('power').setAttribute('aria-pressed', 'false'); updateReadouts(); status('Radio apagada. Tu dial queda guardado.');
  }
  async function togglePower() {
    if (starting) return;
    if (powered) { powerOff(); return; }
    starting = true; $('power').disabled = true;
    try {
      if (!context) await initializeAudio(); await context.resume(); powered = true;
      $('boombox').classList.add('powered'); $('power').setAttribute('aria-pressed', 'true'); updateReadouts();
      // Rejoin each broadcast after time spent with the receiver switched off.
      await Promise.allSettled([...media.entries()].filter(([, entry]) => entry.slot >= 0).map(([id, entry]) => {
        if (Number.isFinite(entry.audio.duration) && entry.audio.duration > 0) entry.audio.currentTime = broadcastPosition(id, entry.audio.duration);
        return entry.audio.play();
      }));
      syncAudio();
    } catch (error) { status(error.message || 'No se pudo iniciar el sonido. Abrí Iniciar-radio.cmd en Chrome o Edge.', true); if (context) { await context.close().catch(() => {}); context = null; } receiver = null; master = null; powered = false; }
    finally { starting = false; $('power').disabled = false; }
  }
  function stopScan() { clearInterval(scanTimer); scanTimer = null; $('scan').setAttribute('aria-pressed', 'false'); }
  function scan() {
    if (scanTimer) { stopScan(); return; }
    $('scan').setAttribute('aria-pressed', 'true'); changeStation(1); scanTimer = setInterval(() => changeStation(1), 4500);
  }
  function replaceStations(next, append = false) {
    const keep = append ? stations : [], existing = new Set(keep.map(s => s.id));
    const unique = next.filter(s => { if (existing.has(s.id)) return false; existing.add(s.id); return true; });
    if (append && !unique.length) return { added: 0, duplicate: next.length, clipped: false };
    const merged = [...keep, ...unique].slice(0, stationLimit); if (!merged.length) throw new Error('No hay emisoras disponibles.');
    stopScan(); prepareGeneration++; clearMedia();
    const old = stations; stations = Core.assign(merged);
    old.filter(s => s.source === 'local' && !stations.some(t => t.id === s.id)).forEach(s => URL.revokeObjectURL(s.file));
    $('station-filter').value = ''; renderStations(); tuneStation(stations[append ? Math.min(keep.length, stations.length - 1) : 0]); save();
    return { added: Math.min(unique.length, stationLimit - keep.length), duplicate: next.length - unique.length, clipped: keep.length + unique.length > stationLimit };
  }
  async function importSources(sources) {
    if (importController) importController.abort(); const controller = new AbortController(); importController = controller;
    const original = $('import-button').textContent;
    $('import-button').disabled = true; $('import-button').textContent = 'Leyendo tu contenido…'; $('cancel-import').hidden = false;
    document.querySelectorAll('[data-search]').forEach(b => b.disabled = true); feedback('Buscando videos y asignando las frecuencias automáticamente…');
    try {
      sources.forEach(Core.parseSource);
      if (!await checkServer({ wait: true, signal: controller.signal })) throw new Error(youtubeUnavailable);
      const { job } = await submitWhenAvailable('/api/resolve', { sources }, controller.signal);
      const result = await waitJob(job, controller.signal, 150000);
      if (controller.signal.aborted) return;
      const stats = replaceStations(result.stations.map(normalizeStation), $('import-mode').value === 'append');
      feedback(`${stats.added} ${stats.added === 1 ? 'emisora cargada' : 'emisoras cargadas'}. ${powered ? 'Preparando audio en segundo plano.' : 'Encendé la radio para preparar y escuchar.'}${stats.duplicate ? ` ${stats.duplicate} repetidas omitidas.` : ''}${result.limited || stats.clipped ? ` Se aplicó el máximo de ${stationLimit} emisoras.` : ''}${result.warnings?.length ? ' Algunos enlaces no pudieron cargarse.' : ''}`);
    } catch (error) { if (error.name !== 'AbortError') feedback(error.message, true); else feedback('Carga cancelada. Tu dial sigue disponible.'); }
    finally {
      if (importController === controller) { importController = null; $('import-button').disabled = false; $('import-button').textContent = original; $('cancel-import').hidden = true; document.querySelectorAll('[data-search]').forEach(b => b.disabled = false); }
    }
  }
  async function loadYoutubeAPI() {
    if (ytReady) return;
    if (ytLoading) return;
    ytLoading = true; $('youtube-message').textContent = 'Cargando vista de video…';
    window.onYouTubeIframeAPIReady = () => {
      const selected = nearest();
      ytPlayer = new YT.Player('youtube-player', { width: '100%', height: 220, videoId: selected?.source === 'youtube' ? selected.id : '', playerVars: { playsinline: 1, controls: 1, origin: location.origin }, events: {
        onReady: () => { ytReady = true; ytPlayer.mute(); if (videoVisible) syncVideo(); },
        onStateChange: event => { if (event.data === 1) { ytPlayer.mute(); if (!powered || !videoVisible) ytPlayer.pauseVideo(); } },
        onError: event => { $('youtube-message').textContent = event.data === 153 ? 'Abrí la radio con Iniciar-radio.cmd para mostrar el video.' : 'YouTube no permite mostrar este video aquí. Podés abrir el original.'; },
        onAutoplayBlocked: () => { $('youtube-message').textContent = 'Pulsá reproducir en el video para iniciar la imagen. El sonido sale por el filtro LC.'; }
      } });
    };
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { ytLoading = false; $('youtube-message').textContent = 'No se pudo conectar el reproductor de YouTube. El audio preparado sigue disponible.'; }; document.head.append(script);
  }
  function syncVideo() {
    if (!ytReady || !videoVisible) return; const s = nearest();
    if (!s || s.source !== 'youtube') { ytPlayer.pauseVideo(); return; }
    const generation = ++videoGeneration;
    $('youtube-link').href = 'https://www.youtube.com/watch?v=' + s.id;
    const local = media.get(s.id)?.audio, offset = local?.currentTime || 0;
    if (ytPlayer.getVideoData?.().video_id !== s.id) ytPlayer.cueVideoById({ videoId: s.id, startSeconds: offset });
    else if (Math.abs((ytPlayer.getCurrentTime?.() || 0) - offset) > 3) ytPlayer.seekTo(offset, true);
    ytPlayer.mute(); if (powered && generation === videoGeneration) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
    $('youtube-message').textContent = 'Video de referencia sin sonido. La emisora se escucha a través del filtro LC.';
  }
  function drawResponse() {
    if (!$('circuit-panel').open) return;
    const canvas = $('response-plot'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, b = bandInfo();
    ctx.clearRect(0, 0, w, h); const pad = 28, bottom = h - 23, top = 12;
    ctx.strokeStyle = '#c4cbbb'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const y = top + i * (bottom - top) / 3; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - 10, y); ctx.stroke(); }
    ctx.fillStyle = '#7a826f'; ctx.font = '9px Consolas,monospace'; ctx.fillText('RF + FI / ganancia', pad, 8);
    const map = f => pad + (f - b.min) / (b.max - b.min) * (w - pad - 10);
    stations.forEach((s, i) => { const x = map(stationFrequency(s)); ctx.strokeStyle = colors[i % colors.length] + '77'; ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, bottom - strength(s) * (bottom - top)); ctx.stroke(); });
    // Add samples close to resonance so the narrow peak remains visible.
    const freqs = Array.from({ length: w * 2 }, (_, i) => b.min + i / (w * 2 - 1) * (b.max - b.min));
    freqs.push(frequency); freqs.sort((a, b) => a - b);
    ctx.strokeStyle = '#426047'; ctx.lineWidth = 1.7; ctx.beginPath(); freqs.forEach((f, i) => { const x = map(f), y = bottom - Core.response(f, frequency, band, width) * (bottom - top); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    ctx.fillStyle = '#ab5836'; ctx.fillText('f₀ ' + formatFrequency(frequency), Core.clamp(map(frequency) - 26, pad, w - 80), bottom + 17);
  }
  const fftValues = new Float32Array(1024);
  function drawSpectrum() {
    if (!$('circuit-panel').open) return;
    const canvas = $('frequency-spectrum'), ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, left = 52, right = w - 20, top = 22, bottom = h - 40;
    const audio = $('spectrum-view').value === 'audio', b = bandInfo();
    const min = audio ? 0 : b.min, max = audio ? Math.min(20000, context ? context.sampleRate / 2 : 20000) : b.max;
    const x = f => left + (f - min) / (max - min) * (right - left);
    const y = db => bottom - Core.clamp((db + 100) / 100, 0, 1) * (bottom - top);
    ctx.clearRect(0, 0, w, h); ctx.font = '12px Consolas,monospace';
    ctx.textAlign = 'right';
    for (let db = -100; db <= 0; db += 20) {
      ctx.strokeStyle = '#c4cbbb'; ctx.beginPath(); ctx.moveTo(left, y(db)); ctx.lineTo(right, y(db)); ctx.stroke();
      ctx.fillStyle = '#777970'; ctx.fillText(String(db), left - 8, y(db) + 4);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const f = min + (max - min) * i / 5;
      ctx.fillStyle = '#777970'; ctx.fillText(audio ? (f / 1000).toFixed(0) : f.toFixed(band === 'FM' ? 1 : 0), x(f), bottom + 19);
    }
    ctx.textAlign = 'left'; ctx.fillText(audio ? 'dBFS' : 'dB relativos', left, 14);
    ctx.textAlign = 'right'; ctx.fillText(audio ? 'kHz' : b.unit, right, h - 4);
    if (audio) {
      fftValues.fill(-Infinity);
      if (powered && analyser) analyser.getFloatFrequencyData(fftValues);
      ctx.strokeStyle = '#ab5836'; ctx.lineWidth = 2; ctx.beginPath();
      let started = false;
      for (let i = 0; i < fftValues.length; i++) {
        const f = i * (context ? context.sampleRate : 48000) / 2048;
        if (f > max) break;
        const px = x(f), py = y(fftValues[i]);
        if (started) ctx.lineTo(px, py); else { ctx.moveTo(px, py); started = true; }
      }
      ctx.stroke();
      $('spectrum-note').textContent = powered ? 'FFT en tiempo real del audio de salida. Eje horizontal: frecuencia; vertical: nivel en dBFS.' : 'Encendé la radio para ver el espectro del audio en tiempo real.';
    } else {
      const half = Core.bandwidth(band, width) / b.scale / 2;
      ctx.fillStyle = '#42604718'; ctx.fillRect(x(Math.max(min, frequency - half)), top, (Math.min(max, frequency + half) - Math.max(min, frequency - half)) / (max - min) * (right - left), bottom - top);
      ctx.strokeStyle = '#426047'; ctx.lineWidth = 2; ctx.beginPath();
      const points = Array.from({length: 1441}, (_, i) => min + (max - min) * i / 1440);
      points.push(frequency); points.sort((a, b) => a - b);
      points.forEach((f, i) => { const py = y(20 * Math.log10(Math.max(Core.response(f, frequency, band, width), 1e-5))); i ? ctx.lineTo(x(f), py) : ctx.moveTo(x(f), py); }); ctx.stroke();
      stations.forEach((s, i) => {
        const f = stationFrequency(s), px = x(f), db = 20 * Math.log10(Math.max(strength(s), 1e-5));
        ctx.strokeStyle = colors[i % colors.length]; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(px, bottom); ctx.lineTo(px, top); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = colors[i % colors.length]; ctx.beginPath(); ctx.arc(px, y(db), 3, 0, Math.PI * 2); ctx.fill();
      });
      $('spectrum-note').textContent = 'Portadoras: líneas de colores. Puntos: nivel relativo tras el filtro. Verde: respuesta del receptor. Vista calculada; no es una FFT de RF.';
    }
  }
  function paint(now) {
    if (now - lastPaint > 70) {
      let rms = 0; if (powered && analyser) { analyser.getByteTimeDomainData(wave); for (const v of wave) rms += ((v - 128) / 128) ** 2; rms = Math.sqrt(rms / wave.length); }
      outputRms = rms;
      $('boombox').classList.toggle('playing', powered && rms > .005); document.querySelectorAll('.speaker-cone').forEach((cone, i) => cone.style.transform = `scale(${1 + (powered ? physics?.displacementMm?.[i] || 0 : 0) / 100})`);
      if (powered && analyser) analyser.getByteFrequencyData(spectrum); else spectrum.fill(0);
      [...$('level-leds').children].forEach((el, i) => {
        const lo = Math.max(1, Math.round(2 ** (i * .65))), hi = Math.min(spectrum.length, Math.max(lo + 1, Math.round(2 ** ((i + 1) * .65))));
        let power = 0; for (let k = lo; k < hi; k++) power += 10 ** ((analyser ? analyser.minDecibels + spectrum[k] / 255 * (analyser.maxDecibels - analyser.minDecibels) : -100) / 10);
        const db = 10 * Math.log10(Math.max(power / (hi - lo), 1e-12));
        el.style.height = powered ? Core.clamp((db + 75) / 60 * 100, 2, 100) + '%' : '2%';
      });
      lastPaint = now;
    }
    if (now - lastPlot > 180) { drawResponse(); drawSpectrum(); lastPlot = now; }
    requestAnimationFrame(paint);
  }
  $('power').addEventListener('click', togglePower); $('power-main').addEventListener('click', togglePower); $('prev').addEventListener('click', () => { stopScan(); changeStation(-1); }); $('next').addEventListener('click', () => { stopScan(); changeStation(1); }); $('scan').addEventListener('click', scan);
  $('frequency-slider').addEventListener('input', e => { stopScan(); setFrequency(+e.target.value); });
  $('capacitor').addEventListener('input', e => { stopScan(); setFrequency(Core.frequency(+e.target.value, band)); });
  $('bandwidth').addEventListener('change', e => { width = +e.target.value; updateReadouts(); syncAudio(); save(); });
  document.querySelectorAll('[data-band]').forEach(el => el.addEventListener('click', () => { stopScan(); switchBand(el.dataset.band); }));
  $('volume').addEventListener('input', e => { volume = +e.target.value / 100; updateReadouts(); save(); });
  ['antenna-strength', 'temperature', 'reflection'].forEach(id => $(id).addEventListener('input', updateReadouts));
  $('nostalgia').addEventListener('change', () => { updateReadouts(); save(); });
  function updateControlMode() { const laptop = $('control-mode').value === 'laptop'; $('tuning-hint').textContent = laptop ? 'Laptop: − / + o ← → · A / D cambian emisora · arrastrá el dial' : 'Rueda sobre el dial · arrastrá la perilla · ← → sintonía fina'; save(); }
  $('control-mode').addEventListener('change', updateControlMode);
  const fineStep = direction => { stopScan(); setFrequency(frequency + direction * bandInfo().step); };
  function holdButton(id, direction) {
    let repeat, timer; const stop = () => { clearInterval(repeat); clearTimeout(timer); };
    $(id).addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); $(id).setPointerCapture(e.pointerId); fineStep(direction); timer = setTimeout(() => { repeat = setInterval(() => fineStep(direction), 70); }, 350); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => $(id).addEventListener(type, stop));
    $(id).addEventListener('click', e => { if (e.detail === 0) fineStep(direction); });
  }
  holdButton('tune-down', -1); holdButton('tune-up', 1);
  function wheelTune(e) {
    if ($('control-mode').value !== 'wheel') return; e.preventDefault();
    const now = performance.now(); if (now - lastWheel < 22) return; lastWheel = now; stopScan();
    const units = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1;
    const amount = Core.clamp(Math.abs(e.deltaY * units) / 60, .25, 3);
    setFrequency(frequency + Math.sign(e.deltaY) * bandInfo().step * amount * (e.shiftKey ? .2 : 1));
  }
  [$('tuning-knob'), $('dial-glass')].forEach(el => el.addEventListener('wheel', wheelTune, { passive: false }));
  $('tuning-knob').addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.preventDefault(); stopScan(); const el = e.currentTarget, startX = e.clientX, startY = e.clientY, startF = frequency;
    el.setPointerCapture(e.pointerId);
    const move = event => setFrequency(startF + ((event.clientX - startX) - (event.clientY - startY)) * (bandInfo().max - bandInfo().min) / 420);
    const stop = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', stop); el.removeEventListener('pointercancel', stop); el.removeEventListener('lostpointercapture', stop); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('lostpointercapture', stop);
  });
  $('dial-glass').addEventListener('pointerdown', e => {
    if (e.button !== 0) return; stopScan(); const el = e.currentTarget, rect = el.querySelector('.dial-scales').getBoundingClientRect(); el.setPointerCapture(e.pointerId);
    const move = event => setFrequency(bandInfo().min + Core.clamp((event.clientX - rect.left) / rect.width, 0, 1) * (bandInfo().max - bandInfo().min));
    move(e); const stop = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', stop); el.removeEventListener('pointercancel', stop); el.removeEventListener('lostpointercapture', stop); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('lostpointercapture', stop);
  });
  document.addEventListener('keydown', e => {
    const target = e.target;
    if (target.closest('input,textarea,select,[contenteditable=true]') || (target.closest('button,a,summary') && [' ', 'Enter'].includes(e.key))) return;
    if (e.key === ' ' && !e.repeat) { e.preventDefault(); togglePower(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); fineStep((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? .2 : 1)); }
    if (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'd') { stopScan(); changeStation(e.key.toLowerCase() === 'd' ? 1 : -1); }
  });
  $('import-form').addEventListener('submit', e => { e.preventDefault(); const input = $('source-input').value.trim(); if (!input) { feedback('Pegá un enlace, un @canal o el nombre de un artista.', true); $('source-input').focus(); return; } importSources(input.split(/\n+/).map(s => s.trim()).filter(Boolean)); });
  document.querySelectorAll('[data-search]').forEach(el => el.addEventListener('click', () => { $('source-input').value = el.dataset.search; importSources([el.dataset.search]); }));
  $('cancel-import').addEventListener('click', () => importController?.abort());
  $('station-limit').addEventListener('change', () => {
    const input = $('station-limit'), value = Number(input.value);
    if (!Number.isInteger(value) || value < 1 || value > MAX) {
      input.value = stationLimit;
      feedback(`Elegí un número entero entre 1 y ${MAX}.`, true);
      return;
    }
    stationLimit = value;
    if (stations.length > stationLimit) replaceStations(stations.slice(0, stationLimit));
    else { save(); renderStations(); }
    feedback(`Máximo: ${stationLimit} ${stationLimit === 1 ? 'emisora' : 'emisoras'}. En el dial: ${stations.length}.`);
  });
  $('station-filter').addEventListener('input', renderStations);
  $('demo-button').addEventListener('click', () => {
    importController?.abort();
    replaceStations(demo);
    feedback(`${stations.length} emisoras demo listas para escuchar.`);
  });
  $('prepare-all').addEventListener('change', () => { if ($('prepare-all').checked) backgroundPreparation(); });
  $('local-import-button').addEventListener('click', () => $('local-files').click());
  $('local-files').addEventListener('change', e => {
    const files = [...e.target.files]; const tracks = files.map((file, i) => ({ id: 'local-' + crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), artist: 'Archivo propio', source: 'local', file: URL.createObjectURL(file) }));
    if (tracks.length) { const stats = replaceStations(tracks, $('import-mode').value === 'append'); tracks.filter(s => !stations.some(t => t.id === s.id)).forEach(s => URL.revokeObjectURL(s.file)); feedback(`${stats.added} archivos cargados con filtro LC. Los archivos propios quedan disponibles durante esta sesión.`); }
    e.target.value = '';
  });
  $('export-dial').addEventListener('click', () => {
    const data = { version: 1, stations: stations.filter(s => s.source === 'demo' || s.source === 'youtube').map(normalizeStation) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'mi-frecuencia-90.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (stations.some(s => s.source === 'local')) feedback('Dial exportado. Los archivos propios se vuelven a agregar desde tu equipo.');
  });
  $('import-dial').addEventListener('click', () => $('dial-file').click());
  $('dial-file').addEventListener('change', async e => {
    try { const file = e.target.files[0]; if (!file) return; if (file.size > 1000000) throw new Error('Ese archivo es demasiado grande.'); const data = JSON.parse(await file.text()); if (data.version !== 1 || !Array.isArray(data.stations) || !data.stations.length || data.stations.length > MAX || !data.stations.every(isValidStation)) throw new Error('Ese archivo no contiene un dial válido.'); replaceStations(data.stations.map(normalizeStation), $('import-mode').value === 'append'); feedback('Tu dial guardado ya está cargado.'); }
    catch (error) { feedback(error.message || 'No se pudo importar ese archivo.', true); } finally { e.target.value = ''; }
  });
  $('show-video').addEventListener('click', () => { videoVisible = !videoVisible; $('youtube-section').hidden = !videoVisible; updateReadouts(); if (videoVisible) { loadYoutubeAPI(); syncVideo(); } else ytPlayer?.pauseVideo?.(); });
  $('retry-audio').addEventListener('click', () => { const s = nearest(); if (!s) return; failed.delete(s.id); updateReadouts(); if (powered) syncAudio(); else togglePower(); });
  window.addEventListener('pagehide', () => { save(); media.forEach(entry => entry.audio.pause()); });
  for (let i = 0; i < 10; i++) $('level-leds').append(document.createElement('i'));
  renderStations(); updateControlMode(); requestAnimationFrame(paint);
  checkServer().then(ok => { if (!ok) $('import-help').textContent = youtubeUnavailable; });
  window.RetroRadio = { state: () => ({ powered, band, frequency, capacitance: Core.capacitance(frequency, band), width, physics, audioRms: outputRms, stations: stations.map(s => ({ id: s.id, title: s.title, frequency: stationFrequency(s), gain: strength(s), prepared: prepared.has(s.id) || s.source !== 'youtube', error: failed.get(s.id) })), activeId, context: context?.state, sampleRate: context?.sampleRate, slots: [...slots], serverAvailable }), tune: setFrequency, band: switchBand, power: togglePower, restoreDemo: () => replaceStations(demo) };
})();
