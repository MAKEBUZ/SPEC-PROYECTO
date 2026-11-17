# Entorno local de fundamentos

Copiar `.env.example` a `.env` solo para configurar servicios locales. Los secretos reales
no se versionan. No usar endpoints AWS ni bases compartidas. `APP_ENV=test` utiliza blobs
y correo de ensayo; ningún correo debe enviarse a destinatarios reales.

La referencia del plan es Node 24.22.3/npm 12.2.2. El host inicial tiene Node 24.15.0/npm
11.12.1; registrar resultados con las versiones realmente utilizadas. Eso no demuestra
compatibilidad con el runtime objetivo. PostgreSQL 18.7 se verificará localmente antes
de ejecutar pruebas SQL: no sustituir por una base remota para completar esas pruebas.

## PostgreSQL de fundamentos

Docker local ya se inició y PostgreSQL 18.7 se validó. `npm run test:integration:local` crea su propio contenedor temporal y lo retira al terminar; no reutiliza la base configurada en .env. Si se interrumpe abruptamente el proceso, revisar únicamente contenedores etiquetados `patronaje.purpose=foundation-test`.

## Toolchain de referencia disponible

Node 24.22.3 y npm 12.2.2 están aislados en .local/toolchain (ignorado por Git). Ejecutar, por ejemplo, `./tools/validation/toolchain.ps1 run check`. No modifica Node global. En otra máquina instalar esas versiones o descargar node.exe desde https://nodejs.org/dist/v24.22.3/win-x64/node.exe y verificar contra https://nodejs.org/dist/v24.22.3/SHASUMS256.txt; npm está fijado por packageManager.

Después de npm ci --ignore-scripts, ejecutar npm run assets:prepare para recuperar corpus y TTF por revisión y hash. Los binarios nativos deben instalarse/validarse expresamente en su plataforma; no se consideran ejecutados por npm ci --ignore-scripts.
