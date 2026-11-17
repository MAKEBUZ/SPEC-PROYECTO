# Recuperación: conexión IPC local

Continuación en patronaje, 2026-11-15. Se conecta `RecoveryStore` al proceso principal de Electron, usando el directorio local de recuperación del usuario Windows. Sin AWS ni despliegue.

Las rutas IPC `recovery.inspect`, `recovery.restore` y `recovery.discard` ahora tienen manejadores reales. La lista devuelve metadatos e identificadores de capacidad, sin rutas ni snapshots completos. Las capacidades pertenecen a una ventana y se revocan al cerrarla; la autorización local existente sigue siendo obligatoria.

Restaurar devuelve el snapshot con `saved: false`. No escribe el archivo original, no publica y no altera por sí mismo el documento del renderer. Descartar exige confirmación explícita y que la copia siga vigente; una confirmación antigua devuelve un error y conserva la copia nueva. Los errores no exponen rutas internas.

Validación ejecutada: prueba con almacenamiento real y router IPC, aislamiento entre ventanas, acceso CAD no habilitado, falta de confirmación, restauración sin guardar, descarte obsoleto y capacidad revocada. Regresión de recuperación: **64/64**, 14 archivos. TypeScript y compilación desktop correctos; persisten los avisos existentes de tamaño del bundle y directiva `use client`.

T044 permanece abierta: falta la captura periódica conectada al documento activo del renderer y la interfaz que permite recuperar o descartar, con el aviso de cambios sin guardar de T043. La conexión IPC es un avance de integración, no una demostración del recorrido completo ni del objetivo de 60 segundos con cargas reales.

Validación adicional sobre la compilación modificada: 7/7 E2E de cuenta/biblioteca y Electron, 49,00 s. La suite no sustituye el recorrido de recuperación pendiente de conectar a la interfaz.
