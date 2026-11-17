# Informe consolidado de validación

**Corte:** 2026-11-17. **CAD:** 0.1.7. **Código base:** [`8a93c4ed6a1d021da2d98a33945fa2d4a1f3a898`](https://github.com/MAKEBUZ/SPEC-PROYECTO/commit/8a93c4ed6a1d021da2d98a33945fa2d4a1f3a898). Los cambios de esta revisión añaden documentación, trazabilidad y un lanzador local de demostración; no incorporan módulos aplazados ni modifican las reglas del producto. Su commit definitivo consta en el [PR](../git-evidence.md).

**Estado: 90/98 tareas completas; 8 pendientes. No se declara aceptación integral.** Una tarea marcada no prueba automáticamente todas las cláusulas de un requisito. Las cifras de ejecuciones distintas pueden solaparse: no sumarlas como casos únicos.

## Pruebas automatizadas ejecutadas en esta revisión

Windows x64 del equipo de desarrollo; Node 24.22.3, npm 12.2.2. Fecha local 2026-11-17; la ejecución JSON conserva tiempos UTC por archivo. PostgreSQL 18.7 mediante Docker local. El hardware no sustituye la referencia 4 núcleos/16 GB/SSD. No hubo operación AWS.

| Fecha / revisión | Prueba y comando desde raíz | Resultado | Evidencia / limitación |
|---|---|---|---|
| 2026-11-17 / base 8a93c4e | `node node_modules/typescript/bin/tsc --noEmit` | Aprobado | Comprueba tipos, no comportamiento. |
| 2026-11-17 15:06 UTC / base 8a93c4e | `node node_modules/vitest/vitest.mjs run tests/unit tests/geometry tests/recovery tests/print tests/contracts --maxWorkers=1` | **700/700**, 116 archivos; incluye 342 unitarias | [JSON portable](delivery-tests.json), nombres y resultados por caso. No incluye ensayos físicos ni toda la suite E2E. |
| 2026-11-17 / base 8a93c4e | `node tools/validation/postgres.mjs --e2e tests/e2e/first-release.spec.ts tests/e2e/account.spec.ts tests/e2e/pwa.spec.ts` | **14/14**, 3 archivos | [Salida de la ejecución](delivery-e2e.txt). API y DB reales; transporte de ensayo, viewport móvil y diálogos sustituidos. No PWA física. Contenedor retirado. |
| 2026-11-17 / cambios de esta revisión | `node tools/demo/start.mjs --smoke` | Aprobado: API, portal y CAD arrancan y cierran | `.local/validation/demo-smoke.log`; registro local `smoke.json`. Arranque, registro, correo capturado, verificación y acceso web/CAD; no acredita publicación ni que el recorrido manual nuevo esté observado completo. |
| 2026-11-17 / cambios de esta revisión | `node tools/validation/acceptance-matrix.mjs docs/validation/delivery-tests.json` | 575 IDs completos, sin IDs omitidos | 200 aplazados; 303 con vínculo parcial a pruebas; 72 sin vínculo individual en esta ejecución. [Matriz](acceptance-matrix.md). |

Los logs locales no son necesarios para leer los casos unitarios publicados: el JSON versionado conserva nombres, estados y duración, sin rutas personales, tokens ni contraseñas. La salida E2E publicada conserva el resumen de ejecución y las rutas de las suites, no datos de la cuenta de ensayo.

## Instalación desde carpeta limpia

Se extrajo `git archive 8a93c4e` a una carpeta nueva dentro de `.local/delivery-clean/source`, sin `node_modules`, `dist`, `.next` ni `.local` previos. No es un Windows recién instalado: el equipo ya tenía Node, C++/SDK, Python, Docker y Edge. El gestor puede reutilizar su caché de paquetes; no se copió el `node_modules` del proyecto.

| Paso | Resultado real |
|---|---|
| Node 24.22.3 / npm 12.2.2 | Versiones comprobadas. |
| `npm ci --ignore-scripts --no-audit --no-fund` | Aprobado, 398 paquetes. Advertencias de dependencias transitivas obsoletas conservadas; no se cambió el lockfile para ocultarlas. |
| `node tools/assets/verify.mjs --prepare` | Aprobado: cinco activos con bytes/hashes verificados. |
| `node node_modules/electron/install.js` | **Bloqueado** en copia limpia: dos intentos con `TypeError: fetch failed`; diagnóstico `UND_ERR_CONNECT_TIMEOUT` en descarga oficial. La ejecución sobre Electron previamente instalado no cierra este paso. |
| `node tools/validation/build-native.mjs` | Aprobado desde cero con C++/Windows SDK; módulo `file_replace.node` creado. |
| `node tools/validation/build-desktop.mjs` | Aprobado; advertencia del empaquetador sobre directiva `use client` no impidió el build. |
| `node node_modules/next/dist/bin/next build apps/web --webpack` | Aprobado, portal compilado localmente. |
| Tipos y `node tools/validation/run.mjs unit` | Aprobado en copia limpia: 342/342 unitarias, 58 archivos. |
| `node tools/validation/postgres.mjs` | Aprobado en copia limpia: 162/162 de integración, 26 archivos; contenedor retirado. [Salida](delivery-integration.txt). |
| `node tools/assets/build-password-index.mjs` | Aprobado: 5 189 454 entradas; 166 062 528 bytes; SHA-256 `82feaaea1b39b6323e73f4046c6eb2ebd1a619688185a5a4f33438b6e17516b5`. |

Los comandos posteriores no se declararán comprobados en una máquina limpia completa mientras falte Electron. El README conserva el paso real y el diagnóstico; no propone desactivar TLS, alterar hashes ni usar un binario sin procedencia. El entorno existente sí permitió las E2E y la demo de arranque. Se debe repetir la instalación completa en otra red/equipo y adjuntar fecha, versión y resultado antes de presentar «instalación limpia aprobada».

## Comprobaciones manuales históricas (comunicadas por el usuario)

Estos resultados proceden de la conversación de pruebas y de los registros enlazados; no se presentan como nuevas observaciones realizadas por el agente el 2026-11-17. Cuando no consta hora o hash del archivo, no se inventa. No se extrapolan a la interfaz 0.1.7.

| Versión / registro | Comprobación comunicada | Resultado y límite |
|---|---|---|
| Instaladores iniciales; [Windows](windows.md) | Acceso directo, nombre PATRONAJE, relanzamiento restaura una ventana, controles accesibles | Aprobado por usuario en su equipo; instalación/desinstalación limpia y versión 0.1.7 siguen pendientes. |
| 0.1.2; [Windows](windows.md) | Abrir patrón y mover pieza tras corregir bloqueo | Aprobado por usuario; no acredita todos los equipos. |
| Ronda digital; [hitos locales](local-milestones-2026-11-16.md) | Guardar/reabrir, cancelar cierre, guardar al cerrar, descartar, Guardar como y recuperar copia | Aprobados por usuario; USB y fallos físicos no ensayados. |
| 0.1.3; [PDF](pdf-artifacts.md), [Windows](windows.md) | PDF A4/Carta y gran formato; nombre sin superposición con marca; preparaciones y desplazamientos conservados | Apertura y revisión digital comunicadas; no mide papel físico. |
| Ronda digital; [validación de producción](production-validation.md) | Bloqueo por hilo ausente/longitud cero, cantidad 0 y contorno abierto; exportación tras corregir; cancelación recupera edición | Aprobados por usuario. Códigos técnicos de aviso motivaron correcciones posteriores, documentadas en [frontend](frontend.md). |
| Piloto histórico; [AWS](aws-pilot.md) | Registro, correo verificado y acceso web/CAD | Evidencia histórica de entorno autorizado; no se repitió ni se modificó AWS en esta revisión. |

## Pendientes y cómo cerrarlos

| Tarea | Ensayo que falta | Evidencia mínima de cierre |
|---|---|---|
| T026 | Cuenta en todos los clientes, incluida PWA física | Dispositivo/SO/navegador, acceso, sesión y recuperación; resultados por escenario. Las dependencias de implementación anteriores ya no son el bloqueo vigente. |
| T039 | USB real, desconexión/disco lleno y recuperación | Medio y sistema de archivos, pasos, hashes antes/después y conservación del documento. Solo archivos de ensayo. |
| T065 | Instalar y abrir PWA desde icono en Android/iPhone | Android 12+/Chrome e iOS 17+/Safari reales, cuenta/preview/descarga y logout sin caché privada. |
| T069 | Matriz de navegadores y dispositivos | Versiones exactas actual/anterior, hashes y descargas/reanudaciones autorizadas. |
| T081 | Impresión física A4/Carta/gran formato | Impresora, ajustes 100%, papel y medición de ambos lados del cuadrado entre 99,5 y 100,5 mm. |
| T093 | Instalación/desinstalación limpia de 0.1.7 | Máquina sin instalación previa, SHA del instalador, acceso directo, nombre, instancia única y recorrido; [protocolo](windows.md). |
| T095 | Equipo de referencia y equipos inferiores | Diez ejecuciones por carga, máximo y fallos de PDF/cancelación/recuperación; identificar CPU/RAM/SSD. No imponer mínimo antes de medir. |
| T097 | Acreditación por cláusula y consolidación final | Resolver huecos de matriz con evidencias concretas, sin convertir vínculos indirectos en cumplimiento total. |

También queda pendiente ejecutar el nuevo recorrido de demo manual de principio a fin y repetir la descarga/instalación limpia de Electron. Son límites declarados de esta revisión, no módulos añadidos ni tareas marcadas ficticiamente.

## Reproducción y revisión

Inicio: [README](../../README.md). Recorrido: [demo](../demo.md). Protocolo de hardware: [intervenciones](intervention-queue.md). El [registro histórico](current-status.md) conserva resultados anteriores y fallos encontrados. La [matriz](acceptance-matrix.md) se genera con un informe real y mantiene explícitamente los aplazados. Los tiempos de rendimiento históricos están en [análisis PDF](pdf-performance-analysis.md); no se repitieron benchmarks durante builds concurrentes.
