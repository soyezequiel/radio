(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RetroCore = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const bands = {
    FM: { min: 87.5, max: 108, unit: 'MHz', scale: 1e6, L: 100e-9, bandwidth: 180000, step: .025 },
    AM: { min: 530, max: 1700, unit: 'kHz', scale: 1000, L: 100e-6, bandwidth: 9000, step: 1 }
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function capacitance(f, band = 'FM') {
    const b = bands[band];
    return 1e12 / ((2 * Math.PI * f * b.scale) ** 2 * b.L);
  }
  function frequency(c, band = 'FM') {
    const b = bands[band];
    return 1 / (2 * Math.PI * Math.sqrt(b.L * c * 1e-12)) / b.scale;
  }
  function response(carrier, tuned, band = 'FM', width = 1) {
    const b = bands[band], delta = (carrier - tuned) * b.scale, fs = 768000;
    const bw = bandwidth(band, width), front = band === 'FM' ? 2000000 : 60000;
    const alpha = 1 - Math.exp(-Math.PI * front / fs), pole = 1 - alpha;
    const preselector = alpha / Math.sqrt(1 + pole * pole - 2 * pole * Math.cos(2 * Math.PI * delta / fs));
    const ratio = Math.tan(Math.PI * delta / fs) / Math.tan(Math.PI * bw / 2 / fs);
    return Math.abs(delta) < 280000 ? preselector / Math.sqrt(1 + ratio ** 8) : 0;
  }
  function bandwidth(band, width = 1) { return Math.min(band === 'FM' ? 240000 : 18000, bands[band].bandwidth * width); }
  function assign(stations) {
    return stations.map((s, i) => ({ ...s, frequencies: Object.fromEntries(Object.entries(bands).map(([name, b]) => {
      const f = b.min + (b.max - b.min) * (i + 1) / (stations.length + 1);
      return [name, Number(f.toFixed(name === 'FM' ? 2 : 0))];
    })) }));
  }
  function parseSource(input) {
    const raw = input.trim();
    if (!raw) throw new Error('Pegá un enlace o escribí qué querés escuchar.');
    if (/^@[\w.\-]+$/.test(raw)) return { kind: 'channel', url: 'https://www.youtube.com/' + raw + '/videos' };
    if (/^[\w-]{11}$/.test(raw)) return { kind: 'video', id: raw, url: 'https://www.youtube.com/watch?v=' + raw };
    if (!/^(https?:\/\/|(?:www\.|music\.|m\.)?(?:youtube\.com|youtu\.be)\/)/i.test(raw)) {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) throw new Error('Usá un enlace de YouTube o YouTube Music.');
      return { kind: 'search', query: raw };
    }
    let u;
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); }
    catch { throw new Error('Ese enlace no es válido.'); }
    if (!['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(u.hostname)) throw new Error('Usá un enlace de YouTube o YouTube Music.');
    const list = u.searchParams.get('list');
    if (list && /^[\w-]{10,150}$/.test(list)) return { kind: 'playlist', id: list, url: 'https://www.youtube.com/playlist?list=' + list };
    const id = u.hostname.endsWith('youtu.be') ? u.pathname.split('/')[1] : u.searchParams.get('v') || (/^\/(shorts|live|embed)\//.test(u.pathname) ? u.pathname.split('/')[2] : null);
    if (id && /^[\w-]{11}$/.test(id)) return { kind: 'video', id, url: 'https://www.youtube.com/watch?v=' + id };
    if (/^\/(@[\w.\-]+|channel\/UC[\w-]+|user\/[\w.\-]+|c\/[\w.\-]+)/.test(u.pathname)) {
      return { kind: 'channel', url: 'https://www.youtube.com' + u.pathname.replace(/\/(videos|featured|streams|shorts|playlists)\/?$/, '').replace(/\/$/, '') + '/videos' };
    }
    throw new Error('Pegá el enlace de un video, una playlist pública o un canal.');
  }
  function createBroadcastClock(now = () => performance.now() / 1000, random = Math.random) {
    const epoch = now(), offsets = new Map();
    return (id, duration) => {
      if (!Number.isFinite(duration) || duration <= 0) return 0;
      if (!offsets.has(id)) offsets.set(id, random() * duration);
      return (offsets.get(id) + Math.max(0, now() - epoch)) % duration;
    };
  }
  return { bands, clamp, capacitance, frequency, response, bandwidth, assign, parseSource, createBroadcastClock };
});
