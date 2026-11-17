# T065/T069 — biblioteca y PWA: evidencia local

2026-11-16, Windows x64 10.0.26200. Versiones instaladas observadas, sin inferir cobertura de la versión anterior:

| Navegador | Versión | Cuenta y PWA |
|---|---|---|
| Chrome | 157.0.8103.51 | 13/13 pruebas aprobadas |
| Edge | 157.0.4341.60 | 13/13 pruebas aprobadas |

Suites `tests/e2e/account.spec.ts` y `tests/e2e/pwa.spec.ts`; PostgreSQL temporal local, retirado al terminar. Metadatos en `.local/validation/browser-{chrome,edge}-{account,pwa}.json`. Selector `PATRON_TEST_BROWSER=chrome` o `edge`; no descarga navegadores ni modifica perfiles personales.

Cobertura: cuenta y sesión, biblioteca privada, vista previa, descarga íntegra de PDF, aislamiento de caché, tamaños de pantalla y página neutral sin conexión. Cuenta usa un puente de transporte localhost; PWA prueba el service worker real en localhost. El viewport móvil no acredita Safari ni instalación desde icono.

El recorrido `first-release.spec.ts` enlaza una revisión del CAD con generación/publicación de PDF, descarga de editable/PDF byte a byte desde portal móvil emulado y envío/restauración de proyecto en papelera sin cambiar el archivo local.

Pendientes: versiones anteriores de Chrome/Edge, Android 12+ Chrome e iOS 17+ Safari físicos, apertura de PWA instalada, interrupción/reanudación de descargas en esos dispositivos y aceptación de la matriz completa. Se conserva el protocolo de `pwa-devices.md`; T026/T065/T069 continúan abiertas.
