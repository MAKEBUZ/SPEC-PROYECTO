# T020 — cola persistente de correo

Fecha: 2026-11-15. Rama patronaje. Sin despliegues, correo real ni gasto AWS.

## Implementación y composición

Migración 003-outbox.sql: trabajos de correo con clave de deduplicación única por token, estado, intentos y siguiente intento. El payload se almacena como bytea cifrado mediante AES-256-GCM, nonce aleatorio de 12 bytes y tag de 16 bytes. La autenticación adicional vincula cuenta, token, versión de formato y clave. El destinatario y el secreto no se guardan en claro en la cola. Las claves de 32 bytes se suministran externamente al módulo, nunca se generan como fallback o se persisten junto al payload; se conservan las claves antiguas necesarias para descifrar trabajos pendientes.

OutboxQueue.enqueue usa la misma conexión/transacción que la emisión. No accede al transporte. OutboxWorker.dispatchPending lee solo trabajos confirmados, bloquea cuenta antes del trabajo y revalida el token. El bloqueo de cuenta se mantiene durante el transporte, serializando reemplazos/consumos; workers concurrentes omiten cuentas/trabajos bloqueados. Los payloads se eliminan al confirmar entrega o invalidación. Un trigger limpia inmediatamente el payload pendiente al consumir o sustituir el token, dentro de la misma transacción. La caducidad y el vencimiento de recuperación de cuenta se limpian al recorrer la cola, aunque el reintento aún no corresponda.

AuthModule.withOutbox conecta los endpoints reales con la cola y expone PATRON_OUTBOX_WORKER. Requiere transporte, claves y origen HTTPS explícitos. No configura SES/SMTP, no abre conexiones a AWS ni arranca un proceso de envío al importar. El ejecutor debe invocar dispatchPending periódicamente; cada llamada procesa hasta 100 candidatos. La configuración de ejecución del producto sigue pendiente junto con el resto de la composición de aplicación.

Los fallos de transporte, clave ausente o cifrado alterado conservan el payload cifrado y programan esperas de 5, 10, 20, 40, 80 y luego 120 segundos. Es una selección técnica para esta cola; no modifica los plazos de enlaces ni introduce el centro de notificaciones aplazado. No se guardan excepciones del proveedor ni cuerpos del mensaje en logs o resultados de operación.

## Evidencia ejecutada

Entorno local Windows x64, Node 24.22.3, PostgreSQL 18.7 efímero. Docker estaba detenido y se inició desde su instalación por usuario; los contenedores de ensayo fueron retirados al terminar. No se modificaron volúmenes del usuario.

- `./tools/validation/toolchain.ps1 run check`: correcto.
- `.local/toolchain/node.exe tools/validation/postgres.mjs tests/integration/outbox.spec.ts tests/integration/token-flows.spec.ts tests/integration/identity.spec.ts tests/integration/idempotency.spec.ts`: **34/34** (8 outbox, 16 tokens, 10 fundamentos).
- `./tools/validation/toolchain.ps1 exec -- vitest run tests/unit tests/contracts`: **54/54**.

Los ocho casos cubren: aislamiento antes de commit/rollback; cifrado, deduplicación y reinicio del worker; serialización de envío/reemplazo con workers concurrentes; eliminación por consumo/sustitución; reintentos; limpieza de expirados durante backoff; payload alterado/clave ausente; y recorrido HTTP de registro→verificación→reset usando cola persistente real y transporte capturado. Las expectativas de migraciones de los fundamentos se actualizaron a las tres migraciones disponibles, manteniendo las comprobaciones de rollback e integridad.

## Límites

PostgreSQL y el proveedor de correo no comparten transacción. Si el proveedor acepta el mensaje y el proceso cae antes de confirmar el estado delivered, el reintento puede entregar el mismo mensaje otra vez. No se promete exactamente una entrega; nunca se genera otro token por ese reintento. Cada intento vuelve a comprobar vigencia y sustitución. El transporte concreto debe tener tiempos de espera finitos y resolver su promesa al concluir la solicitud; no debe dejar un envío independiente en segundo plano tras rechazarla. El bloqueo durante envío puede retrasar operaciones de esa misma cuenta.

La desaparición del payload corresponde a la base activa; las copias históricas cifradas conservan su retención operativa aprobada. No se afirma borrado físico inmediato de todos los backups.

T021 (sesiones), T022 (cookie/CSRF), ciclo de cuenta y UI siguen pendientes. El host integral AccountHost aún no se ha conectado a la composición completa; sus 33 fallos RED registrados en T019 no se presentan como resueltos ni se ocultaron. US1 no está completa.

No hay .specify/extensions.yml ni checklists de esta feature; no hay hooks adicionales que ejecutar.
