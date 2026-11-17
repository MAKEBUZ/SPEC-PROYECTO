# Validación transversal de US2

Fecha: 2026-11-15. Rama: patronaje. Ejecución local, sin AWS.

- `tests/geometry/offset.spec.ts`: 5/5 pasan (13,79 s). Escalas 2^-100, 1 y 128; ambos sentidos de recorrido; esquina redondeada combinada con esquinadas; cierre exacto de la aproximación; dimensiones exactas; cotas por intervalo <=0,01 mm; pieza aguda con punta válida mayor de 200 mm y rechazo por superar 5000 mm; borrador autocruzado conservado sin reparación.
- `tests/unit/geometry-bounds.spec.ts` y las suites de offset/intersecciones forman parte de las 237/237 pruebas unitarias, contratos y recuperación consolidadas. Incluyen offsets Bézier positivos, cóncavas, tangencias/contactos, refinamiento a 0,001 mm, área/longitud positiva diminuta y límites inclusivos. Las muestras analíticas complementan las cotas de intervalo; no las sustituyen como criterio de aceptación.
- `tests/e2e/cad-edit.spec.ts`: 27/27 en Electron/Playwright, 347,11 s. Edición real, medidas, snapping, transformaciones, propiedades y undo/redo. Evidencia del controlador y entorno en `autonomous-progress.md`.

T038 queda validada para edición y márgenes de US2. No acredita impresión ni capacidad de exportación: las cuatro pruebas RED de separación entre piezas en T027 permanecen pendientes de T074 y no se omitieron ni cambiaron para esta aceptación. Los objetivos de PDF, cancelación y equipo de referencia se validan en sus tareas de US6/validación final; no se infieren de estos tiempos.

Comando del ensayo transversal: `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/geometry/offset.spec.ts`.
