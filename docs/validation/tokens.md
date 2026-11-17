# T019 — registro, verificación y restablecimiento

Fecha: 2026-11-14. Rama: patronaje. Implementación local, sin despliegue, correo real ni recursos AWS.

## Implementación

AuthModule.register compone AuthController y TokensService con Pool PostgreSQL, PasswordService, clave HMAC de operaciones y TokenDeliveryQueue explícitos. No proporciona adaptadores ficticios por defecto. Los cinco endpoints usan DTO y guardas existentes. Registro normaliza el correo, serializa altas concurrentes y guarda Argon2id mediante T018, sin iniciar sesión.

Enlaces: 32 bytes aleatorios, solo SHA-256 en la tabla, propósito específico, 2 horas de verificación y 30 minutos de reset según PostgreSQL. Emisión, sustitución y encolado comparten transacción. GET no consume. Repetir una operación confirmada no repite efectos ni amplía plazos. La respuesta pública de solicitud de reset es el mismo 202 pendiente para correo existente o desconocido; no afirma entrega.

Reset consume el enlace, cambia contraseña y revoca todas las sesiones conjuntamente, sin iniciar otra ni verificar automáticamente el correo. Conserva la eliminación pendiente y su plazo. Revalida vencimientos después del hash y antes de confirmar los efectos. Errores controlados revierten los efectos mediante savepoint antes de registrar fallo; errores de infraestructura revierten también el resultado. Secretos no aparecen en OperationResult, respuestas ni logs.

El reenvío recibe identidad/sesión del resolver de confianza, nunca del cuerpo; comprueba PostgreSQL con orden de bloqueo cuenta→sesión y revalida después del encolado.

## Pruebas ejecutadas

Windows x64, Node 24.22.3, npm 12.2.2, PostgreSQL 18.7 efímero en loopback. Contenedores retirados al terminar, sin volúmenes del usuario.

- `./tools/validation/toolchain.ps1 run check`: correcto tras el cambio final.
- `.local/toolchain/node.exe tools/validation/postgres.mjs tests/integration/token-flows.spec.ts tests/integration/identity.spec.ts tests/integration/idempotency.spec.ts`: **26/26**, incluidos **16 casos T019**.
- `./tools/validation/toolchain.ps1 exec -- vitest run tests/unit tests/contracts`: **54/54**.
- `./tools/validation/toolchain.ps1 run contracts:check`: OpenAPI consistente.
- `git diff --check`: sin errores; avisos existentes de conversión LF/CRLF.

Se observó primero RED por ausencia del módulo. Cobertura T019: hashes/plazos, política, registro/consumo concurrente, idempotencia, GET sin efectos, propósito/reemplazo/expiración, falta de corpus, revalidación de sesión, rollback por cola o revocación fallida y conservación de eliminación pendiente. Un caso vence el enlace durante la revocación y comprueba rollback de contraseña, consumo y sesiones.

El ejecutor permite filtrar rutas existentes dentro de la suite; sin filtros conserva todas las pruebas. No se añadieron skip ni exclusiones.

## Límites y tareas siguientes

La cola de ensayo guarda recibos en la transacción y secretos solo en memoria; consulta únicamente entregas confirmadas y vigentes. No es outbox durable. Persistencia cifrada, entrega y eliminación del payload corresponden a **T020**. Las sesiones de ensayo están en PostgreSQL con resolver de confianza; login y resolución real del secreto corresponden a **T021**. El corpus se sustituye por una consulta controlable en estos escenarios; su índice completo ya se validó en T018. Cookie/CSRF y pantallas siguen en tareas posteriores.

Se ejecutó también la suite completa antes de añadir el último caso: **25 correctas y 33 fallidas**. Las 33 corresponden a los escenarios RED previos authentication/account-lifecycle: AccountHost aún importa FoundationModule vacío, sin composición de correo, sesiones y ciclo de cuenta. No se cambiaron esas pruebas ni se afirma que sus flujos estén validados. T019 se prueba directamente contra AuthModule real. **US1 no está completa**.

Sin `.specify/extensions.yml` ni directorio de checklists: no hay hooks o gates adicionales configurados.
