# Entorno local reproducible

Guía vigente: [README](../README.md), [demo](demo.md) e [informe de validación](validation/delivery-report.md). Node 24.22.3/npm 12.2.2 y PostgreSQL 18.7 son las versiones verificadas; los runtimes anteriores citados en informes históricos no son la referencia actual.

## Tres composiciones distintas

- Demo: `node tools/demo/start.mjs` crea su propio PostgreSQL efímero, claves aleatorias, blobs locales y correo capturado. Abre portal y CAD con transporte loopback de ensayo; no certifica HTTPS/PWA física. No lee DATABASE_URL ni claves AWS de .env. Cada sesión parte de una base nueva.
- Pruebas: `npm run test:integration:local` crea y retira otro contenedor aislado, etiquetado `patronaje.purpose=foundation-test`; no usa bases existentes. Electron/Next y corpus deben prepararse según README.
- Piloto: `apps/api/src/runtime/main.ts` compone S3, SES y respaldos remotos. Requiere configuración de producción y autorización independiente. No ejecutarlo para preparar la entrega local.

## Variables y secretos

Copiar .env.example a .env conserva una plantilla local ignorada por Git. Sus valores CHANGE_ME son ejemplos inválidos; copiarla no inicia ni configura servicios automáticamente. El lanzador de demo genera los valores efímeros en su propia composición. No trasladar runtime.env del piloto, correo capturado, perfiles del CAD ni credenciales a Git.

Los recursos se descargan por URL/revisión fijada y se verifican por SHA-256 con `npm run assets:prepare`. Construir el corpus con `npm run password-index:build`. La instalación usa `npm ci --ignore-scripts`; ejecutar explícitamente el instalador oficial de Electron y la compilación nativa indicada en README. No hay fallback silencioso a AWS.

## Toolchain del equipo de desarrollo

En este equipo existe .local/toolchain (ignorado por Git) con Node 24.22.3/npm 12.2.2. `./tools/validation/toolchain.ps1 run check` lo utiliza; ese directorio no se distribuye con el repositorio. En un equipo nuevo instalar esas versiones y comprobar `node --version` y `npm --version` antes de usar los comandos estándar del README.

## Limpieza

Cerrar la demo con Ctrl+C retira solo su contenedor. Si hubo terminación forzada, inventariar contenedores con etiqueta `patronaje.purpose=demo` o `patronaje.purpose=foundation-test` y revisar el identificador antes de retirar alguno. Nunca eliminar contenedores ajenos, perfiles personales ni documentos del usuario.
