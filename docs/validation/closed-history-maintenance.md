# Historial cerrado y mantenimiento local

Validación local del 2026-11-16, rama patronaje. Avance parcial de T057/T060; integración T061 pendiente. Sin AWS ni despliegues.

Implementados cierre con confirmación explícita coincidente, ocultación del historial, retención de 30 días, vencimiento irreversible y descarte conservador de respuestas tardías. La aplicación al journal suprime resueltas y cierra pendientes sin declarar éxito ni fallo.

La compactación elimina generaciones en disco e IndexedDB v2. Conserva una huella de supresión sin contenido del historial para impedir que una copia antigua reactive la operación. El coordinador persiste el vencimiento antes de limpiar, conserva resultados en memoria al fallar la escritura y reintenta con aviso genérico sin conexión ni sesión. Un vencimiento confirmado no exige otra comprobación temporal.

Validación:

- Pruebas nuevas dirigidas: 17/17 en cuatro archivos.
- Regresión de recuperación, acciones de documento y rutas Windows: 118/118 en 25 archivos, con PATRON_NATIVE_TEST=1.
- Tras reforzar escritura fallida y cambio de continuidad: history-maintenance 2/2.
- TypeScript y compilación desktop correctos; advertencias existentes de tamaño del bundle y use client.
- IndexedDB probado en Edge real y almacenamiento desktop en directorios temporales reales. Restaurar generaciones antiguas no restituye entradas compactadas.

T057/T060/T061 siguen abiertas: faltan persistencia concreta del agregado AccountHistory, recuperación/aislamiento de agregados dañados y enlace del mantenimiento y sus avisos al lifecycle real de las aplicaciones. Las pruebas validan componentes, no el recorrido completo de eliminación de cuenta. No se declara verde la suite completa del producto. T039 físico permanece aplazado.

## Continuación: persistencia y recuperación completadas

T057/T060 completadas como componentes; T061 mantiene la integración con eventos y pantallas reales. Este apartado sustituye los pendientes de persistencia/recuperación indicados anteriormente, sin declarar terminado el recorrido de cuenta completo.

- `DesktopHistoryStorage`: generaciones con huella y dos copias exactas. Recupera únicamente la generación más reciente; si no hay copia verificable, aísla y muestra aviso genérico. Elimina generaciones anteriores solo después de verificar la nueva. Una escritura parcial se reintenta desde el estado original aún en memoria, sin inventar datos después de reiniciar.
- `WebHistoryStorage`: transacción IndexedDB estricta y comparación previa para impedir que otra pestaña sobrescriba evidencia no leída. Copias del mismo estado, separación por identidad de cuenta y aviso sin datos privados.
- Journal de operaciones: copia independiente de generaciones en escritorio y almacenamiento de copias en IndexedDB v3. Huellas de supresión prevalecen sobre copias restauradas; la compactación elimina también respaldos con contenido. Los registros antiguos sin respaldo siguen siendo legibles, pero no se inventa una copia si se dañan.
- Guardas de persistencia impiden revertir eliminación, vencimiento, inicio/plazo de retención, resultados confirmados o reconstruir entradas ya retiradas del agregado.
- Ensayo integrado con almacenamiento real: guardar vencimiento, crear otro adaptador como al reiniciar, limpiar sin tiempo remoto ni sesión, verificar eliminación de archivos y rechazar reutilización/restauración.
- Avisos diferenciados de guardado, limpieza y recuperación; su presentación y el scheduler de aplicación pertenecen a T061.

Validación: 123/123 pruebas de regresión en 27 archivos; después del ajuste final de avisos, 6/6 pruebas dirigidas. TypeScript correcto y build desktop correcto con advertencias existentes. Se probó IndexedDB con Edge real y el disco local con archivos temporales. No se ejecutó la suite completa del producto, ensayos físicos T039 ni despliegues.
