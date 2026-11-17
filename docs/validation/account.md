# US1 — pruebas iniciales T016 y T017

Avance T023 (2026-11-15): acceso CAD main/IPC, persistencia Windows protegida y revocación offline implementados. 71 unitarias/contratos, 51 integraciones seleccionadas y prueba nativa Electron correctos. Detalles y límites en [desktop-account.md](desktop-account.md); ciclo de cuenta y UI siguen pendientes.

Avance T022 (2026-11-15): cookie segura y CSRF para web/PWA implementados. Suite integral: 71 correctas y los mismos 12 fallos por funciones pendientes; regresión seleccionada 50/50, unitarias/contratos 57/57. Detalle y alcance de los ensayos en [csrf.md](csrf.md).

Avance T021 (2026-11-15): host conectado a servicios reales, corpus completo y outbox. Sesiones/perfil/revocación implementados; suite integral actual: 63 correctas y 12 fallidas por ciclo de cuenta/proyectos pendientes. Detalle en [sessions.md](sessions.md); los recuentos anteriores se conservan como evidencia histórica.

Avance T020 (2026-11-15): outbox cifrado y composición HTTP con entrega capturada validados; 34 pruebas PostgreSQL pasan. Evidencia en [outbox.md](outbox.md). Sesiones y composición integral siguen pendientes.

Avance T019 (2026-11-14): registro/verificación/reset implementados y validados aisladamente contra AuthModule real. Véase [tokens.md](tokens.md): 16 casos propios, 10 regresiones PostgreSQL y límites de integración. El host integral de este documento sigue pendiente de composición de T020/T021 y ciclo de cuenta; US1 no está completa.

Fecha: 2026-11-14. Rama patronaje. Alcance: preparar y ejecutar escenarios antes de los servicios US1; sin AWS ni correo real.

## Estado

T016 y T017 completadas como tareas de escritura y primera ejecución de pruebas. T018–T026 pendientes. No hay autenticación funcional ni pantallas de cuenta listas. La suite de integración completa está intencionadamente en rojo; no se usaron skip, todo ni expectativas de fallo para simular éxito.

Los controladores US1 todavía no están registrados. Los casos fallan primero por /accounts u otra ruta ausente (404/RESOURCE_UNAVAILABLE); las aserciones posteriores de cada flujo aún no se alcanzan. Esta ejecución acredita detección de funcionalidad ausente, no aceptación de los requisitos.

## Escenarios preparados

- authentication.spec.ts: registro limitado y unicidad concurrente de correo; login correcto/incorrecto; hashes Argon2id sin contraseña en claro; verificación a dos horas, reemplazo e idempotencia de reenvío, consumo concurrente; reset genérico sin enumeración de cuentas; revocación de sesiones al completarlo; treinta minutos de vigencia; sustitución y consumo único; política de longitud/composición y rechazo sin consumir enlace; caso real del corpus que cumple las otras reglas; sesión de máximo siete días sin ampliación por actividad; cierre actual/todas; invalidación tardía sin revocar nueva sesión; perfil y carrera de revocación antes del commit.
- account-lifecycle.spec.ts: contraseña y frases exactas; alcance destructivo cambiado; plazo de treinta días; sesiones invalidadas y acceso limitado; repetición concurrente sin ampliar plazo; conservación de contenido y papelera previa; autenticación/consulta sin cancelar eliminación; vencimiento antes de confirmar recuperación; recuperación con nuevo login; reset dentro del plazo sin cancelar eliminación; rechazo de reset tras vencimiento de cuenta; solicitud idempotente de purga al vencer sin anticipar borrado físico.

Trazabilidad: FR-001–003, FR-107–115, aspectos servidor de FR-116–119, FR-125, FR-142–148 y FR-150–151. La habilitación y conservación del trabajo CAD sin conexión y la cola persistente de cierre se completarán en T023/T026. Las cláusulas exclusivas de colaboración siguen aplazadas; no se añaden invitaciones ni permisos compartidos a esta entrega.

## Entorno y adaptadores

El host usa Nest real en loopback y PostgreSQL 18.7 efímero mediante el ejecutor existente. No sustituye respuestas HTTP por éxitos ficticios ni implementa reglas de autenticación dentro de los dobles.

