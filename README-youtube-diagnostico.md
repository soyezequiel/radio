# Diagnostico del audio de YouTube

Pruebas del 30 de septiembre de 2026. Frontend: https://radio-blue-eight.vercel.app/ . Backend: https://frecuencia90-audio.onrender.com . No se usaron cookies, cuentas ni proxies de terceros.

## Resultado comprobado

El backend responde y acepta CORS desde Vercel. Importar el titulo y autor de un video mediante oEmbed funciona. La extraccion del enlace de audio falla antes de retransmitirlo: YouTube responde HTTP 403 a las consultas de reproduccion. Tambien aparecio HTTP 429 en las paginas de video.

Video de comparacion: `aqz-KE-bpKQ`, Big Buck Bunny, publicado por Blender.

| Prueba | Resultado |
| --- | --- |
| Render, yt-dlp nightly 2026.9.27.232945.dev0 y Node | HTTP 403 |
| Render, compatibilidad de solicitudes con Chrome | HTTP 403 |
| Render, BgUtils 2.0.0, cliente mweb y tokens por video | HTTP 429 en la pagina; HTTP 403 en la API |
| Render, mismo proveedor y API en youtubei.googleapis.com | Se obtuvo un token de Player; la API siguio devolviendo HTTP 403 |
| PC, misma version nightly, sin tokens ni cookies | Extraccion en 2,4 segundos; audio WebM, HTTP 206 y 4096 bytes recibidos |

El proveedor de tokens se cargo correctamente y el log confirmo `Retrieved a player PO Token for mweb client`. Por lo tanto, instalar el plugin no resuelve por si solo el rechazo observado en este servicio.

La comparacion apunta a una restriccion de la red o sesion de salida de Render. No conocemos la regla interna de YouTube y no podemos afirmar que todas las regiones o todos los servidores de Render esten bloqueados. Render documenta que los servicios de cada region comparten rangos de IP de salida.

La simulacion AM/FM, el circuito LC y la FFT siguen ejecutandose en el navegador. Cambiar donde se obtiene el audio conserva ese procesamiento.

## Alternativas gratuitas

### Backend en la PC y frontend en Vercel

Es la unica ubicacion que paso la prueba real de audio durante esta investigacion. Para probarla desde Internet, un Quick Tunnel de Cloudflare puede publicar un servidor HTTP local por HTTPS sin cuenta ni dominio. El circuito se mantiene en Vercel; la PC obtiene y retransmite el audio, y debe permanecer encendida y conectada.

El backend publico debe iniciarse con `RADIO_API_ONLY=1`, `RADIO_ALLOWED_ORIGINS=https://radio-blue-eight.vercel.app` y host `127.0.0.1`, usando un puerto dedicado. Asi solo se publican API y audio, no los archivos del proyecto. El tunel apunta a ese puerto. La URL obtenida se configura como `RADIO_API_URL` en Vercel y se vuelve a publicar el frontend.

Los Quick Tunnels son para pruebas: la URL cambia cada vez que se inicia el tunel y no hay garantia de disponibilidad. No se ha instalado ni publicado un tunel durante esta investigacion. Para una direccion estable, hay que elegir un tunel y hostname permanentes con su configuracion correspondiente.

### Probar una region diferente de Render

Render no permite cambiar la region de un servicio existente. Se puede crear otro Web Service con el mismo repositorio, Dockerfile, plan Free y origen permitido, en una region distinta. Hay que comprobar `/api/audio` y luego que `/api/media/ID` realmente entregue bytes; `/api/health` por si solo no verifica YouTube.

Esta es una prueba, no una solucion garantizada: cambia los rangos de salida, pero la nueva red tambien puede recibir rechazos. No hace falta borrar el servicio actual para comparar. No se ha creado otro servicio ni contratado recursos pagos.

Se preparo `render-region-test.yaml` para probar Frankfurt con plan Free. En Render, crea un Blueprint separado del mismo repositorio y usa ese archivo como Blueprint Path. El `render.yaml` habitual conserva el servicio actual. Cuando termine el despliegue, hay que probar el audio en la URL nueva antes de apuntar Vercel a ella. Los servicios gratuitos comparten las cuotas del workspace; este archivo no activa un servicio automaticamente.

## Fuentes

- [Guia oficial de PO Tokens de yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide): recomienda un proveedor automatico, con tokens vinculados a cada video.
- [BgUtils POT Provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider): instalacion del script y plugin; advierte que los tokens no garantizan resolver los errores 403.
- [Caso reciente con el mismo error](https://github.com/yt-dlp/yt-dlp/issues/17681): el autor informa una solucion con proveedor de tokens. Esa solucion se probo aqui sin conseguir audio desde Render.
- [Rangos de salida de Render](https://render.com/docs/outbound-ip-addresses): los servicios de una region comparten rangos.
- [Regiones de Render](https://render.com/docs/regions): cambiar de region requiere otro servicio.
- [Quick Tunnels de Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/): HTTPS temporal para un servidor local, sin cuenta ni dominio; limites y uso para pruebas.
