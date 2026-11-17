# Eliminación y recuperación — evidencia local

## Alcance ejecutado

Validación en `patronaje`, sin servicios AWS ni despliegues. PostgreSQL 18.7 efímero, archivos privados de ensayo y diario externo local separado del esquema SQL. Los contenedores se retiran al terminar.

T088 integra `AccountPurgeContent` con la solicitud de eliminación y `AccountPurgeJobs` con el worker durable. Antes del vencimiento no se admite purga; al vencer se captura el contenido, incluidas versiones, PDF verificados y archivos de staging. El worker escribe la intención externa, sella el trabajo, borra objetos con progreso persistido y elimina metadatos, sesiones, tokens, correo pendiente y los resultados cuya última cuenta autorizada desaparece. Solo tras confirmar el diario externo se publica el estado limitado `deleted`. Una cuenta ausente por sí sola nunca confirma el resultado.

La credencial de consulta conserva los 90 días originales desde la confirmación. No permite consultar el perfil. Recuperar dentro del plazo produce `cancelled`, conserva los archivos y exige iniciar sesión de nuevo. Volver a registrar el mismo correo crea otra identidad sin recuperar contenido. La purga no accede a los documentos locales del CAD.

## Pruebas ejecutadas

- 25/25 integración: `account-purge`, `deletion-check`, `purge-api`, `purge-worker` y `trash`. Incluyen contenido publicado real con PDF, cuota, hijos independientes recuperables, sesión vencida tras escribir la intención, reintentos de cada frontera, restauración bloqueada tras aceptar purga, diario externo perdido y confirmación externa fallida después de retirar la cuenta.
- 47/47 locales: `deletion-check` de recuperación, sesión de cuenta, controlador y observador U2, historial cerrado, lifecycle y almacenamiento del historial. Incluyen frontera exacta de 90 días, rechazo de credencial vencida sin evidencia falsa de limpieza, respuestas tardías y consultas sin sesión normal.
- TypeScript y OpenAPI correctos.

SC-277: pruebas de purga de cuenta y lifecycle exigen confirmación explícita coincidente; un fallo o ausencia no limpia. SC-278: el guard rechaza exactamente en el vencimiento; las consultas no lo amplían. SC-279: recuperación entrega únicamente `cancelled` en la consulta limitada, sin sesión normal ni borrado local.

## Límites pendientes

La admisión automática por vencimiento está implementada y pasó la regresión dirigida de 7/7 pruebas de API de purga y cuenta: elimina lotes vencidos independientes, pero conserva proyectos con hijos independientes todavía recuperables y no cambia sus fechas.

T087 continúa abierta por reconciliación operativa de intenciones externas cuyo commit SQL no ocurrió y conservación/limpieza del diario según respaldos recuperables (T091/T092). Una intención incierta bloquea restaurar un respaldo; no se borra ni se interpreta como éxito.

## T089/T090 — pantallas y recorridos integrados

Portal `/trash` y panel «Proyectos y papelera de la cuenta» del CAD conectados al transporte autorizado y al seguimiento persistente. Consultan proyectos/patrones/papelera, muestran recursos, versiones, archivos, bytes, vencimientos y dependencias. Cada operación requiere confirmación explícita; purga advierte pérdida de recuperación. Si cambia el alcance, se retira la revisión y es necesario consultarla y confirmarla de nuevo. Restaurar proyecto revisa solo su lote original, sin incluir los patrones eliminados independientemente.

Cuatro E2E aprobados con Edge/Electron y API/PostgreSQL reales: envío/restauración/purga remota; respuesta de purga perdida y reapertura sin repetirla; patrón independiente desde CAD mediante IPC y credencial protegida; eliminación de cuenta confirmada en pantalla solo después de la purga real; rechazo y revisión nueva de alcance cambiado. Se comparan los editables locales antes/después. El primer ensayo CAD descubrió una ruta de consulta de patrones ausente de la lista permitida; se corrigió y la repetición pasó sin ampliar timeouts.

Regresión dirigida adicional: 11/11 integración de papelera/API/cliente de cuenta y 16/16 locales de límites de transporte, sesión y publicación; builds Next/desktop y OpenAPI correctos. No hay URLs arbitrarias ni credenciales remitidas al renderer.

T061 conserva pendiente la revisión transversal de todas las mutaciones y bloqueos; T026 conserva dispositivos físicos. Completar estos recorridos no equivale a aceptación completa de la entrega, ni verifica S3 o colaboración aplazada.

T087 cerrada localmente: reconciliación y compactación integradas, 498/498 pruebas locales y 162/162 de integración. Evidencia vigente en [suppression-reconciliation.md](suppression-reconciliation.md); los pendientes históricos de T087 anteriores quedan sustituidos por ese informe.
