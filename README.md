# Demo: video interactivo propio (estilo H5P)

Demo aislada para el LMS (SvelteKit + Svelte 5). Sin backend: el JSON se guarda en `localStorage` y el MP4 en IndexedDB.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests de calificación (Vitest)
npm run check    # tipos
```

## Flujo
1. **Inicio** (`/`): subir un MP4 (o usar `static/video-ejemplo.mp4`).
2. **Editor** (`/editor`): reproducir y agregar preguntas en el segundo actual (botones o teclas `1`–`4`).
   Los marcadores de la línea de tiempo se arrastran para cambiar el momento.
3. **Vista del estudiante** (`/preview`): el video se pausa en cada pregunta, califica, bloquea adelantar
   preguntas obligatorias, retrocede si falla (opcional) y muestra un resumen. "Publicar" es simulado y permite
   descargar el JSON.

## Tipos de pregunta
Opción múltiple (una o varias), Verdadero/Falso, Respuesta corta, Unir con cables (SVG, arrastrar o clic-clic).

## Piezas reutilizables para el LMS real
- `src/lib/types.ts`: modelo de datos (sirve de DTO para NestJS).
- `src/lib/grading.ts`: calificación pura, sin DOM → se puede ejecutar igual en el backend.
- `src/lib/storage.ts`: único punto a reemplazar por llamadas a la API.
