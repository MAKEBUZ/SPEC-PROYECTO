# Respaldo y restauración — validación local T091/T092

T091 y T092 implementadas y validadas localmente en `patronaje`. No se ejecutaron apagados reales, despliegues, correo real ni operaciones AWS. T087 completó después la reconciliación y compactación; véase `suppression-reconciliation.md`.

## Programación y drenaje

`BackupScheduler` comprueba cada minuto mientras el proceso está abierto si corresponde una copia: al iniciar sin una copia verificada, o tras 24 horas desde la última captura verificada. Recupera ese dato del catálogo durable al reiniciar y no genera una copia por cada día apagado. Los fallos muestran un aviso y se reintentan en la siguiente comprobación.

`beforeShutdown()` espera una copia diaria en curso y exige una copia fresca para el apagado; llamadas concurrentes comparten una ejecución. Solo solicita el apagado tras escritura, lectura de verificación y registro correcto. Un fallo cancela el apagado y permite reintento explícito. Tras una solicitud de apagado exitosa, la barrera permanece cerrada hasta terminar el proceso; no hay una ventana para nuevas escrituras.

La barrera compartida por el Pool de la API abarca solicitudes HTTP, transacciones, carga de objetos, limpieza de staging, verificación de artefactos y purga. Permite terminar trabajo admitido y sus operaciones anidadas, rechaza nuevos trabajos y espera también el trabajo que continúe tras cerrar un socket. Un drenaje que supera 60 segundos falla sin capturar ni interrumpir operaciones admitidas y reabre la admisión. Este límite técnico cancela el intento, no cancela operaciones del usuario.

`AuthModule` admite configuración explícita `backup` y registra `PATRON_BACKUP_RUNTIME`; su ciclo de vida inicia/detiene el programador. Importar el módulo sin esa configuración no programa nada. El controlador operativo debe invocar `scheduler.beforeShutdown()` con un adaptador de apagado autorizado. Los ensayos usan un callback simulado. La exclusión corresponde al monolito compuesto con un Pool compartido; no es un bloqueo distribuido para varios procesos independientes.

## Catálogo y siete días

`BackupCatalog` registra una reserva antes de escribir el dump, de forma que las copias incompletas también quedan inventariadas. Las generaciones son exclusivas, encadenadas por hash, sincronizadas a disco y verificadas por lectura. Un bloqueo abandonado, corrupción, copia sin inventariar o reaparición de una copia borrada impide continuar y requiere reconciliación; no se presume seguridad ni se migra una copia antigua automáticamente.

La limpieza precede cada comprobación programada y cada preapagado. A los siete días desde la captura original marca `deleting`, elimina físicamente y solo entonces confirma `deleted`. Si falla, conserva la intención y reintenta al volver a ejecutar; una interrupción no reconstruye archivos eliminados. Solo borra los tres archivos conocidos dentro del directorio UUID validado, rechazando enlaces y contenido inesperado.

Restauraciones y copias temporales heredan fecha y watermark originales, sin ampliar el plazo. El comando de restauración registra su destino antes de restaurar; el transporte local permite retirar únicamente contenedores de ensayo identificados y sin volúmenes del usuario. El mantenimiento T087 compacta después el journal bajo drenaje y bloqueo del inventario; no descarta evidencia por mera caducidad o inicio de borrado. Detalles en `suppression-reconciliation.md`.

## Captura y restauración reales

`PostgresBackup.capture` exporta una instantánea REPEATABLE READ que importa pg_dump. El manifiesto de objetos y migraciones corresponde a esa instantánea e incluye hashes, motor, esquema, captura, vencimiento y watermark. Los roles se capturan mediante pg_dumpall. Los archivos se escriben de forma exclusiva con flush y lectura posterior; una copia fallida no sustituye otra válida.

La restauración exige un clúster vacío con administrador distinto, recupera roles/permisos y ejecuta pg_restore en una transacción. Aplica supresiones posteriores antes de verificar los objetos activos. Intenciones incompletas, objetos activos ausentes, corrupción, caducidad o cambios de evidencia impiden emitir el recibo de restauración preparada. Una comprobación de eliminación sin fecha terminal fiable exige reconciliación; no inventa fechas ni reinicia sus 90 días. No se ejecutan correo/jobs normales, no se modifica el journal y no se abre tráfico automáticamente.

## Evidencia

- 491/491 pruebas de unidades, recuperación y contratos en una ejecución de regresión.
- 21/21 pruebas dirigidas posteriores en `backup-operations.spec.ts` y `backup-coordinator.spec.ts`, incluida coordinación diaria/preapagado y aislamiento de errores del observador de avisos.
- 3/3 recorridos reales en `backup-schedule.spec.ts` y `backup-restore.spec.ts`: API/PostgreSQL 18.7, drenaje de una transacción real, rechazo HTTP durante captura, fallo de pg_dump que cancela apagado, éxito simulado que conserva la barrera, borrado físico al vencer y restauración con supresiones/roles/objetos.
- TypeScript y compilación correctos. Los ensayos usan directorios temporales y contenedores PostgreSQL aislados, sin volúmenes del usuario.

## Comandos de ensayo

```powershell
.local/toolchain/node.exe node_modules/typescript/bin/tsc --noEmit false --outDir dist --rootDir .
.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/integration/backup-schedule.spec.ts tests/integration/backup-restore.spec.ts --maxWorkers=1
```

Para un clúster de ensayo detenido desde la aplicación, configurar `PATRON_LOCAL_PG_CONTAINER`, `PATRON_LOCAL_PG_USER` y `PATRON_LOCAL_PG_PASSWORD` en el entorno, sin secretos como argumentos:

```powershell
.local/toolchain/node.exe tools/operations/backup.mjs --directory .local/backups --journal .local/suppression
.local/toolchain/node.exe tools/operations/backup.mjs --directory .local/backups --journal .local/suppression --watch
.local/toolchain/node.exe tools/operations/backup.mjs --directory .local/backups --journal .local/suppression --cleanup
.local/toolchain/node.exe tools/operations/restore.mjs --directory .local/backups --journal .local/suppression --blobs .local/blobs --id UUID_DEL_RESPALDO
```

`--watch` mantiene el programador activo; `--cleanup` ejecuta solo la limpieza. El CLI rechaza apagados y solo acepta contenedores `patron-backup-UUID`, etiqueta `patronaje.purpose=backup-test`, loopback y tmpfs. Toma exclusión operacional PostgreSQL, rechaza otras conexiones cliente y bloquea nuevas conexiones ordinarias; exige la aplicación detenida. El límite de salida de 64 MiB pertenece al arnés, no al producto.

## Límites para el despliegue posterior

El respaldo de ensayo está fuera del contenedor PostgreSQL, en el host local. No acredita transferencia ni conservación fuera de EC2: ese transporte y su lectura de verificación deberán configurarse y ensayarse con autorización de despliegue. Tampoco acredita un corte eléctrico, apagado del sistema o coordinación de varios procesos. El cierre de T091 corresponde al alcance autorizado de implementación y pruebas locales, no a operación AWS disponible.

Referencias: [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_dumpall](https://www.postgresql.org/docs/18/app-pg-dumpall.html), [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

Regresión completa final: **159/159 pruebas de integración en 26 archivos**, incluidas captura/restauración reales y escritores afectados por el drenaje. Todos los contenedores de ensayo se retiraron. Estado posterior a T087: **88/98 tareas completas, 10 pendientes**.
