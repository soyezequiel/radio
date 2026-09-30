# Modelo físico de Frecuencia 90

`retro-physics.js` reemplaza los efectos añadidos del reproductor retro. `retro-worklet.js` ejecuta el receptor fuera del hilo de interfaz. El laboratorio educativo anterior conserva su propio modelo.

## Cadena de señal

Cada archivo o stream aporta dos canales de audio. Se interpola mediante un FIR polifásico de 12 coeficientes a una envolvente compleja de 768 kHz cuando el contexto es de 48 kHz. Las tensiones RF de hasta cinco emisoras próximas se suman **antes** de un único filtro y detector. No se demodula cada emisora por separado ni se agrega un silbido al girar el dial.

La frecuencia del oscilador y del preselector sigue `f₀ = 1/(2π√LC)`. L = 100 nH en FM y 100 µH en AM. El preselector se aproxima mediante un polo de envolvente, con ancho RF de 2 MHz / 60 kHz respectivamente. Es la aproximación de banda estrecha de un resonador; no una integración SPICE del capacitor a 100 MHz. La selectividad corresponde a un filtro de frecuencia intermedia Butterworth de cuatro polos: FM 108 / 180 / 240 kHz y AM 5,4 / 9 / 18 kHz. Los estados de filtros, detector y parlantes se conservan al sintonizar. La gráfica muestra la magnitud digital combinada RF + FI, sin modulación.

## Ruido, recepción e interferencia

