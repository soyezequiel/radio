# Resonancia: dentro de una radio

**Nuevo: [Frecuencia 90](retro.html)**, una radio retro inspirada en el equipo de referencia, con importación de canales y playlists de YouTube / YouTube Music, preparación automática de audio y filtrado RLC real. Doble clic en `Iniciar-radio.cmd` para abrirla. La [guía de la radio retro](README-retro.md) explica los controles y el modelo.

Para experimentar con sonido y las tres músicas proporcionadas, abrí [radio.html](radio.html). El laboratorio interactivo permite cambiar C, comparar la antena con la salida LC, escuchar la demodulación y omitir el filtro. La [guía del laboratorio](README-radio.md) explica los controles y el modelo.

Abrí `index.html` en Chrome, Edge o Firefox. No necesita instalación, conexión a Internet ni servidor.

También está disponible `resonancia-radio.mp4`: video H.264 de exactamente 60 segundos, a 1440 × 816 y 30 cuadros por segundo. `resonancia-radio.webm` contiene la versión VP9. Ambos son silenciosos. `radio-lc-interactiva.zip` reúne los archivos del reproductor para compartirlo: extraé su contenido y abrí `index.html`.

Animación de 60 segundos, en español y sin audio. Incluye diez escenas, pausa, navegación por escenas, línea de tiempo, velocidad y pantalla completa. Espacio reproduce o pausa; las flechas avanzan o retroceden cinco segundos cuando el foco no está en un control. Si el sistema pide reducir el movimiento, comienza pausada.

La opción «Descargar animación» genera un video WebM (o MP4 si el navegador lo ofrece) a 1440 × 816, con las diez escenas y sin controles. Requiere aproximadamente un minuto y mantener la pestaña visible. Chrome o Edge son los navegadores recomendados para exportar.

## Modelo

RLC serie, con tensión de salida sobre R. La fuente de tensión representa la antena. L = 100 μH; R = 78,54 Ω; inicialmente C = 253,30 pF. La resonancia es 1 MHz y Q = 8. El ancho de banda de media potencia es 125 kHz. La carga y las pérdidas se concentran en R.

Las tres portadoras tienen igual amplitud de entrada: 500 kHz (naranja), 1 MHz (verde) y 1,5 MHz (violeta). Están presentes simultáneamente. Los gráficos temporales se ralentizan conservando las relaciones de frecuencia y usan la misma amplitud y fase del modelo que los espectros y la curva de respuesta.

`H(f) = R / [R + j(2πfL − 1/(2πfC))]`

En la escena de sintonía, C disminuye hasta 112,58 pF: f₀ aumenta a 1,5 MHz y predomina la señal violeta. L y R se mantienen fijas. Las otras componentes conservan una respuesta pequeña, no nula.

Las escenas de los componentes son acercamientos didácticos. Los campos y el intercambio de energía de la escena de resonancia destacan la componente f₂ de la mezcla; los indicadores de energía son normalizados. La tensión de C y la corriente de L están en cuadratura. La señal recibida compensa la disipación, manteniendo la oscilación forzada. No se representan cargas atravesando el dieléctrico.

Las señales están sin modulación para centrar la explicación en la selección por frecuencia. La cadena de radio posterior es un esquema funcional simplificado. En una radio real existen distintas topologías y etapas adicionales.

## Fuentes

- [Rensselaer Polytechnic Institute: impedancia compleja, resonancia y filtros RLC](https://sites.ecse.rpi.edu/courses/static/ENGR-2300/_downloads/d0b7c40df2e3349a7db372d5771166a0/ENGR2300_Exp_02_M2K.pdf)
- [University of Colorado Boulder: filtros y resonadores](https://physicslabs.colorado.edu/courses/phys-3330/lab-guides/lab3/)

## Archivos

- `index.html`: reproductor y explicación del modelo.
- `styles.css`: diseño adaptable para escritorio y celular.
- `app.js`: escenas SVG animadas, respuesta RLC y exportación de video.
- `resonancia-radio.mp4`: animación lista para reproducir o compartir.
- `resonancia-radio.webm`: versión de video WebM.
- `radio-lc-interactiva.zip`: reproductor completo sin dependencias.
- `vista-previa.png`: fotograma de la escena de resonancia.

La animación usa gráficos vectoriales y fuentes del sistema; no carga recursos externos.
