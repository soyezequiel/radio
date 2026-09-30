# Radio AM interactiva con tus tres músicas

Abrí `radio.html` en Chrome o Edge y pulsá **Iniciar experimento**. Funciona desde el disco, sin servidor ni Internet. También podés extraer `radio-laboratorio.zip` y abrir allí `radio.html`. Usá auriculares o parlantes; el navegador no inicia el audio hasta que presiones el botón.

Las tres emisoras transmiten continuamente y al mismo tiempo. Sus portadoras son 900, 1.000 y 1.100 kHz. Tocá una emisora o deslizá **Capacitor C** para sintonizarla. El control indica C en pF y la frecuencia de resonancia que resulta de ese valor. **Ancho de banda** cambia R, que representa carga y pérdidas. El botón **Recorrido guiado** conduce por los puntos de escucha y los tres programas.

**Puntos de escucha:**

1. **Audio transmisores:** los tres audios antes de modular, o un audio original mediante el botón «Oír original» de cada emisora. Ese botón no apaga las otras emisoras.
2. **Antena · RF:** la mezcla AM de las tres portadoras. Se ve, pero está por encima del rango audible.
3. **Salida LC · RF:** la señal físicamente filtrada. Sigue siendo RF e inaudible.
4. **Después del detector:** envolvente AM de la mezcla filtrada. La música sintonizada predomina.
5. **Sin filtro LC:** la mezcla de antena pasa directamente al mismo detector. Se oye la interferencia de las tres músicas.

Los tres archivos de audio incluidos fueron convertidos a mono y limitados a aproximadamente 3 kHz de ancho de audio, de modo que cada canal AM ocupa alrededor de 6 kHz. Esto da un sonido parecido al de AM y permite escuchar cómo una banda LC demasiado estrecha recorta agudos. Se quitaron silencios solamente de los extremos; se conservan los silencios internos. Los archivos originales del directorio Descargas no se modificaron. Los recortes exactos figuran en los detalles al pie del laboratorio y en `radio-audio.js`.

## Modelo y límites

Cada señal es AM convencional: `sᵢ(t) = [1 + 0,8 mᵢ(t)] cos(2πfᵢt)`. Se suman las tres señales antes del filtro. L = 100 μH; el filtro es RLC serie, con salida sobre R. La respuesta calculada para portadoras y bandas laterales es `H(f) = R/[R + j2πL(f − f₀²/f)]`. El mismo procesamiento genera los espectros, el audio y la onda. El audio de cada mensaje se normalizó una sola vez; no hay control automático de ganancia al mover el sintonizador.

La RF se calcula mediante su **envolvente compleja** alrededor de 1 MHz. El filtro usa una discretización equivalente a 48 kHz para cada emisora; la mezcla se reconstruye a 480 kHz antes de la detección. Con ello se preservan las diferencias reales de 100 kHz entre portadoras y las bandas laterales de música. La envolvente y su pasa bajo se obtienen de la señal total, no de una mezcla de canciones elegida por la interfaz. El detector de envolvente es ideal; no representa una caída de tensión de diodo. La antena se modela como fuente de tensión ideal. Las portadoras RF no se envían al altavoz como sonidos artificiales. El dibujo de campos es lento y destaca una componente para enseñarla.

**Verificación:** `node tools/test_radio_dsp.cjs` comprueba la respuesta compleja del filtro, la recuperación de cada mensaje, la atenuación de las otras emisoras, la independencia de C en la ruta sin filtro, la pérdida de agudos con 4 kHz y la estabilidad al cambiar C y R. `node tools/test_radio_audio.cjs` procesa 280 segundos de los tres archivos reales con cambios de sintonía y banda, y comprueba que la ganancia fija no sature el sonido. Probado con AudioWorklet en Chrome/Edge mediante HTTP local y `file://`, en escritorio y en viewport móvil.

Fuentes: [Analog Devices: modulación y detector AM](https://wiki.analog.com/university/courses/alm1k/circuits1/alm-cir-envelope-detector), [Simon Fraser University: envolvente compleja](https://www.ensc.sfu.ca/people/faculty/ho/ENSC327/Pre_08_CplxEnv.pdf), [Rensselaer Polytechnic Institute: filtros RLC](https://sites.ecse.rpi.edu/courses/static/ENGR-2300/_downloads/d0b7c40df2e3349a7db372d5771166a0/ENGR2300_Exp_02_M2K.pdf).
