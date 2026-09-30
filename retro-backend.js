(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.RadioBackend = factory(root.RADIO_CONFIG || {}, root.location, root.fetch.bind(root));
})(typeof window === 'undefined' ? globalThis : window, function(config, location, fetcher) {
  'use strict';
  const base = (config.apiBase || '').replace(/\/$/, '');
  if (base) {
    const url = new URL(base);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('El servidor de audio requiere HTTPS.');
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Usá el origen del servidor de audio, sin rutas ni credenciales.');
  }
  const apiUrl = path => base + path;
  const mediaUrl = path => {
    const url = new URL(path, base || location.origin);
    if (url.origin !== (base || location.origin) || !/^\/(?:api\/media\/[\w-]{11}|radio-cache\/[\w-]{11}(?:\.source)?\.(?:mp3|webm|m4a|ogg))$/.test(url.pathname)) throw new Error('El servidor devolvió una dirección de audio no válida.');
    return url.href;
  };
  const pause = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Cancelado', 'AbortError')); return; }
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelado', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
  async function ready({ wait = false, signal, onWaiting = () => {}, timeoutMs = 100000, retryMs = 2000 } = {}) {
    const deadline = Date.now() + (wait ? timeoutMs : 4000);
    let announced = false;
    do {
      if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
      const timeout = AbortSignal.timeout(Math.max(1, Math.min(wait ? 12000 : 4000, deadline - Date.now())));
      try {
        const response = await fetcher(apiUrl('/api/health'), { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store' });
        if (response.ok && (await response.json()).ok === true) return true;
        if (response.status === 403) return false; // Configuration error, not an idle service.
      } catch (error) { if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError'); }
      if (!wait || Date.now() >= deadline) return false;
      if (!announced) { onWaiting(); announced = true; }
      await pause(Math.min(retryMs, Math.max(1, deadline - Date.now())), signal);
    } while (Date.now() < deadline);
    return false;
  }
  return { base, apiUrl, mediaUrl, ready };
});