El ruido es gaussiano con densidad espectral de tensión `Sv = 4 kB T R F`: kB = 1,380649×10⁻²³ J/K, R = 50 Ω, temperatura inicial 290 K y factor de ruido F = 10^(6/10). Se inyecta antes del preselector, en cuadratura, con varianza por canal `Sv × FsRF`. La varianza total I/Q después del receptor se obtiene integrando la respuesta de potencia de sus filtros. Las unidades de antena son microvoltios de amplitud de la envolvente compleja, no potencia disponible en un puerto adaptado. La referencia física del ruido térmico es la [termometría Johnson de NIST](https://nvlpubs.nist.gov/nistpubs/jres/122/jres.122.046.pdf).

La casilla **Ruido térmico** permite comparar contra el caso ideal sin ruido. No hay un bucle de estática, oscilador audible, incremento artificial al mover el dial ni una ganancia de ruido calculada a partir de la distancia a la emisora. El soplido aparece al demodular ruido y desaparece progresivamente cuando predomina una portadora FM. Los batidos AM y la captura FM surgen de la mezcla de campos y del detector no lineal compartido.

**Reflexión** añade una segunda trayectoria de amplitud 0,2 (−14 dB) y retardo de cuatro muestras RF: 5,208 µs a 48 kHz de audio, equivalentes a unos 1,56 km de recorrido extra. Es una trayectoria coherente fija, no una simulación completa de edificios o movimiento de antena. El selector de temperatura y la intensidad de antena permiten explorar umbrales de recepción sin cambiar la música.

## AM y FM

AM: envolvente `A[1 + 0,8 m(t)]`, con audio mono. Después del filtro común, un detector de pico usa umbral de diodo de 0,12 V, resistencia de carga de 22 kΩ, resistencia de carga del capacitor de 220 Ω y C = 10 nF. El AGC regula una envolvente objetivo de 0,65 V, con ataque de 25 ms y recuperación de 450 ms. Sigue un acoplamiento a 30 Hz y un filtro audible de seis polos a 3 kHz. El detector utiliza la amplitud compleja y tiempos RC: no resuelve cada conducción de la portadora RF ni la ecuación exponencial completa del diodo. La operación de un [detector de envolvente con diodo y RC](https://wiki.analog.com/university/courses/alm1k/circuits1/alm-cir-envelope-detector) fundamenta esta aproximación.

FM: preénfasis de 75 µs regularizado a 15 kHz, desviación máxima de 75 kHz y fase integrada a partir del multiplex estéreo. El multiplex contiene suma L+R, diferencia L−R modulada a 38 kHz y piloto de 19 kHz al 9 %. La señal de transmisión limita el multiplex a ±1. El discriminador común calcula `arg(z[n] × conjugado(z[n−1])) × FsRF/(2π × 75000)`. Esta es la [demodulación en cuadratura documentada por GNU Radio](https://www.gnuradio.org/doc/doxygen-v3.7.13.4/classgr_1_1analog_1_1quadrature__demod__cf.html).

Una PLL del piloto recupera fase y frecuencia para decodificar el estéreo. Su amplitud y error de fase gobiernan la transición a mono cuando pierde enganche. Siguen un filtro audible de seis polos a 15 kHz y deénfasis de 75 µs. La indicación STEREO refleja el enganche del decodificador. El método de recuperación mediante piloto se describe en [WBFM Receive PLL de GNU Radio](https://wiki.gnuradio.org/index.php/WBFM_Receive_PLL). Los tres MP3 de demostración y los antiguos MP3 en caché son mono y limitados en banda: el decodificador no puede recuperar estéreo que la fuente no tenga. Los streams nuevos conservan los canales de origen.

## Amplificador y parlantes

El amplificador representa alimentación de 9 V, excursión utilizable de ±3,4 V, ganancia 3 y saturación suave `Vout = 3,4 tanh(Vin × ganancia × volumen / 3,4)`. No hay compresor software posterior ni control de volumen por emisora. Es una curva representativa de saturación, no un circuito de transistores identificado.

Cada canal excita un parlante de bobina móvil. Se integran conjuntamente:

```
Le di/dt = V − Re i − Bl v
dx/dt   = v
Mms dv/dt = Bl i − Rms v − x/Cms
```

Parámetros: Re = 6 Ω, Le = 0,2 mH, Bl = 4 N/A, Mms = 8 g, Cms = 0,6 mm/N y Rms = 1,3 kg/s. Integración trapezoidal implícita; resonancia mecánica de 72,64 Hz. La presión se estima por radiación de pistón pequeño en bafle, `p = ρ Sd a/(2πr)`, con Sd = 0,008 m² y r = 1 m. Se convierte 1 Pa en una unidad digital. El modelo de masa, suspensión y fuerza contraelectromotriz sigue las ecuaciones de [parlante de parámetros concentrados de COMSOL](https://doc.comsol.com/6.3/doc/com.comsol.help.models.aco.lumped_loudspeaker_driver_mechanical/lumped_loudspeaker_driver_mechanical.html).

La presión y el desplazamiento describen el parlante **simulado**; no calibran el SPL de los auriculares del usuario. Las barras muestran el espectro real de salida. El cono muestra muestras de su desplazamiento calculado, a la cadencia de la interfaz, sin una animación rítmica inventada. La casetera queda detenida mientras se recibe radio.

## Límites y comprobaciones

Se emplean parámetros representativos, sin mediciones del equipo de la foto. No se modelan la caja, los tweeters y su crossover, modos de flexión del cono, sala, cambios de Bl/Cms con excursión, transistores individuales, deriva térmica del oscilador, ruido impulsivo de aparatos ni contactos mecánicos del capacitor. La radiación de pistón pequeño es una aproximación de bajas frecuencias, extendida aquí al audio; no es una predicción acústica precisa a 15 kHz. El número de parlantes visibles no equivale a cuatro transductores calibrados.

El espectro FM tiene colas infinitas. Se descartan emisoras con desplazamiento ≥280 kHz antes de sintetizarlas y se procesan como máximo cinco vecinas. Por tanto, no se reproduce el dial completo ni se garantiza aliasing nulo para cualquier señal extrema. Audio RF equivalente, filtros discretos y sobremuestreo son aproximaciones computacionales. C/N se estima a partir de potencia total y ruido teórico; cuando hay interferentes también incluye su potencia. No distingue automáticamente señal útil de interferencia.

`node tools/test_retro.cjs` verifica el dial y ejecuta `tools/test_retro_physics.cjs`. Las pruebas comprueban ruido contra la integral 4kTR, proporcionalidad con temperatura y banda, silencio ideal, recuperación AM/FM, batidos entre portadoras sin audio, independencia de amplitud FM, captura, separación estéreo, volumen cero y estabilidad con cinco señales al sintonizar. El parlante se contrasta con una solución independiente de impedancias sinusoidales y se verifica su disipación después de retirar la excitación.

En esta máquina: ruido medido 1,078 µV frente a 1,080 µV teórico; separación estéreo 29,2 / 30,1 dB con tonos de 1 / 2,3 kHz; aproximadamente 0,50 s de cómputo por segundo de audio en la prueba de cinco portadoras. Son resultados de estas pruebas, no una certificación de hardware ni una garantía de rendimiento en otra computadora.
