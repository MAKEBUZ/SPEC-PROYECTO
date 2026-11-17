# Estado de validación local

**Índice vigente 2026-11-17:** consultar [informe consolidado](delivery-report.md), [matriz](acceptance-matrix.md) y [pendientes](remaining-eight.md). Las secciones siguientes son un registro histórico por ejecución: sus conteos y restricciones temporales no sustituyen el estado vigente ni deben sumarse.

## Registro histórico (conservado)

Rama `patronaje`, primera entrega `001-patronaje`. El estado de cada tarea está en `../../specs/001-patronaje/tasks.md`; este informe no declara la entrega terminada.

Avance posterior: instalador Windows y recorrido integral preparados, 513/513 locales, 18/18 E2E conjuntos y 13/13 cuenta/PWA por cada navegador Chrome y Edge. Véase `remaining-eight.md`; ninguna aceptación física se declara completa. Estado vigente tras cerrar T062 localmente: **90/98 tareas completas, 8 pendientes**. Estados y recuperación: 512/512 pruebas locales y 29/29 integración; TypeScript correcto. Matriz individual en `operation-state-matrix.md`. Integración de operaciones: 505/505 pruebas locales, 25/25 integración y 20/20 E2E; informe `operations-lifecycle-complete.md`. Reconciliación y compactación: 498/498 pruebas locales y 162/162 de integración; evidencia en `suppression-reconciliation.md`. Programación, drenaje global del monolito y limpieza física de siete días validados: 491/491 pruebas locales, 21/21 dirigidas posteriores y 159/159 de integración PostgreSQL (26 archivos). Transporte y operación AWS no ejecutados; evidencia en `backups.md`. PDF: 50/50 exportaciones verificadas y guardadas dentro de 60 s, 30/30 cancelaciones dentro de 5 s, 5/5 casos idénticos Windows/Linux y regresión final 152/152. Evidencia completa en `pdf-performance-results.json`; límites del equipo en `performance.md`.

## Recorridos ejecutados en esta continuación

| Área | Evidencia |
|---|---|
| Portal/PWA adaptable y caché | Build Next y 2/2 E2E; no sustituye Android/iPhone físicos |
| Geometría, generación y lectura independiente de PDF | 100/100 geometría y 61/61 impresión/worker en el cierre del generador; informe `pdf-production.md` |
| Exportación, cancelación y reapertura de preparaciones | 2/2 E2E Electron; corregida limpieza de eventos al destruir ventana |
| Catálogo PDF y publicación de la revisión guardada | 45/45 pruebas dirigidas y 5/5 E2E Electron/API/PostgreSQL, incluida reanudación tras reinicio |
| Biblioteca con dimensiones PDF y descarga íntegra | 10/10 E2E cuenta/biblioteca y 10/10 integración de publicación/migraciones; 13/13 contratos HTTP y prueba de mediciones |
| Purga de recursos/cuenta y consulta limitada | 25/25 integración, 47/47 locales y regresión posterior 7/7 con admisión por vencimiento; informe `deletion.md` |
| Matriz de fallos de publicación T040 | 25/25 integración dirigida, incluidos PDF añadido a la misma revisión y conservación de la versión previa ante fallo; informe `publication-faults.md` |
| Papelera T089/T090 | 4/4 E2E portal/CAD/API/PostgreSQL, incluida respuesta perdida con reapertura y alcance cambiado; informe `deletion.md` |

TypeScript, generación/comprobación OpenAPI y builds locales fueron ejecutados en las fases correspondientes. Estos recuentos pertenecen a grupos dirigidos, pueden solaparse y no deben sumarse como una única ejecución completa. Los contenedores de ensayo se retiraron. No se usaron servicios AWS ni correo real.

La regresión completa de integración pasó 150/150 pruebas en 23 archivos antes de añadir los dos casos finales de publicación PDF; estos pasaron después dentro de la selección de 25/25.

## Trabajo técnico pendiente

- Rendimiento en el equipo de referencia de 4 núcleos/16 GB/SSD y determinación del mínimo en T095. Las diez ejecuciones por carga y el guardado final ya están comprobados en el equipo actual. Se conserva la desviación aprobada de 0,1 mm y no se añadió cancelación automática.
- Ensayo de transporte externo y operación de respaldo en el futuro entorno autorizado; protocolo local de reconciliación, compactación y restauración ya validado.
- Matriz exhaustiva de transiciones T062; integración transversal T061 validada localmente.
- Matrices completas de lifecycle y aceptación, y recorrido integral T095. El determinismo PNG/PDF Windows/Linux ya fue comprobado.
- Instalador Windows y aceptación integrada restante.