Pruebas futuras consumirán los servicios reales a través de la composición de aplicación. Los puntos de inyección de ensayo son PATRON_DATABASE (Pool real), PATRON_MAIL_TRANSPORT (CaptureMailTransport) y PATRON_CONTENT_REPOSITORY (almacén de recursos sintéticos). PATRON_OUTBOX_WORKER.dispatchPending y PATRON_ACCOUNT_LIFECYCLE_JOBS.runDue deben resolver trabajadores reales, no funciones simuladas. Esos proveedores se conectarán al desarrollar T019–T024; su ausencia no se oculta.

El adaptador HTTP CAD espera SessionView y la credencial solo en el encabezado Authorization de la respuesta de inicio; no cambia el DTO público ni permite obtener el secreto consultando operaciones. Se trata de una convención técnica de transporte para T021, bajo HTTPS fuera del ensayo loopback. Los mensajes capturados deben contener el enlace de uso único; los tests no fabrican tokens ni los extraen de hashes.

El repositorio de contenido conserva filas y solicitudes de purga, sin decidir plazos o permisos. Nunca afirma haber borrado archivos. El borrado físico y la confirmación de su finalización dependen de US8. Los cambios de tiempo se representan solo en filas sintéticas de la base efímera; no se cambia el reloj del dispositivo ni se desactivan restricciones de sesiones.

## Ejecución

Comandos con Node 24.22.3/npm 12.2.2 mediante tools/validation/toolchain.ps1:

- run check: comprobación estricta de tipos.
- run test:integration:local: fundamentos más escenarios US1, con salida no cero mientras falten los servicios.

Registro detallado local: .local/us1-red.log (ignorado por Git). Los contenedores de ensayo se retiran al terminar. No se enviaron mensajes a personas ni se crearon recursos AWS.

Siguiente tarea: T018, política de contraseña e índice del corpus; después T019/T020/T021 para que los escenarios de autenticación puedan avanzar más allá del registro. US1 no se declarará terminada hasta T026 y la integración de contenido requerida por US8.

Resultado de la ejecución final: TypeScript correcto; 33 escenarios US1 fallan por funcionalidad ausente y las 10 pruebas previas de PostgreSQL pasan. 43 casos ejecutados, ninguno omitido. La primera aserción fallida impide considerar verificadas las condiciones posteriores de cada escenario.

## Avance T018

Política de contraseña, Argon2id e índice completo implementados y validados; ver passwords.md. Los casos HTTP anteriores aún requieren T019–T024; no se declaran resueltos por probar el servicio aisladamente. Próximo paso: T019.

## Avance T024 — 2026-11-15

Ciclo servidor de eliminación y recuperación implementado. Evidencia y límites en [deletion.md](deletion.md). Integración completa: 89/90; persiste únicamente el caso previo de GET /projects ausente. Unitarias/contratos: 71/71. T025/T026 y la purga física de US8 siguen pendientes.


## Avance T025 — 2026-11-15

Pantallas web y CAD conectadas y validadas; véase [account-screens.md](account-screens.md). TypeScript, builds Next/Electron, Edge local y prueba nativa Windows correctos. 73/73 unitarias y contratos; 91/92 integración, con el único fallo previo de GET /projects. T026 conserva la aceptación integrada y la matriz real de dispositivos.


## T026 — ejecución local E2E, 2026-11-15

**Estado: validación local completada; aceptación final de T026/US1 pendiente.** No se marca la tarea como terminada mientras existan las dependencias enumeradas abajo. Los resultados RED históricos anteriores se conservan como historial, no como estado vigente.

### Evidencia vigente

| Comprobación | Resultado |
|---|---|
| TypeScript estricto y contratos OpenAPI | Correctos |
| Unitarias y contratos | 73/73 |
| Integración PostgreSQL completa | 91/92; un fallo previo sin ocultar |
| tests/e2e/account.spec.ts | 5/5, sin omisiones |
| CAD | Electron 45.3.2, renderer React, preload/IPC y almacén protegido Windows reales |
| Portal | Next.js compilado y Edge headless local |
| Móvil | Chromium/Edge con viewport 390 × 844, tacto y emulación móvil; no teléfono físico ni PWA instalada |

