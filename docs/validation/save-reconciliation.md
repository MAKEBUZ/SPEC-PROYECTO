# T041 — reconciliación y validación local

Fecha de ejecución: 2026-11-15. Rama: patronaje. Implementación local, sin AWS ni despliegues.

## Comportamiento implementado

- Guardado con intención versión 2 y confirmación envueltas en checksum. La copia nueva y el respaldo previo se conservan en el almacenamiento local del CAD, independientes del destino USB. La intención precede al reemplazo; no hay transacción multifichero.
- `SaveJournal` inspecciona intenciones al consultar Recuperación local, también tras arrancar otra instancia. Verifica checksum, esquema, revisión y hash de bytes. Una confirmación válida resuelve ese intento. Una confirmación corrupta o un registro antiguo sin evidencia íntegra se señala como dañado, sin reparación ni uso de rutas arbitrarias del registro antiguo.
- Intenciones no confirmadas ofrecen separadamente contenido nuevo y anterior. Se prefieren copias locales; destino, temporal o respaldo nativo solo se usan si coinciden sus hashes y el volumen sigue siendo el original. Una evidencia incompatible nunca se interpreta como éxito. La inspección no modifica el destino ni reintenta el guardado.
- Las candidatas llegan al renderer mediante capacidades opacas; recuperar requiere confirmación, mantiene el estado sin guardar y no conserva la vinculación al archivo original. Descartar persiste evidencia por candidato y no elimina el original ni permite que el candidato reaparezca al reiniciar.
- Se consulta tipo de unidad, GUID de volumen, número de serie, sistema de archivos y atributo de solo lectura. La identidad del volumen se comprueba durante el guardado; cambiar de unidad bajo la misma letra aborta la operación. Un volumen no disponible no impide recuperar la copia independiente.
- Se rechazan rutas relativas, UNC, dispositivos, ADS, nombres reservados, componentes ambiguos, reparse points, contenido offline, raíces OneDrive conocidas y raíces registradas con Cloud Files. Errores inesperados al comprobar Cloud Files no se convierten en autorización. Solo lectura impide guardar, pero no se convierte en una prohibición de lectura.

No se introduce una lista de sistemas de archivos que reduzca el alcance USB. La validación consulta las capacidades reales y exige que las operaciones nativas finalicen y se verifiquen; un fallo no activa un fallback que borre el original.

## Pruebas ejecutadas

- Compilación nativa Release x64: correcta con MSVC y SDK instalados. La primera compilación de Cloud Files detectó la dependencia de tipos NTSTATUS; se corrigió incluyendo winternl.h. Se conserva el aviso C++17/C++20 existente.
- `native-smoke.mjs`: correcto sobre **NTFS**, volumen escribible; creación exclusiva, reemplazo, respaldo, flush, rechazo UNC/junction y padre inexistente. No se montaron ni formatearon unidades.
- Vitest: **84/84**, 18 archivos, 6,03 s, con `PATRON_NATIVE_TEST=1` para escritor/manejadores. Incluye reinicio lógico, interrupción antes/después del reemplazo, cambio de volumen, evidencia dañada, candidato alternativo verificado, descarte persistente, capacidades IPC, rutas ambiguas y regresión de recuperación. Los fallos y cambios de volumen son inyectados, no cortes físicos.
- Electron: **3/3**, 40,96 s: `save-restart`, `native-document`, `unsaved-changes`. El primero arranca Electron con un journal creado por un guardado nativo interrumpido, recupera explícitamente y conserva los bytes del archivo. El primer intento de la suite falló por limpieza del perfil antes de finalizar el proceso; se corrigió esperando el cierre y la repetición pasó.
- TypeScript y build desktop correctos. Avisos de bundle/directiva ya existentes, sin errores.

## Estado y límites de aceptación

T041 completada como implementación. T039 mantiene pendientes desconexión física USB, disco lleno/fallos de dispositivo y la matriz USB NTFS/exFAT; T093/T097 mantienen empaquetado y aceptación de plataforma. Las pruebas no certifican resistencia a pérdida de alimentación ni todos los proveedores de sincronización: carpetas sincronizadas siguen fuera del alcance y un sincronizador que no se registra en Windows puede no ser identificable como tal. No se afirma que la entrega completa esté terminada.

Total actualizado: **60/98 tareas completadas; 38 pendientes**.

## Referencias de API verificadas

- [GetVolumeInformationW](https://learn.microsoft.com/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationw): sistema de archivos y atributos de volumen.
- [CfGetSyncRootInfoByPath](https://learn.microsoft.com/en-us/windows/win32/api/cfapi/nf-cfapi-cfgetsyncrootinfobypath): detección de raíces registradas mediante Cloud Files.
