# Frecuencia 90

Radio personal inspirada en el equipo plateado de referencia: asa, antena telescópica, cuatro parlantes, casetera, dial analógico y medidor de audio. La interfaz se dibuja con HTML y CSS, sin imágenes remotas ni bibliotecas de interfaz.

## Abrir

Doble clic en **Iniciar-radio.cmd**. Se abre `http://127.0.0.1:8877/retro.html` y el servidor queda activo mientras permanezca abierta su consola. Chrome o Edge son recomendados. Para detenerlo, cerrá la consola o presioná Ctrl+C.

Esta máquina ya tiene Python, Node y FFmpeg. El iniciador instala `yt-dlp[default]` automáticamente si falta. En otra máquina necesitás Python 3.10+ y Node 22+ disponibles en PATH. La reproducción por streaming no requiere FFmpeg. No hace falta una clave de Google ni iniciar sesión en YouTube.

También se puede ejecutar `python tools/retro_server.py --open`. El servidor escucha solo en esta computadora. Abrir `retro.html` desde el disco permite ver la interfaz, pero el filtro AudioWorklet y la importación necesitan el servidor local. El laboratorio anterior, `radio.html`, conserva su funcionamiento original sin servidor.

## Escuchar y cargar contenido

- Pulsá **Encender radio** o el botón POWER. Las tres emisoras del laboratorio anterior vienen incluidas.
- Pegá un enlace de video, canal o playlist pública de YouTube / YouTube Music y pulsá **Crear mis emisoras**. Un `@canal` también sirve. Cada video recibe una frecuencia automáticamente.
- Podés pegar hasta 20 enlaces, uno por línea, en una sola carga. La opción **Sumar al dial actual** conserva las emisoras existentes; se omiten los duplicados.
- Escribí un artista o género para cargar 12 resultados de búsqueda. Los tres accesos rápidos hacen esto con un clic.
- El dial admite 180 emisoras. Para listas o canales más grandes, carga las primeras 180 entradas públicas disponibles. Las listas privadas, eliminadas o que requieren sesión no se pueden leer.
- Con la radio encendida, el audio de la emisora sintonizada se prepara primero. **Preparar todo el dial en segundo plano** prepara progresivamente las demás. Al desactivarlo o apagar la radio no se inician nuevas preparaciones; una que ya esté en curso puede terminar.
- Los MP3 y audios originales ya descargados en `radio-cache/` se reutilizan directamente. Para contenido nuevo, el servidor obtiene el enlace de audio y lo transmite por partes: ya no espera a descargar y convertir el video completo. Los nuevos streams no se guardan como MP3.
- Se preparan como máximo dos audios a la vez por pestaña. La emisora sintonizada tiene prioridad sobre las pendientes; si el servidor está ocupado, la radio espera y reintenta automáticamente. El tiempo en cola no consume el plazo de preparación y los audios guardados se abren aunque la cola esté llena.
- **Agregar mis archivos de audio** permite usar MP3, WAV y otros formatos que soporte el navegador. También pasan por el filtro. Estos archivos quedan disponibles durante la sesión; sus rutas privadas no se guardan ni se exportan.
- El dial de YouTube se guarda en el navegador. Las flechas pequeñas permiten exportarlo e importarlo como JSON.
- **Ver video de esta emisora** muestra el reproductor original sin sonido, como referencia visual, mientras la radio reproduce el audio procesado. Puede existir un pequeño desfase y algunos propietarios impiden la reproducción embebida.

YouTube puede rechazar una preparación por restricciones de acceso, región o cambios de su servicio. La interfaz muestra el error y permite reintentar o agregar un archivo local. No se accede a cookies ni a cuentas. Los directos y contenidos de más de cuatro horas no se preparan como archivos. La caché no se elimina automáticamente: ocupa espacio según los audios cargados.

## Sintonizar

Cada emisora tiene un punto de reproducción inicial aleatorio e independiente. Su transmisión sigue avanzando durante la sesión, incluso al apagar la radio o escuchar otra frecuencia. Volver a sintonizar entra en el momento actual del audio en bucle, sin reiniciar la canción ni elegir otro punto al azar.

La rueda del mouse sobre la perilla o el dial mueve la frecuencia de forma continua. También podés arrastrar ambos, usar el deslizador, tocar una emisora o los botones anterior/siguiente. SCAN recorre el dial cada 4,5 segundos.

