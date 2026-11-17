# Comandos locales

`npm run check`: tipos estrictos. `npm test`: suites Vitest existentes.
`npm run test:unit`: fundamentos puros. Las otras suites de quickstart fallan explícitamente
si todavía no existen; nunca se considera una suite vacía como aceptación superada.
Ningún comando despliega, consulta AWS ni envía correos reales.

No hay scripts raíz `dev:desktop`, `dev:web` o `dev:api`. Los recorridos integrados se ejecutan mediante los arneses E2E locales. La guía vigente es `../../specs/001-patronaje/quickstart.md`.

## Fundamentos disponibles

- `npm run test:integration:local`: Docker local con PostgreSQL 18.7 efímero; descarga imagen si falta. No usa DATABASE_URL ni datos previos.
- `npm run build:desktop`: compila shell/main y preload; no genera instalador.
- `npm run test:desktop:foundation`: prueba Electron con ventana oculta; requiere instalar previamente el binario mediante `node node_modules/electron/install.js`. No descarga implícitamente.
- `npm run test:unit`: incluye solo fuentes de tests, excluye dist.

## Cierre de fundamentos

Con Node 24.22.3/npm 12.2.2 o mediante tools/validation/toolchain.ps1:

- npm run assets:prepare / assets:verify: recuperar y verificar activos fijados, sin servicios de pago.
- npm run test:contracts: incluye servidor HTTP de ensayo exclusivamente en loopback.
- npm run contracts:generate / contracts:check: generar OpenAPI desde DTO o detectar divergencias.

OpenAPI no implica endpoints de negocio implementados. Las pruebas de contratos y PostgreSQL necesitan permitir conexiones locales.

## Recorridos actuales

Compilar primero con `npm run build:desktop`: las pruebas de workers utilizan `dist`.
Para portal/PWA, construir antes con `node node_modules/next/dist/bin/next build apps/web --webpack` y `NEXT_TELEMETRY_DISABLED=1`.

- `node tools/validation/postgres.mjs tests/integration/account-purge.spec.ts`: purga de cuenta con archivos sintéticos reales.
- `node tools/validation/postgres.mjs --e2e tests/e2e/publication.spec.ts`: Electron, publicación con PDF y reanudación.
- `node tools/validation/postgres.mjs --e2e tests/e2e/account.spec.ts`: cuenta y biblioteca con descarga verificada.
- `node node_modules/vitest/vitest.mjs run tests/print/pdf-geometry.spec.ts --maxWorkers=1`: PDF y verificación independiente.

Las pruebas con Electron requieren el binario y entorno gráfico local; las del adaptador nativo requieren C++/Windows SDK y el módulo compilado. La falta de permisos del sandbox para Docker, loopback o renombrados debe resolverse ejecutando el ensayo local autorizado, sin desactivar la seguridad del producto.

## Rendimiento y determinismo PDF

Después de compilar desktop, ejecutar secuencialmente y sin otras pruebas pesadas:

```powershell
.local/toolchain/node.exe tools/validation/pdf-performance.mjs small
.local/toolchain/node.exe tools/validation/pdf-performance.mjs medium
.local/toolchain/node.exe tools/validation/pdf-performance.mjs large
.local/toolchain/node.exe tools/validation/pdf-performance.mjs maximum-format
.local/toolchain/node.exe tools/validation/pdf-performance.mjs 250-pages
.local/toolchain/node.exe tools/validation/pdf-performance.mjs large --cancel
.local/toolchain/node.exe tools/validation/pdf-platforms.mjs
```

Cada carga solicita diez repeticiones y conserva cada resultado en `.local/validation`; se detiene ante fallo o incumplimiento, sin presentar las repeticiones no ejecutadas como correctas. `--cancel` mide desde la petición de cancelación durante el trabajo del worker. El ensayo de plataformas requiere la imagen local fijada de Node, sin descargarla; el contenedor no tiene red y sus montajes son de solo lectura. Compara los bytes generados en Windows/Linux; la verificación independiente se ejecuta en Windows. No acredita instalación en Linux, impresoras ni hardware de referencia.

## Contraseñas (T018)

- npm run password-index:build: construye por particiones, verifica y activa una generación del corpus fijado; conserva la anterior.
- npm run test:passwords: pruebas específicas con fixtures locales y Argon2 nativo.
- npm run test:password-corpus: compila y comprueba el índice completo publicado y el servicio. Requiere assets:prepare y password-index:build previos.

Las pruebas de publicación atómica pueden requerir ejecución fuera del sandbox si Windows devuelve EPERM al renombrar temporales.
