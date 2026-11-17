# T063 — persistencia, publicación y recuperación

Validación local del 2026-11-16, rama `patronaje`. Sin AWS ni despliegues.

## Guardar → publicar → perder respuesta → reabrir

`tests/e2e/save-publish.spec.ts` utiliza Electron, IPC, credenciales protegidas, escritor nativo Windows, API Nest y PostgreSQL reales de ensayo. Guarda el editable desde la interfaz, crea el proyecto, prepara editable/preview y publica. El transporte de ensayo consume la respuesta aceptada de commit y la descarta antes de entregarla al cliente; después termina el CAD y lo reabre con el mismo perfil.

El CAD consulta el resultado y muestra la versión publicada. La base conserva exactamente una versión y un resultado `commitPublication`; el editable remoto coincide byte a byte con el archivo local guardado. El archivo local permanece intacto tras el cierre. La inyección está exclusivamente en `tests/desktop/publication-e2e-main.ts`.

Ejecución conjunta con `tests/e2e/publication.spec.ts`: **6/6 escenarios aprobados**, incluidos PDF, carga interrumpida y conflictos. PostgreSQL efímero retirado al terminar.

## Recuperación con cargas quickstart

`tests/performance/recovery.spec.ts` ejecuta diez capturas y recuperaciones por carga con rectas, curvas, margen y marcas. Interpreta conservadoramente los segmentos como cantidad **por pieza**. Cada recuperación abre una instancia nueva del almacén y compara todo el documento. No guarda ni publica el documento de trabajo.

| Carga | Piezas | Segmentos por pieza | Tamaño JSON | Máximo persistir + reabrir |
|---|---:|---:|---:|---:|
| Pequeña | 10 | 20 | 56 024 bytes | 30,67 ms |
| Media | 50 | 100 | 1 331 034 bytes | 375,84 ms |
| Grande | 100 | 500 | 13 353 785 bytes | 4 160,14 ms |

Las 30 ejecuciones quedaron por debajo de 60 segundos. Informes individuales y características del equipo: `.local/validation/recovery-small.json`, `recovery-medium.json`, `recovery-large.json`. El objetivo de programación de capturas y la exclusión de escrituras simultáneas se verifican además en `tests/recovery/recovery-scheduler.spec.ts`, incluido en la regresión de **452/452 pruebas** de unitarias/recuperación/contratos. Esto no sustituye los ensayos físicos USB ni la determinación del mínimo de hardware de T095.

## PNG reproducible Windows/Linux

`tools/validation/preview-platforms.mjs` compara el corpus de diez documentos del perfil `patronaje-preview-1`, renderizado dos veces por plataforma. Node `v24.22.3` y los mismos activos fijados; los diez tamaños y SHA-256 coinciden exactamente. Linux ejecuta la imagen local `node:24.22.3-bookworm-slim`, con red deshabilitada y montajes de solo lectura. Identidad de imagen: `sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54`.

Informe reproducible: `.local/validation/preview-platforms.json`. No se extrapola esta prueba de PNG a determinismo PDF, impresión física o aceptación móvil.
