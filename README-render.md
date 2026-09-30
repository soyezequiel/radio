# Backend de audio en Render Free

Frontend: Vercel. Backend: Python y yt-dlp en Render. AM/FM, circuito y FFT se ejecutan en el navegador. El servidor recibe videos, playlists, canales o busquedas y suministra audio real por streaming. No hace falta compartir pestanas.

## Publicar

1. Sube estos cambios al repositorio https://github.com/soyezequiel/radio.
2. En https://dashboard.render.com crea **New > Blueprint** y conecta ese repositorio. Usa la carpeta que contiene `render.yaml` como raiz si el proyecto esta anidado.
3. La configuracion crea `frecuencia90-audio` con **plan free**, Docker y health check `/api/health`. No agregues disco ni servicios pagos.
4. `render.yaml` ya configura `RADIO_ALLOWED_ORIGINS` con `https://radio-blue-eight.vercel.app`. Si cambias de dominio, actualiza esa variable sin ruta ni barra final. Si necesitas varios dominios, separalos por comas. Usa origenes concretos, sin comodines. Los dominios de previews se habilitan de forma explicita.
5. Despliega y copia la URL asignada: `https://TU-BACKEND.onrender.com`.
6. El build de Vercel ya usa `https://frecuencia90-audio.onrender.com`. Si cambias de servicio, configura **RADIO_API_URL** y hace Redeploy.

Si no usas Blueprint: crea **New > Web Service**, conecta el mismo repo, selecciona runtime **Docker**, plan **Free**, Dockerfile `./Dockerfile`, health check `/api/health` y configura `RADIO_ALLOWED_ORIGINS`.

## Verificar el despliegue

- Abre `https://TU-BACKEND.onrender.com/api/health`: debe devolver `ok: true`. Esto comprueba el servidor, no el acceso a YouTube.
- Desde Vercel, importa un video publico corto y enciende la radio. Comprueba que se prepare y que se escuche.
- Cambia el capacitor: la salida debe atenuarse al desintonizar. La FFT debe reflejar el sonido del receptor.
- Carga varias emisoras y cambia entre ellas. Prueba un salto de reproduccion y comprueba respuestas Range/206 en Network.

Si el navegador informa CORS, revisa `RADIO_ALLOWED_ORIGINS` en Render: debe coincidir exactamente con el origen visible en Vercel. Si la salud funciona pero falla la preparacion, consulta los logs de Render; YouTube puede rechazar la IP de datacenter. El proyecto no usa cookies ni cuenta de YouTube y no garantiza acceso a todos los videos.

## Limites gratuitos

Render Free se duerme tras 15 minutos sin trafico y puede tardar cerca de un minuto en iniciar. La radio espera hasta 100 segundos cuando se importa o prepara audio, y Cancelar carga corta esa espera. No se mantiene despierto artificialmente.

Los trabajos y enlaces preparados se mantienen en memoria y se pierden al reiniciar. Las URLs `/api/media/ID` vuelven a obtener el enlace de origen cuando hace falta. El streaming nuevo no guarda canciones; `/tmp/radio-cache` es temporal y no usa disco persistente.

Hay una cola limitada y un presupuesto global de 30 solicitudes de preparacion/importacion por minuto. CORS restringe el acceso desde navegadores a los origenes configurados, pero no reemplaza autenticacion: una API publica puede recibir llamadas externas. Si el trafico crece, agrega controles de acceso y revisa las cuotas antes de abrir el sitio masivamente.

Render Free tiene limites de ancho de banda y puede suspender un servicio con mucho trafico externo. Revisa el plan elegido y el consumo en el panel. No se ha contratado ningun recurso pago.

## Entorno local y pruebas

`Iniciar-radio.cmd` sigue abriendo el servidor en `127.0.0.1:8877`. Docker usa `0.0.0.0`, el puerto `PORT` de Render y solo sirve rutas API/audio, sin exponer archivos de codigo.

- `npm test`: circuito, cola y conexion frontend/backend.
- `python tools/test_retro_server.py`: fuentes, streaming, Range, CORS, origenes y limites.
- `npm run build`: frontend publicable en Vercel.

La imagen instala yt-dlp actualizado del canal nightly al compilar para recoger correcciones recientes del extractor. `/api/health` informa la version, presencia de Node, proveedor de tokens y revision desplegada. Para actualizarlo, usa Clear build cache & deploy en Render. El contenedor incluye Node desde la imagen versionada de BgUtils y su plugin 2.0.0 para generar tokens de reproduccion por video con el cliente mweb. Solo prepara un audio a la vez cuando ese proveedor esta configurado. No necesita FFmpeg porque retransmite audio WebM/M4A sin convertirlo.

Documentacion: https://render.com/docs/free y https://render.com/docs/blueprint-spec

Frontend actual: https://radio-blue-eight.vercel.app/

Backend actual: https://frecuencia90-audio.onrender.com

Validacion del 30 de septiembre de 2026: salud y CORS funcionan desde Vercel, pero la extraccion de varios videos publicos falla con HTTP 403 en las solicitudes a YouTube. Actualizar a nightly, probar solicitudes compatibles con Chrome, generar tokens por video y cambiar al otro host oficial de la API no resolvio ese rechazo. El mismo video si entrego audio desde la PC con la misma version del extractor, sin cookies ni cuenta. La conexion esta configurada; el audio de YouTube no esta operativo en este despliegue. Las demos, archivos propios y simulacion siguen disponibles. Ver [diagnostico y alternativas](README-youtube-diagnostico.md).
