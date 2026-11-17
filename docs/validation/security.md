# Seguridad y fronteras — primera entrega local

Fecha: 2026-11-16. Rama: `patronaje`. Datos sintéticos, API y PostgreSQL efímeros locales; sin despliegues ni AWS. Este informe verifica el alcance de T094, no certifica ausencia de vulnerabilidades ni sustituye la aceptación física pendiente.

## Evidencia ejecutada

| Frontera | Pruebas | Resultado |
|---|---|---|
| Identificadores ajenos y alcance destructivo | `tests/integration/security.spec.ts`, `downloads.spec.ts` | Un propietario no obtiene contenido ajeno ni puede enviar su proyecto a papelera; tampoco puede reutilizar su alcance. Las respuestas privadas y los errores llevan `no-store`. |
| Sesiones y credenciales | `security.spec.ts`, `sessions.spec.ts` | Credencial ausente, alterada o revocada rechazada; secretos no aparecen en perfil ni almacenamiento SQL de sesión; reautenticación y comprobación al commit. |
| Cookies y CSRF | `tests/integration/csrf.spec.ts` | Cookies Host/Secure/HttpOnly/SameSite; Origin, token por sesión y rechazo de mezcla cookie/Bearer, cookies duplicadas, token anterior al login y mutaciones públicas sin CSRF. |
| Publicación y cuota | `tests/integration/publication.spec.ts` | Reserva concurrente limitada, idempotencia, bytes/hash, validación de artefactos y rechazo al perder autorización antes de confirmar. |
| Descargas | `tests/integration/downloads.spec.ts` | Hash y rangos, rechazo de corrupción antes de entregar bytes; transferencia autorizada puede terminar, pero reintento/reanudación exige autorización vigente. |
| IPC y archivos | `tests/unit/boundaries.spec.ts`, `account-ipc.spec.ts`, `ipc-router.spec.ts`, `publication-boundary.spec.ts`, `windows-paths.spec.ts`, `blob-stream.spec.ts` | Capacidades ligadas a ventana y frame, sin rutas arbitrarias; traversal, claves hostiles y sustitución de blobs rechazados. |
| Secretos y errores | `tests/unit/http-foundation.spec.ts`, `account-store.spec.ts`, `browser-session.spec.ts` | Mensajes internos y secretos no se incluyen en errores/logs; credenciales protegidas y separación de sesión de navegador. |
| Descarga local | `tests/unit/verified-download.spec.ts` | No presentar transferencia incompleta como archivo validado. |

Ejecución dirigida: **39/39 pruebas de integración, 5 archivos**, y **45/45 pruebas locales, 10 archivos**. Contenedor de ensayo retirado. Los totales pertenecen a ejecuciones distintas y no representan un único recorrido de aceptación.

Regresión de interfaz: **12/12 E2E** (`tests/e2e/account.spec.ts` y `pwa.spec.ts`) con Edge/Electron y API/PostgreSQL locales. Se verificó el shell público de PWA: CacheStorage contiene únicamente la página offline neutra y tres iconos; navegación offline no muestra cuenta ni biblioteca privadas. Cuenta, recuperación, acceso limitado y biblioteca se recorrieron contra la API real. Builds Next y desktop correctos; se mantienen las advertencias existentes de tamaño del bundle y directivas `use client` del empaquetado desktop.

## Límites

- La aceptación de PWA instalada en Android/iPhone y de las versiones de navegador de la matriz sigue en T065/T069; una vista móvil emulada no la sustituye.
- La reconciliación de operaciones y sus bloqueos transversales sigue abierta en T061. No se relaja autorización del servidor por ese trabajo pendiente.
- La recuperación desde respaldo y la conservación del diario externo siguen en T087/T091/T092.
- No se instaló ni configuró infraestructura remota ni se contrataron certificados de firma.
