# PATRONAJE

CAD de patronaje digital para patronistas, diseñadores de moda, talleres de confección y estudiantes. Permite dibujar piezas con medidas en milímetros, conservar documentos editables, preparar impresión a escala real y publicar versiones para consultarlas desde otros dispositivos. Guardar en el equipo **no publica** en la cuenta.

## Alcance de esta entrega

| Aplicación | Incluido |
|---|---|
| CAD Windows | Puntos y curvas Bézier, deshacer/rehacer, medidas, transformaciones, margen de costura por pieza y uniones por esquina, marcas, archivos `.patron`, recuperación, preparaciones A4/Carta/gran formato, PDF validado y publicación manual. |
| Portal web | Registro, verificación, acceso y recuperación de cuenta; consulta de proyectos/versiones/vistas previas, descarga de editables/PDF y gestión de recursos propios. |
| PWA | Consulta y gestión del portal adaptadas al teléfono; manifiesto, iconos y funcionamiento previsto como aplicación instalable. No incluye edición geométrica. |

**Aplazados:** escalado de tallas, colaboración e invitaciones, publicación automática y notificaciones de colaboración. También se aplazan importaciones externas, macOS/Linux y distribución móvil en tiendas. Los correos de verificación y recuperación sí están incluidos.

## Estado y limitaciones

