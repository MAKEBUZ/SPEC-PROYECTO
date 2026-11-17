# Avance de las ocho tareas pendientes

**Corte vigente 2026-11-17:** continúan 90/98 completas. Consultar [informe consolidado](delivery-report.md) para resultados actuales y pendientes. La tabla siguiente conserva el corte histórico de 2026-11-16; la instalación y ronda digital posteriores del usuario aportan evidencia parcial, sin cerrar T093 ni reemplazar teléfonos, USB e impresión.

2026-11-16, `patronaje`. No se modificó el alcance, no hubo despliegues ni AWS.

| Tarea | Avance local | Falta para cierre |
|---|---|---|
| T026 | Cuenta: 11 casos en Chrome y 11 en Edge, dentro de 13 pruebas por navegador junto con PWA; integración papelera/cuenta existente validada. | PWA instalada y dispositivos reales; ya no depende de implementar T088/T090. |
| T039 | Regresión de recuperación incluida en 513 pruebas locales. | USB y fallos físicos del medio. |
| T065 | Dos pruebas PWA por navegador, manifiesto/iconos/caché/offline; protocolo preparado. | Instalar y abrir desde icono en Android/iPhone. |
| T069 | Versiones exactas y evidencia en `library-pwa.md`. | Navegadores anteriores y dispositivos físicos. |
| T081 | Kit de tres PDF guardados y verificados en `.local/validation/physical-print`, con editables y manifiesto de hashes. | Impresión y medición física, además de la matriz de hardware de T095. |
| T093 | Instalador local generado, arranque del paquete y dependencias comprobados; `windows.md`. | Instalación/desinstalación y aceptación desde equipo limpio, USB e impresión. |
| T095 | Nuevo recorrido automatizado en `tests/e2e/first-release.spec.ts`: guardado nativo, PDF, publicación interrumpida/reanudada, portal móvil, descargas íntegras y papelera/restauración; mantiene catálogo al reiniciar. | PWA física, equipo de referencia y equipos inferiores para determinar mínimo. No confundir tiempo E2E con benchmark de PDF. |
| T097 | Informes enlazados y nuevos resultados registrados. | Revisar y acreditar cada cláusula de FR/SC; no cerrar aceptación con pruebas físicas faltantes. |

Regresión: **513/513** locales (94 archivos), TypeScript y build CAD correctos. Ejecución conjunta E2E de cuenta/PWA/papelera/recorrido integral: **18/18**; adicionalmente **13/13 Chrome** y **13/13 Edge** con versiones registradas. Los conteos de distintas ejecuciones se solapan y no se suman como pruebas únicas.

El informe JSON local se conserva en `.local/validation/remaining-local.json`. La matriz previa de aceptación no se sobrescribe ni se convierte automáticamente en aceptación final. Continúan **90/98 completas, 8 pendientes** porque ninguna de esas ocho cumple todavía todos sus criterios.
