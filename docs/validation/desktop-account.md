# T023 — acceso y sesión del CAD

Fecha: 2026-11-15. Rama patronaje. Sin despliegues, correo real ni gasto AWS.

## Implementación

AccountSession reside en main y serializa las transiciones. Solo habilita el CAD tras login normal y consulta de perfil verificado de la misma cuenta. La habilitación local se conserva independientemente de sesión remota, logout, expiración y revocación. El router de operaciones locales comprueba ese permiso antes de invocar handlers CAD existentes; no se implementan por esta tarea herramientas geométricas ni persistencia de documentos.

ProtectedAccountStore persiste un único estado cifrado en userData/account/account.bin: versión, habilitación local, sesión activa, capacidades de revocación, comprobación limitada de eliminación y cierre global pendiente. Usa safeStorage asíncrono de Electron 45 en Windows, sin alternativa en texto claro ni backend basic_text de otros sistemas. Escribe temporal cifrado, sincroniza el archivo y reemplaza mediante rename. El directorio privado retira herencia y concede acceso al SID del usuario y SYSTEM mediante icacls. Un fallo de cifrado/permisos/escritura no afirma persistencia; un archivo corrupto no se repara ni elimina automáticamente. Esto no protege frente a procesos maliciosos del mismo usuario ni promete recuperación ante pérdida física del disco.

Logout local guarda primero la sesión fuera del acceso activo como capacidad limitada a DELETE /sessions/current con operationId estable. Sin conexión muestra revocación pendiente. Al reabrir/reconectar reintenta esa misma invalidación, sin usar la credencial para perfil/publicación y sin revocar un nuevo inicio. Cerrar todas requiere conexión, sesión normal y confirmación. Un resultado desconocido se conserva sin repetir automáticamente revoke-all; solo podrá resolverse consultando la operación con una nueva sesión válida de la misma cuenta. La API de consulta corresponde a T051; hasta entonces conserva la incertidumbre. Rechazos confirmados se distinguen de éxito y resultado pendiente.

Las credenciales limitadas de eliminación se guardan separadas y sobreviven logout/reapertura; solo pueden usarse en GET /deletion-status/{requestId}. No se exponen por IPC ni se reutilizan como sesión. SC-281 se verifica en la frontera local; la emisión y autorización real del servidor pertenecen a T024. Ausencia de credencial, 404 o fallo no se interpreta como eliminación confirmada.

HttpsAccountRemote admite únicamente un origen HTTPS de configuración main, rutas cerradas, sin cookies ni redirecciones, timeout de 15 segundos. PATRON_API_ORIGIN queda sin definir por defecto y no se acepta desde renderer. Main revisa pendientes/conexión cada 15 segundos con una sola revisión en curso y al abrir; renderer puede solicitar reconnect, nunca aportar una credencial o URL. No se realizó ninguna conexión AWS.

IPC incorpora account.status/login/logout/logoutAll/refresh/reconnect, con validación estricta y origen/mainFrame como en fundamentos. Solo devuelve estados no secretos. Los errores al renderer son genéricos sin contraseñas, rutas privadas ni credenciales. Las pantallas de cuenta siguen en T025.

## Validación ejecutada

- TypeScript: correcto.
- Unitarias/contratos finales: **71/71**. Incluyen nueve casos de estado de cuenta, dos de almacén cifrado, transporte HTTPS restringido, validación IPC y comprobación de habilitación local.
- Integración seleccionada PostgreSQL: **51/51**. El nuevo escenario usa login/perfil/revocación reales con corpus completo y outbox; conserva habilitación offline, reabre, inicia otra sesión y confirma que la revocación pendiente solo afecta a la antigua. Después provoca revocación remota y conserva acceso local.
- Prueba nativa Electron oculta: **PASS** en Electron 45.3.2 / Node 24.22.2. Comprueba safeStorage asíncrono real, roundtrip de estado, archivo sin secreto en claro, ACL privada e IPC aislado. Datos sintéticos en .local/desktop-account-smoke-*; PATRON_API_ORIGIN se elimina del entorno de esta prueba.
- `git diff --check`: sin errores; avisos existentes de conversión LF/CRLF.

La prueba inicial de estado fue RED por ausencia del módulo. Durante la validación nativa se detectó obsolescencia de safeStorage síncrono y se cambió a la API asíncrona disponible en los tipos del runtime instalado; se repitió la prueba correctamente, sin modificar dependencias.

Comandos: toolchain.ps1 run check; toolchain.ps1 exec -- vitest run tests/unit tests/contracts; node tools/validation/desktop-smoke.mjs; node tools/validation/postgres.mjs con desktop-account, csrf, sessions, token-flows, outbox, identity e idempotency.

La suite integral no se volvió a ejecutar en T023: los doce fallos documentados en T022 (proyectos/ciclo de cuenta pendiente) no se declaran corregidos. Tampoco se afirma aceptación E2E de pantallas, publicación ni eliminación remota; corresponden a sus tareas posteriores. No se modificaron expectativas para ocultar esos pendientes.

No hay extensions.yml ni checklists de feature; sin hooks adicionales.
