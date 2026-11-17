# T022 — cookie segura y CSRF

Fecha: 2026-11-15. Rama patronaje. Sin cambios funcionales, despliegues ni AWS.

## Implementación

Web/PWA inicia sesión mediante cookie `__Host-patron-session` con Secure, HttpOnly, SameSite=Lax, Path=/ y sin Domain. Expires conserva el vencimiento absoluto de la sesión. No se devuelve Authorization a esos clientes. CAD mantiene su transporte explícito; cookie y Bearer juntos se rechazan para evitar identidad ambigua.

CsrfGuard se ejecuta antes de autorización/DTO. Las solicitudes de navegador se reconocen por cookies, Origin, Fetch Metadata, cabecera de cliente o clientType web/mobile. Mutaciones requieren Origin exacto configurado y token CSRF en cookie/cabecera, firmado con HMAC-SHA256 bajo un contexto distinto de operaciones y ligado a la sesión. La cookie auxiliar es Host/Secure/HttpOnly y no es la credencial de autenticación. El token previo al login no es válido para una sesión posterior. Se rechazan origen null/ausente en mutaciones de navegador, Fetch Metadata ajeno, cookies duplicadas y mezcla cookie/Bearer. El navegador no puede pedir transporte desktop como alternativa.

GET /auth/csrf exige cabecera personalizada y no habilita CORS; prepara únicamente el estado de protección, no una sesión. Login rota el token y comunica el nuevo por X-CSRF-Token. Logout y cierre de todas eliminan las dos cookies solo después de confirmar la revocación. La sesión y sus autorizaciones se siguen comprobando en PostgreSQL.

BrowserSession en apps/web/src/auth/session.ts solicita el token al necesitarlo y lo conserva solo en memoria. Usa credentials=same-origin, cache=no-store y redirect=error; no almacena secretos en localStorage, archivos o service worker. No reenvía una mutación tras error ni pérdida de conexión. La gestión del resultado pendiente sigue correspondiendo al flujo aprobado de operaciones. El módulo de autenticación recibe publicOrigin HTTPS explícito; sin él no acepta transporte navegador.

Bootstrap usa ModuleRef para consultar proveedores opcionales sin provocar errores de arranque en los módulos de prueba de fundamentos. DTO/rutas/OpenAPI incorporan CsrfView y la ruta técnica; no se añadieron dependencias.

## Validación

Node 24.22.3, Windows x64, PostgreSQL 18.7 efímero y correo capturado. Los contenedores de ensayo se retiraron al finalizar.

- Línea base CSRF: 6 casos fallidos por ausencia de ruta/transporte; luego se ampliaron a 8.
- Integración seleccionada final: **50/50** (8 CSRF, 8 sesiones, 16 tokens, 8 outbox, 10 fundamentos).
- Unitarias/contratos finales: **57/57**, incluidos 3 casos del cliente web.
- Suite integral: **71 correctas y 12 fallidas, 83 totales**. Siguen los 11 casos de ciclo de cuenta y el de autorización de la ruta /projects todavía ausente; ninguna expectativa se debilitó.
- TypeScript y OpenAPI: correctos. Revisión de whitespace: sin errores.

Se prueban login web/mobile, atributos de cookies, falta/cambio de Origin y CSRF, token de otra sesión, token previo al login, cookies duplicadas, logout/cierre de todas, caducidad no renovada, continuidad independiente del CAD y mutaciones públicas protegidas. El cliente se prueba con fetch controlado para verificar ausencia de Authorization, uso del token rotado, no reenvío y rechazo de URL externa.

Las pruebas HTTP locales envían cookies/cabeceras explícitamente; no simulan la aplicación de Secure/HttpOnly por un navegador real. La aceptación E2E de navegador/PWA bajo HTTPS y en teléfonos reales continúa en T026 y las tareas de clientes. No se configuró TLS, dominio ni servicio de nube. US1 sigue incompleta por sus tareas pendientes.

Sin extensions.yml ni checklists de feature: no hay hooks adicionales.
