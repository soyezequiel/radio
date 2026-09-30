# Frontend en Vercel

La portada `/` abre la radio retro. `/index.html` conserva la animacion y `/radio.html` el laboratorio AM.

## Publicar

1. Importa https://github.com/soyezequiel/radio en Vercel.
2. Selecciona la carpeta de este proyecto como Root Directory.
3. Usa Framework **Other**. `vercel.json` configura `npm run build` y la salida `dist`.
4. El build ya usa `https://frecuencia90-audio.onrender.com`. **RADIO_API_URL** es opcional y permite cambiar ese backend.
5. Pulsa Deploy o Redeploy si el sitio ya existe.

El build requiere Node 22 o superior y no tiene dependencias npm. Conecta directamente con Render mediante CORS y conserva Range para streaming. La URL del backend es publica; no agregues claves privadas en esa variable.

Las demos y archivos propios funcionan sin backend. Sin `RADIO_API_URL`, el build usa el servidor de Render configurado en este proyecto. El circuito, el limite de emisoras y la FFT siempre se procesan en el frontend. Los archivos propios son temporales; el dial se guarda por dominio.

Consulta [README-render.md](README-render.md) para publicar el servidor y configurar `RADIO_ALLOWED_ORIGINS` con la URL de Vercel.

## Comprobar

`npm test` y `npm run build`. Para probar el build con backend, configura `RADIO_API_URL` antes de ejecutar el build. Se publican solo recursos de una lista explicita: no se incluyen cach?s, scripts del servidor ni configuraciones privadas.

Documentacion: https://vercel.com/docs/project-configuration/vercel-json