En **Laptop**, la rueda deja de capturarse, así el touchpad puede desplazar la página. Usá los botones − / +, mantenelos presionados para avanzar, o arrastrá el deslizador.

- Espacio: encender / apagar.
- ← / →: sintonía fina. Shift hace el paso cinco veces más pequeño.
- A / D: emisora anterior / siguiente.

Los atajos respetan los campos de texto y controles nativos. El audio de las emisoras conserva un reloj común: las preparadas siguen en segundo plano cuando están entre los cinco vecinos procesados; al volver a una más lejana, su posición se calcula con ese reloj. Al apagar el receptor, las transmisiones siguen avanzando durante la sesión. Volumen cero silencia también la estática.

## Filtrado y alcance del modelo

La radio retro utiliza ahora `retro-physics.js`: transmisores AM o FM, mezcla común de señales, ruido térmico, preselector RF, filtro de frecuencia intermedia y un único demodulador. AM incluye detector RC y AGC; FM incluye desviación de frecuencia, preénfasis/deénfasis y decodificación estéreo mediante PLL del piloto. La salida pasa por un amplificador con tensión limitada y dos modelos electromeánicos de parlante.

La estática y los batidos salen de la simulación de recepción. Se eliminaron el bucle de ruido, el silbido y los incrementos de estática añadidos al cambiar de frecuencia. El capacitor sigue la relación inversa C/f y la selectividad corresponde al filtro FI. Detrás del dial se pueden cambiar la señal de antena, temperatura y una trayectoria reflejada, y ver las mediciones del receptor. Las fuentes mono siguen siendo mono; las tres demostraciones conservan su banda de 3 kHz.

Es un modelo numérico con parámetros representativos, no una reconstrucción medida de la radio de referencia. El detalle de ecuaciones, parámetros, fuentes y límites está en [README-retro-physics.md](README-retro-physics.md).

## Comprobación

`node tools/test_retro.cjs` comprueba C/f, el reloj de las emisoras, frecuencias únicas, parsing, el worklet estéreo y las pruebas físicas. `node tools/test_retro_physics.cjs` contrasta el ruido con 4kTR, prueba AM/FM, batidos RF, captura, separación estéreo, estabilidad y la respuesta del parlante contra una solución independiente.

`python tools/test_retro_server.py` comprueba los tipos de fuente, los límites de identificadores, la cola, los reintentos y la respuesta HTTP ante saturación. `node tools/test_retro_preparation.cjs` verifica el límite de cargas simultáneas, la prioridad al sintonizar y la cancelación de pendientes. `node tools/test_radio_dsp.cjs` verifica que el modelo anterior siga funcionando.

`node tools/test_retro_preparation_browser.cjs` comprueba en Chrome el reintento automático, la sintonía rápida, la cancelación al apagar y la espera en cola. Requiere Playwright, el servidor activo y el audio `5rAOyh7YmEc.mp3` en caché. `PLAYWRIGHT_MODULE` permite indicar una instalación existente de Playwright; `RADIO_URL` permite usar otro puerto.

`node tools/test_retro_stream_browser.cjs` comprueba el inicio y los saltos en un audio de 2 h 20 min, desde caché y por streaming, y su reproducción a través de la radio. Requiere Chrome, Playwright, el servidor activo y `K4cLY9DEpYI.source.webm` en caché; la prueba remota necesita conexión a YouTube.

Se verificaron la lectura de un canal real (180 entradas), una playlist pública de YouTube Music (8 entradas) y una búsqueda musical (12 resultados). En Chrome se probaron los audios locales, cambio AM/FM, pausa, sintonía, control de laptop, búsqueda en el dial, importación de un video real, preparación en caché y reproducción de su audio filtrado. La interfaz se inspeccionó en escritorio y en un viewport móvil de 390 px.

Referencias: [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference), [yt-dlp](https://github.com/yt-dlp/yt-dlp), [runtime JavaScript para YouTube](https://github.com/yt-dlp/yt-dlp/wiki/EJS). Las fuentes físicas del filtro se conservan en [README-radio.md](README-radio.md).

## Publicar

Frontend en Vercel y servidor de audio en Render Free. El circuito permanece en el navegador y YouTube se suministra por streaming. Consulta [README-render.md](README-render.md) y [README-vercel.md](README-vercel.md).
