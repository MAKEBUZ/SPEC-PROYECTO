# T021 — sesiones, revocación y perfil

Fecha: 2026-11-15. Rama patronaje. Sin cambios de alcance, despliegue ni gasto AWS.

## Implementación

SessionService crea sesiones con UUID independiente y secreto criptográfico aleatorio de 32 bytes; PostgreSQL guarda solo SHA-256. El resolver consulta la sesión y compara su verificador en tiempo constante. El identificador sin secreto, credenciales malformadas o secretos distintos no autentican. El secreto se devuelve únicamente al crear la sesión, mediante Authorization para el cliente desktop; SessionView, perfil y resultados de operaciones no lo contienen.

El inicio verifica contraseña con Argon2id sin depender de la consulta del corpus. Asigna clase verification, normal o account_recovery según el estado persistido. La cuenta pendiente de eliminación conserva su fecha y no puede iniciar sesión después del vencimiento. startedAt/expiresAt proceden de PostgreSQL: siete días absolutos, sin renovación por actividad. La comprobación final de login impide confirmar tras el vencimiento de recuperación.

Perfil y mutaciones bloquean cuenta→sesión, vuelven a validar antes de confirmar/enviar y rechazan sesiones limitadas, revocadas o vencidas. PATCH solo cambia displayName. Cambiar contraseña requiere la contraseña actual y aplica T018; no revoca sesiones por analogía con el reset, conforme al contrato aprobado. Errores controlados conservan resultado terminal sin cambios parciales; errores de infraestructura revierten toda la transacción. La huella HMAC evita guardar contraseñas en resultados.

Cerrar sesión invalida únicamente la identificada, incluso vencida/revocada, sin conceder acceso a recursos. Su huella de idempotencia incluye sessionId: el mismo intento no puede cerrar otra sesión. Cerrar todas exige confirmation=true y sesión normal válida; invalida todas incluida la actual sin crear otra. Se revalida expiración al final y un fallo revierte todas las revocaciones.

AuthModule registra SessionService y ProfileController y exporta el resolver. createLocalApi usa ese resolver cuando existe y mantiene denegación por defecto para composición solo de fundamentos. Se conserva la inyección explícita de resolver de pruebas.

## Validación ejecutada

Node 24.22.3, npm 12.2.2, Windows x64, PostgreSQL 18.7 efímero. Contenedores retirados tras las pruebas. Se usa el corpus completo validado en T018, outbox cifrado real y transporte de correo capturado.

- Línea base de authentication.spec.ts: **22 fallos** por composición ausente.
- Integración seleccionada (sessions, token-flows, outbox, identity, idempotency): **42/42**.
- Suite de integración completa tras el cambio final: **63 correctas, 12 fallidas, 75 totales**. Los ocho casos de sessions.spec.ts pasan y **21 de los 22** escenarios anteriores de authentication.spec.ts pasan.
- Unitarias y contratos: **54/54**.
- `./tools/validation/toolchain.ps1 run check`: correcto.
- `./tools/validation/toolchain.ps1 run contracts:check`: OpenAPI consistente.
- `git diff --check`: sin errores; avisos existentes LF/CRLF.

Los casos nuevos cubren secreto/ID, lectura y modificación de perfil, idempotencia y campos ajenos, reautenticación y política de contraseña, logout vencido, acceso limitado por eliminación, identidad de logout, rollback de revocación al vencer y ausencia de secretos en resultados. Los anteriores ejercitan también reset con revocación real y una carrera que revoca la sesión mientras PATCH espera el bloqueo de cuenta.

AccountHost se conectó a AuthModule.withOutbox; ya no usa FoundationModule vacío. Cada host tiene un esquema exclusivo en la base efímera para impedir que suites paralelas procesen correos de otra con claves/transportes distintos. El esquema sintético se retira al cerrar. No se relajan las expectativas de aceptación ni se omiten casos.

## Pendientes explícitos

Los 12 fallos restantes corresponden a once escenarios de ciclo de cuenta (T024/US8; aún falta destructive-scope) y al acceso limitado a GET /projects, cuya ruta todavía no existe. La última respuesta es RESOURCE_UNAVAILABLE en vez de ACCOUNT_LIMITED; la misma prueba confirma que el perfil implementado sí rechaza la cuenta limitada. No se creó un endpoint ficticio ni se modificó el resultado esperado para ocultarlo.

T022 conectará cookie segura y CSRF para web/PWA. Hasta entonces el controlador no emite credenciales Bearer como alternativa para clientType web/mobile; rechaza esos transportes pendientes antes de crear una sesión. El servicio conserva las clases de acceso compartidas para los tres clientes. T023 implementará almacenamiento protegido y habilitación local del CAD; T024/T025/T026 completarán ciclo/UI/aceptación. No se afirma que US1 o la entrega estén terminadas.

No existen extensions.yml ni checklists de la feature; no hay hooks adicionales de implementación.