No se considera validado lo que falta ni se cambia una decisión de producto para cerrar una tarea. Los avisos de las pruebas y las limitaciones forman parte del resultado, no de una lista de nuevas funciones.

## Intervención aplazada

`intervention-queue.md` conserva USB físico T039, teléfonos/PWA, impresión y medición real, aceptación del instalador y equipos inferiores al de referencia. Las dependencias técnicas anteriores siguen a cargo de la implementación; no requieren que el usuario tome decisiones de producto ahora.

La implementación local está autorizada. Desplegar o generar gastos requiere autorización separada y no se realizó.

## Actualización de seguridad y consultas limitadas

T094 validada: 39 pruebas de integración, 45 locales y 12 E2E de cuenta/PWA correctas en ejecuciones dirigidas separadas; detalles y límites en `security.md`. El fallo de una credencial de eliminación ya no bloquea otras comprobaciones, con 22 pruebas locales correctas. T061/T062 siguen abiertas; esta corrección no acredita toda su matriz. Estado: 83 de 98 tareas completas, 15 pendientes.

## Actualización de persistencia y trazabilidad — 2026-11-16

T063 completada; evidencia en `persistence-publication.md`: 6/6 E2E, 30 mediciones de recuperación y determinismo PNG en diez casos Windows/Linux. La carga mayor se ejecutó en Windows x64, Ryzen 7 5700G, 16 procesadores lógicos y aproximadamente 32 GiB RAM; no acredita todavía el equipo de referencia de 4 núcleos/16 GB ni el mínimo de T095. La matriz `acceptance-matrix.md` conserva 575 IDs, los aplazados y los huecos explícitos. T097 permanece abierta. Estado: 84/98 completas, 14 pendientes. Sin AWS/despliegues.

PDF: el arnés completo detectó incumplimiento del objetivo en el corpus mixto pequeño (sin terminar en 120 s). Se reutilizan cálculos de formas idénticas dentro de cada evaluación; 64/64 pruebas de impresión aprobaron, pero el rendimiento continúa pendiente. Véase `performance.md`. No se han ejecutado todavía los trabajos de respaldo/instalador restantes ni se declaran completadas las 14 tareas abiertas.

Actualización final de T078: completadas las cinco series de diez exportaciones y tres de diez cancelaciones del mismo build. La carga grande de 100 piezas × 500 segmentos tuvo máximo 56 441,91 ms; cancelación máxima 15,15 ms. Se conservan los fallos anteriores y sus diagnósticos. T078 marcada completa en implementación/validación local; T081 conserva impresión física y T095 conserva equipo de referencia/mínimo y flujo integral. Esta medición pertenece al equipo actual de aproximadamente 32 GiB y no acredita el equipo de referencia ni impresoras. Véanse `pdf-performance-analysis.md` y `print.md`.

## Regresión y dependencias — 2026-11-16

Se corrigió la comprobación de dependencias de publicación para incluir el proyecto de destino y el patrón vinculado en el documento, conservando la independencia entre patrones distintos. Resultado: 463/463 pruebas locales; 14/14 de integración dirigidas; TypeScript y build CAD correctos. La matriz de aceptación fue regenerada conservando sus 575 IDs y huecos explícitos. T061/T062 avanzaron, pero no están cerradas: continúan 85/98 completas y 13 pendientes. No se ha iniciado el despliegue.

## Respaldos y drenaje — 2026-11-16

Avance local de T087/T091/T092: coordinador de respaldo y restauración aislada, manifiesto estricto, hashes, almacén local exclusivo y política de retención de siete días sin prolongarla por copias derivadas. Corregida la admisión de trabajos después de iniciar la destrucción de los trabajadores. Evidencia y límites en `backups.md`.

485/485 pruebas locales y 23/23 de integración dirigida correctas; TypeScript correcto. La captura/restauración SQL del nuevo coordinador todavía utiliza dobles y requiere adaptadores reales y drenaje global. Ninguna de estas tres tareas se ha cerrado. Estado actual: 85/98 completas, 13 pendientes. No hay despliegue ni gasto AWS.

## Restauración PostgreSQL real — 2026-11-16

T092 completada: 2/2 recorridos con pg_dump, roles y pg_restore reales en clústeres locales vacíos; supresiones aplicadas, archivos activos verificados, intenciones incompletas bloqueadas y journal externo conservado. Regresión dirigida 26/26 y TypeScript correctos. T091 avanzó con adaptadores y comandos locales, pero conserva programación, drenaje global e inventario/limpieza efectiva. Estado vigente: 86/98 completas, 12 pendientes. Evidencia: backups.md. No hubo AWS ni despliegues.