CAD **0.1.7**, implementación base [`8a93c4e`](https://github.com/MAKEBUZ/SPEC-PROYECTO/commit/8a93c4ed6a1d021da2d98a33945fa2d4a1f3a898). **90 de 98 tareas completas; aceptación integral pendiente.** Los resultados no convierten automáticamente cada requisito en cumplido.

- Verificado localmente: Windows x64, recorridos automatizados con Electron/Edge y PostgreSQL; recorridos manuales de versiones anteriores comunicados por el usuario. La última interfaz 0.1.7 conserva aceptación manual pendiente.
- Plataformas previstas: Windows 11 x64; Chrome/Edge estable actual y anterior; Android 12+ con Chrome; iOS 17+ con Safari, incluida PWA desde su icono. No se afirma que toda esa matriz esté ensayada.
- Pendientes: teléfonos físicos/PWA, USB y fallos reales del medio, impresión y medición física, instalador en equipo limpio, navegadores anteriores y rendimiento en equipo de referencia de 4 núcleos/16 GB/SSD y equipos inferiores.
- PDF: piezas seleccionadas válidas, metadatos requeridos y separación mínima de 2 mm; máximo 100 piezas, 250 páginas A4/Carta y composición de 10 × 10 m. Guardar antes de exportar; cancelar o fallar el guardado impide el PDF. Los borradores inválidos pueden guardarse.
- La demo local usa datos sintéticos y un puente de transporte de ensayo. No acredita TLS desplegado, SES/S3 ni instalación física de PWA. El piloto AWS no es un servicio público permanente ni un requisito para esta demo.
- La descarga limpia de Electron está pendiente de una red que alcance su origen oficial; se registró un timeout. No se presenta el arranque sobre dependencias previamente instaladas como instalación completamente limpia.

Véanse el [informe de pruebas](docs/validation/delivery-report.md), la [matriz por requisito](docs/validation/acceptance-matrix.md) y las [ocho tareas pendientes](docs/validation/remaining-eight.md).

## Tecnologías y estructura

Electron proporciona el escritorio y acceso controlado a archivos; React compone las pantallas; Three.js representa el tablero, sin ser la fuente de verdad geométrica. Next.js sirve el portal/PWA. NestJS implementa la API y PostgreSQL mantiene cuentas, versiones y operaciones transaccionales. El núcleo geométrico está en TypeScript; el guardado Windows incluye un adaptador C++.

| Carpeta | Contenido |
|---|---|
| `apps/desktop`, `apps/web`, `apps/api` | CAD, portal/PWA y API. |
| `packages` | Modelo documental, geometría, impresión, contratos y componentes compartidos. |
| `specs/001-patronaje` | Spec, plan, tareas, contratos y decisiones aprobadas. |
| `tests` | Unitarias, geometría, integración, recuperación, impresión y E2E. |
| `docs` | Guía de usuario, operación y evidencias de validación. |
| `tools` | Preparación de recursos, demo y arneses de compilación/pruebas. |
| `infra/aws` | Operación del piloto; no ejecutar para la demo local. |

## Requisitos previos

**Para usar el instalador:** Windows 11 x64; no requiere Node, Docker ni compilador. El primer acceso requiere una cuenta verificada y servidor disponible. Después se permite trabajo local conforme a las reglas de sesión. El instalador no está versionado en Git ni se promete una descarga pública: solicítelo al responsable o genérelo con el procedimiento de [Windows](docs/validation/windows.md).

**Para desarrollar y ejecutar la demo completa en Windows:**

- Git, PowerShell, **Node 24.22.3** y **npm 12.2.2**, fijados en `package.json`/lockfile.
- Microsoft C++ Build Tools con carga «Desarrollo para el escritorio con C++», Windows SDK y Python compatible con node-gyp.
- Docker Desktop con motor Linux iniciado; el arnés crea PostgreSQL **18.7** aislado. No necesita una cuenta AWS.
- Microsoft Edge instalado y sesión gráfica disponible para Electron/E2E.
- Internet para instalar dependencias y descargar activos fijados. No desactivar verificaciones TLS ni de hashes para resolver un fallo de descarga.

## Instalación y configuración

Desde PowerShell, con Node/npm en `PATH`:

```powershell
git clone --branch codex/documentacion-entrega https://github.com/MAKEBUZ/SPEC-PROYECTO.git
cd SPEC-PROYECTO
node --version
npm --version
npm ci --ignore-scripts --no-audit --no-fund
Copy-Item .env.example .env
npm run assets:prepare
node node_modules/electron/install.js
node tools/validation/build-native.mjs
npm run build:desktop
$env:NEXT_TELEMETRY_DISABLED='1'
node node_modules/next/dist/bin/next build apps/web --webpack
npm run password-index:build
```

El bloque obtiene la rama de esta entrega documental, disponible en el [PR #1](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/1). Su destino de integración es `patronaje`; el PR aún no está fusionado. Los resultados reales por comando, incluido el bloqueo de Electron, están en el [informe](docs/validation/delivery-report.md).

`--ignore-scripts` no instala el ejecutable de Electron ni compila el adaptador: por eso los pasos están explícitos. `assets:prepare` verifica fuente, licencia, corpus y WASM por hash; `password-index:build` construye el índice completo. No copiar `.local` de otra persona como sustituto de estos pasos.

`.env.example` contiene ejemplos, **no credenciales válidas**. `.env` está ignorado por Git. Copiarlo no configura automáticamente la API: los comandos no cargan ese archivo implícitamente. La demo genera credenciales efímeras, claves y rutas propias y **no consume `DATABASE_URL` ni credenciales AWS de `.env`**. La composición de producción es distinta; ver [entorno local](docs/local-environment.md).

## Ejecución paso a paso

Tras completar la preparación:

```powershell
node tools/demo/start.mjs
```

Este único comando prepara PostgreSQL y migraciones, inicia la API NestJS en un puerto libre de `127.0.0.1`, sirve el portal en el puerto local 4328 y abre una ventana Edge aislada y el CAD. La consola muestra `DEMO_READY` y el directorio `.local/demo/<id>`. **Usar esas ventanas**, no la aplicación instalada conectada al piloto.

Registrar un correo ficticio como `alumno@example.invalid`. La consola indica el archivo de correo capturado: abrirlo y copiar su enlace en la ventana Edge de la demo para verificar la cuenta. No se envía correo real. Iniciar sesión en CAD con la misma cuenta. Al terminar, guardar los editables/PDF que se quieran conservar y pulsar **Ctrl+C** en la consola: se retira la base efímera. Cada inicio crea una demo nueva; las cuentas y publicaciones de la sesión anterior no se recuperan. Los archivos que el usuario guardó permanecen.

Para comprobar solamente el arranque y cierre:

```powershell
node tools/demo/start.mjs --smoke
```

No existen scripts raíz `dev:api`, `dev:web` o `dev:desktop`. Para abrir únicamente el portal construido, sin conexión a una API, existe `node node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port 3000`; eso **no** sustituye la demo integrada ni acredita autenticación. La API de `dist/apps/api/src/runtime/main.js` corresponde al piloto AWS: no usarla para esta demostración local.

## Uso y demostración

El recorrido completo está en [demo reproducible](docs/demo.md): crear un contorno cerrado → completar metadatos → guardar → preparar impresión → generar PDF → publicar → consultar y descargar → provocar y corregir un error de producción. Incluye resultados esperados y evidencias que conservar. La [guía de usuario](docs/user-guide.md) desarrolla las operaciones.

## Pruebas y resultados

Después de preparar recursos y compilar:

```powershell
npm run check
npm run test:unit
node node_modules/vitest/vitest.mjs run tests/unit tests/geometry tests/recovery tests/print tests/contracts --maxWorkers=1
npm run test:integration:local
node tools/validation/postgres.mjs --e2e tests/e2e/first-release.spec.ts tests/e2e/account.spec.ts tests/e2e/pwa.spec.ts
```

El arnés PostgreSQL crea y elimina su propio contenedor, sin usar la base indicada en `.env`. Las pruebas Electron requieren entorno gráfico y adaptador Windows; las E2E web necesitan el build Next. No ejecutar `npm test` indiscriminadamente como si todas las suites fueran puras: algunas necesitan infraestructura local, activos o dispositivos.

Resultado actualizado: **700/700** pruebas locales (incluidas **342 unitarias**), TypeScript correcto y **14/14** E2E de cuenta/PWA/recorrido integral en una ejecución separada. En copia limpia pasaron tipos, 342 unitarias y 162 pruebas de integración. No sumar ejecuciones históricas que se solapan. El [informe consolidado](docs/validation/delivery-report.md) identifica revisión, fechas, comandos, fallos y límites; la [evidencia JSON](docs/validation/delivery-tests.json) permite revisar los casos ejecutados. Ningún test automatizado sustituye USB, teléfono o impresión física.

## Documentación SDD y decisiones

- [Constitución](.specify/memory/constitution.md).
- [Spec aprobada y alcance](specs/001-patronaje/spec.md).
- [Plan técnico](specs/001-patronaje/plan.md) y [matriz de runtimes](specs/001-patronaje/runtime-matrix.md).
- [Tareas](specs/001-patronaje/tasks.md), [trazabilidad prevista](specs/001-patronaje/coverage.md) y [aceptación ejecutada](docs/validation/acceptance-matrix.md).
- [Guía de validación](specs/001-patronaje/quickstart.md) y [comandos](tools/validation/commands.md).

Las decisiones históricas de módulos aplazados se conservan, identificadas como tales. «Aprobada» describe la especificación, no una aceptación final del software.

## Autoría y evidencia de trabajo

**Diego Alejandro Ocampo Madroñero / MAKEBUZ**: titular del repositorio, decisiones de producto y comprobaciones manuales comunicadas durante el desarrollo. El nombre consta en el historial Git. **Codex**: asistencia de IA en implementación, pruebas y documentación; se conserva la integración inicial con DeepSeek como antecedente. No se atribuyen integrantes, revisiones ni responsabilidades académicas no acreditadas.

Ramas: [`patronaje`](https://github.com/MAKEBUZ/SPEC-PROYECTO/tree/patronaje) contiene implementación; [`constitucion`](https://github.com/MAKEBUZ/SPEC-PROYECTO/tree/constitucion) conserva documentos sin código. El historial previo contiene una subida consolidada, no PR por cada tarea. Véase [evidencia Git y PR de esta revisión](docs/git-evidence.md).