Los E2E no fabrican respuestas de negocio. Un puente de transporte conecta el navegador al host Nest real con PostgreSQL 18.7 efímero; conserva cookies y cabeceras CSRF emitidas por el servidor. La navegación usa el origen sintético autorizado https://patron.example.invalid y obtiene los archivos de Next desde loopback. Esto prueba semántica de cookies/Origin en navegador, no certificados TLS ni infraestructura pública. El correo se captura localmente desde el outbox real, sin enviar mensajes a personas.

El CAD de ensayo inyecta AccountSession con el almacén Windows real y un transporte HTTP estrictamente loopback. La composición de producción conserva HTTPS. La ventana permanece oculta; las pruebas interactúan con sus formularios reales. La única modificación de producto en T026 es permitir inyectar el servicio de cuenta al crear la ventana; no añade endpoints ni funciones de negocio.

### Escenarios cubiertos

1. Portal: registro por formulario, login limitado, reenvío, verificación, nuevo login, perfil, cambio de contraseña con contraseña actual, cierre, solicitud genérica de reset, confirmación y nuevo login. Cookie Secure/HttpOnly inaccesible a JavaScript.
2. La misma secuencia en viewport móvil, sin desbordamiento horizontal; las acciones remotas quedan deshabilitadas sin conexión.
3. Eliminación con revisión de alcance y frase explícita; login limitado; recuperación explícita; fin de sesión limitada; nuevo login obligatorio y comprobación U2 «Solicitud cancelada» sin sesión normal. La cookie limitada permanece protegida tras cerrar el acceso normal.
4. Electron: login y perfil por IPC/API reales; cierre sin conexión, habilitación CAD conservada y aviso de revocación pendiente. Un archivo local testigo conserva exactamente sus bytes. Al reconectar se revoca la sesión CAD y se conserva la sesión independiente usada para preparar la cuenta. El testigo no acredita edición/guardado de documentos, que corresponde a US3.
5. Expiración durante guardar perfil: la sesión entra válida, un trigger de ensayo retrasa la escritura y cruza el vencimiento; se rechaza y revierte el perfil. Una secuencia PostgreSQL independiente de rollback acredita que se entró realmente en la mutación. La UI muestra expiración y retira el perfil. Se retiran trigger, función y secuencia al finalizar.

La primera ejecución encontró una carrera del propio ensayo de correo: leía el outbox antes de la confirmación del reenvío. Se corrigió la sincronización esperando la respuesta visible, sin modificar reglas de producto. Las unitarias de archivos necesitan ejecutarse con permisos locales para renombrar temporales en Windows; la ejecución restringida dio EPERM y la ejecución autorizada pasó 73/73.

### Lo que impide marcar T026 completa

- Sigue fallando FR-001/107 de authentication.spec.ts: GET /projects no existe hasta T045 y devuelve RESOURCE_UNAVAILABLE; el escenario exige ACCOUNT_LIMITED para cuenta no verificada. No se añadió una ruta ficticia ni se debilitó la aserción.
- T068/T069 incorporan instalación PWA y validación en dispositivos físicos Android/iPhone y la matriz de navegadores aprobada. Una emulación móvil en Edge no satisface esas comprobaciones.
- La propia dependencia de T026 exige T088/T090 para cerrar la integración de eliminación definitiva con contenido real. La solicitud de purga y el estado mínimo U2 están probados; el borrado físico no se simula como completado.
- La consulta general de operaciones continúa en T051; estos E2E no declaran terminado el seguimiento completo de US3.

### Reproducción local

Compilar primero el portal y el CAD:

- .local/toolchain/node.exe node_modules/next/dist/bin/next build apps/web --webpack
- .local/toolchain/node.exe tools/validation/build-desktop.mjs
- .local/toolchain/node.exe tools/validation/postgres.mjs --e2e tests/e2e/account.spec.ts

Regresión: tools/validation/toolchain.ps1 run check; tools/validation/toolchain.ps1 exec -- vitest run tests/unit tests/contracts; .local/toolchain/node.exe tools/validation/postgres.mjs; tools/validation/toolchain.ps1 run contracts:check.

El ejecutor crea PostgreSQL temporal sin volúmenes del usuario y lo retira al finalizar. Los navegadores y el servidor Next de ensayo se cierran; los archivos testigo quedan en .local/account-e2e, ignorados por Git. Rama patronaje. Sin despliegues ni gastos AWS.
