# Contrato HTTP — primera entrega, /v1

Contrato de diseño documental; no controladores, servidor ejecutable ni esquema generado. La spec aprobada prevalece. Solo recursos propios: no se exponen colaboración, invitaciones, notificaciones ni publicación automática. La validación de artefactos se concreta en geometry-print.md; la autenticación en authentication.md.

## Convenciones y autorización

HTTPS y JSON UTF-8 salvo transferencias binarias. Instantes ISO 8601 UTC del servidor; tamaños enteros en bytes decimales. IDs opacos e inmutables; nombres y correos no son claves. Campos marcados «opcional» pueden omitirse; el resto de campos de entrada es obligatorio. Rechazar campos desconocidos y tipos incorrectos. No aceptar ownerId, authorId, fechas de servidor ni cuota calculada enviados por cliente.

Toda respuesta privada usa Cache-Control: no-store. Web/PWA usa cookie y CSRF; CAD, Bearer desde main. Autorizaciones: «normal» significa sesión válida de cuenta verificada activa; «verificación» solo permite confirmar/reenviar correo; «recuperación de cuenta» solo consultar plazo y cancelar la eliminación. La sesión no concede acceso a recursos de otras cuentas. Las consultas revalidan antes de enviar datos; las mutaciones revalidan dentro de la frontera de confirmación. Descargas ya iniciadas mantienen su regla propia.

### Resultado, errores e idempotencia

Respuesta de mutación de negocio: operationId, state (pending o resolved), outcome cuando resolved (success, failure o no_change), confirmedAt cuando resuelta y data del resultado permitido. 202 significa pendiente, nunca éxito de negocio. Una respuesta 200/201 con resolved/success requiere persistencia confirmada. Consultas devuelven el DTO indicado directamente. Error: code, message en español, traceId, fieldErrors opcional (campo/código), operationId opcional si se registró el intento. No incluir secretos ni contenido eliminado.

| HTTP | Códigos estables y efecto |
|---|---|
| 400 | INVALID_INPUT, PASSWORD_POLICY, TOKEN_INVALID, TOKEN_EXPIRED, FORMAT_UNSUPPORTED, ARTIFACT_MISMATCH; no confirmar el cambio |
| 401 | SESSION_REQUIRED, SESSION_EXPIRED, SESSION_REVOKED, REAUTHENTICATION_FAILED; conservar trabajo local |
| 403 | ACCESS_DENIED, ACCOUNT_LIMITED; no devolver contenido privado |
| 404 | RESOURCE_UNAVAILABLE, OPERATION_RESULT_UNAVAILABLE; no inferir borrado definitivo ni fracaso de operación |
| 409 | VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, RESOURCE_TRASHED, PARENT_TRASHED, RETENTION_EXPIRED, DEPENDENCIES_BLOCK, SCOPE_CHANGED, QUOTA_EXCEEDED, PUBLICATION_INCOMPLETE, OPERATION_PENDING |
| 413 | FILE_TOO_LARGE; rechazar conjunto, sin publicar parcialmente |
| 500 | INTERNAL_ERROR; resultado desconocido si no hay respuesta terminal confirmada; consultar antes de repetir |

Mutaciones reciben operationId único generado antes del envío y conservado localmente. La clave servidor es (actorId, operationType, operationId); solicitudes preautenticadas se vinculan internamente al destinatario o propósito cuando exista, sin exponer si la cuenta existe. El servidor calcula requestHash canónico, nunca confía en el del cliente. Para solicitudes que contienen contraseña/token, usar un HMAC servidor del contenido canónico con clave protegida y versionada, no un hash rápido de contraseña almacenado que habilite ataques offline; no conservar entrada en claro.

Una misma clave y contenido devuelve su estado/resultado sin repetir efectos ni reiniciar plazos. Una clave con contenido distinto devuelve IDEMPOTENCY_CONFLICT. Un rechazo confirmado es terminal para ese intento: «Reintentar» crea nuevo operationId y referencia opcional retryOf, solo tras confirmar el resultado anterior y con validación actual. Esto permite reintentar después de corregir permisos sin confundirlo con repetición de un commit ya exitoso. Fallo de transporte no habilita esa nueva operación. No usar la ausencia de una fila como prueba de no ejecución.

Los resultados de operaciones autenticadas se registran en la transacción de negocio. Nunca retornar credenciales antiguas al consultar un resultado. Solicitudes públicas de recuperación mantienen respuesta genérica; la consulta de su operación no es pública y no revela destinatarios. El acceso limitado de cuenta no se amplía para exponer historiales: los resultados asociados permanecen ocultos hasta recuperar el acceso normal; el plazo/estado de eliminación se consulta por su endpoint limitado.

## DTO de lectura

| DTO | Campos |
|---|---|
| AccountProfile | id, email, displayName opcional, verifiedAt nullable, status, usedBytes, reservedBytes, limitBytes=2000000000 |
| SessionView | id, accountId, accessClass (normal/verification/account_recovery), startedAt, expiresAt; secreto únicamente en la creación por canal de autenticación |
| ProjectView | id, name, ownerId, state, createdAt, updatedAt, resourceRevision; trashedAt/expiresAt nullable |
| PatternView | id, projectId, ownerId, name, state, latestVersionId nullable, resourceRevision; trashedAt/expiresAt nullable |
| VersionView | id, patternId, ordinal, authorId, createdAt, localRevisionId, files (FileView), commitOperationId |
| FileView | id, role (editable/preview/pdf), originalName saneado, mediaType, bytes, sha256, documentId, localRevisionId; exportProfileId obligatorio para preview y PDF; preparationId/preparationHash solo PDF |
| TrashView | kind, id, name, trashedAt, expiresAt, causeOperationId, parentProjectId opcional, independentFromProjectDeletion, recoverable; fechas no se reinician por lectura |
| OperationView | operationId, operationType, state, outcome/confirmedAt/code cuando resuelta; authorizedResourceRefs, actorLabel; no contenido de archivos ni correo de cuenta eliminada |

Listas: items y nextCursor nullable; consulta cursor opcional, limit opcional, tamaño de página por defecto 25, entre 1 y 100. Es paginación de transporte, no límite de recursos ni copia de las reglas del centro de notificaciones aplazado. Orden descendente (createdAt,id), cursor opaco vinculado a cuenta/filtro y sin duplicados en una respuesta. Cada página vuelve a autorizar; no promete snapshot global frente a cambios concurrentes.

## Cuenta

Concreción técnica T022: `GET /auth/csrf` prepara la protección CSRF con cabecera `X-Patron-Client: browser`, devuelve `{ token }` y cookie auxiliar HttpOnly, siempre no-store. No inicia sesión ni modifica recursos de negocio. Web/PWA obtiene este token antes de login y envía `X-CSRF-Token` en mutaciones con Origin exacto autorizado. Login rota el token, devuelve el nuevo en esa cabecera y entrega únicamente la cookie de sesión; CAD conserva su transporte Bearer. La ruta técnica figura en el registro compartido/OpenAPI y no añade funcionalidades de producto.

| Operación | Entrada | Acceso y resultado |
|---|---|---|
| POST /accounts | operationId, email, password; displayName opcional | Público; registra pendiente, devuelve 201 con accountId y estado pendiente; no habilita CAD ni sesión normal |
| POST /sessions | email, password, clientType (desktop/web/mobile) | Público; SessionView y transporte seguro de secreto; estado de cuenta determina clase limitada o normal. No cancela eliminación pendiente |
| DELETE /sessions/current | operationId | Credencial de la propia sesión; invalidación idempotente, incluso si ya venció; no habilita acceso a otros recursos |
| POST /sessions/revoke-all | operationId, confirmation=true | Normal; invalida todas incluida actual, devuelve resultado sin emitir sesión nueva |
| GET /account/profile | sin cuerpo | Normal; AccountProfile |
| PATCH /account/profile | operationId, displayName | Normal; cambia solo nombre de perfil. Cambio de correo no se incorpora sin especificar su verificación |
| POST /account/password | operationId, currentPassword, newPassword | Normal y reautenticación; valida política y confirma cambio. No aplica por analogía efectos de recuperación olvidada no especificados |
| POST /email-verification/request | operationId | Acceso de verificación; emite reemplazo único y devuelve issuedAt, expiresAt, deliveryState; emisión y entrega son estados distintos |
| POST /email-verification/confirm | operationId, token | Token de un uso; verifica y devuelve verified=true, loginRequired=true; no inicia sesión automática ni habilita trabajo offline por sí solo |
| POST /password-reset/request | operationId, email | Público; 202 con mensaje genérico indistinguible exista o no cuenta; sin token, accountId ni estado de entrega revelado |
| POST /password-reset/confirm | operationId, token, newPassword | Token vigente y plazo de cuenta si está pendiente de eliminación; cambia y consume atómicamente, invalida sesiones, devuelve loginRequired=true |

La política de contraseña y parámetros de seguridad se definen en authentication.md. Token de verificación 2 horas; recuperación 30 minutos. Solicitud nueva reemplaza al anterior; repetición del mismo operationId no genera otro enlace. Consumo concurrente solo tiene un efecto. GET de un enlace no cambia estado.

## Proyectos, patrones y archivos

| Operación | Entrada | Resultado y reglas |
|---|---|---|
| GET /projects | cursor/limit opcionales | ProjectView de proyectos activos propios |
| POST /projects | operationId, name | Nombre no vacío; 201 ProjectView, propiedad asignada por servidor |
| GET /projects/{id} | id | ProjectView autorizado y activo |
| PATCH /projects/{id} | operationId, name, expectedResourceRevision | Renombrar; 200 ProjectView. Conflicto de revisión no sobrescribe |
| GET /projects/{id}/patterns | cursor/limit opcionales | PatternView activos propios |
| GET /patterns/{id} | id | PatternView activo |
| GET /patterns/{id}/versions | cursor/limit opcionales | VersionView, historial inmutable |
| GET /versions/{id}/files | id | FileView; una versión sin PDF no inventa archivo de impresión |
| GET /files/{id}/content | id; Range opcional | Binario con Content-Length, Content-Type, Content-Disposition saneado, ETag/hash; cada solicitud/rango reautoriza |

Las vistas previas también usan rutas autorizadas. Los nombres de proyecto/patrón no se convierten en rutas de disco ni claves S3. Crear patrón remoto se realiza únicamente en el commit de primera publicación, no al guardar un documento local. Esta entrega no incorpora mover patrones entre proyectos ni editar geometría desde la web.

## Publicación completa e inmutable

Manifest: documentId, localRevisionId, files y manifestHash calculable. Cada archivo incluye fileId estable dentro del staging, role, originalName, mediaType, bytes, sha256; preview y PDF además exportProfileId obligatorio; PDF además preparationId y preparationHash. Exactamente un editable propio y una preview generada; cero o más PDF elegidos, todos de la misma revisión. No hay adjuntos arbitrarios. bytes por archivo hasta 100000000. La estructura global del editable debe ser válida; validación de producción solo para selección/preparación de cada PDF. Límites 100 piezas/250 páginas y precisión mantienen spec.

| Operación | Entrada | Resultado |
|---|---|---|
| POST /publications | operationId, projectId, manifest; patternId y expectedVersionId juntos si se actualiza; patternName para patrón nuevo | 201 publicationId, state=staging, manifestHash, files con uploadState; reserva cuota, no crea versión disponible |
| PUT /publications/{id}/files/{fileId} | Bytes del archivo declarado; Content-Length, checksum | 200 fileId, bytes, sha256, uploadState=received solo después de persistencia; repetición idéntica no duplica ni reserva doble |
| GET /publications/{id} | id | publicationId, state, manifestHash, files/uploadState, validationState, commitOperationId nullable; autorizado por propietario |
| POST /publications/{id}/commit | operationId distinto de creación de staging, manifestHash | 202 pendiente si validación en curso; 200 resolved/success con patternId, versionId, ordinal, committedAt y archivos solo al commit íntegro |
| POST /publications/{id}/abandon | operationId | Resultado idempotente; libera la reserva de staging o de un commit confirmado fallido, nunca de un commit pendiente/desconocido ni de una versión publicada. Materializa la operación de abandono ya definida, sin limpiar por antigüedad. |
| GET /operations/{operationId} | operationId; operationType | OperationView; autorización vigente y, si recurso eliminado, identidad histórica de solicitante/propietario |

Orden: validar manifiesto y cuota → recibir archivos privados → verificar contenido/artefactos → revalidar sesión/cuenta/proyecto/patrón/versión/cuota en transacción → Version, StoredFile, cabecera y OperationResult juntos. El blob debe ser durable antes del commit. Si falla un archivo, no omitirlo ni publicar el resto. Bloqueo por patrón/proyecto en papelera; recurso definitivamente eliminado solo permite otra primera publicación explícita, con nuevos IDs e historial.

La cuota de cuenta se evalúa con usedBytes + reservas de otros staging + total de este manifiesto. La reserva propia se convierte una sola vez en consumo al confirmar; versiones antiguas y papelera siguen consumiendo. QUOTA_EXCEEDED devuelve usedBytes, reservedBytes, requestedBytes, limitBytes únicamente al propietario. Añadir PDFs a una revisión ya publicada es otra versión completa. VERSION_CONFLICT devuelve expectedVersionId y currentVersionId autorizados; no fusiona ni cambia el archivo local. Un manifiesto nuevo requiere nuevo staging; no modificar archivos ya validados o publicados.

Abandonar staging solo libera temporales/reserva de esa publicación no confirmada. Nunca limpiar por supuesto abandono un commit en curso ni un resultado desconocido; comprobar primero su estado servidor. El perfil de comprobación de PDF/PNG se define en geometry-print.md, no se sustituye por comparar metadatos declarados.

## Papelera y confirmación de alcance

GET /trash lista TrashView propios con sus plazos; no permite descargar el contenido de papelera. Para evitar una confirmación obsoleta, GET /destructive-scope?kind=project|pattern|account&id=...&action=trash|purge|delete-account devuelve scopeRevision, recursos afectados autorizados, recuentos de versiones/archivos, bytes y bloqueos. scopeRevision es un hash opaco del conjunto/estado observado, no una credencial. Cada mutación vuelve a calcularlo; SCOPE_CHANGED pide revisar y confirmar de nuevo, sin efecto parcial.

| Operación | Entrada | Resultado |
|---|---|---|
| POST /projects/{id}/trash o /patterns/{id}/trash | operationId, scopeRevision, confirmation=true | Resuelto con kind/id, trashedAt, expiresAt y causeOperationId |
| POST /trash/{kind}/{id}/restore | operationId, expectedResourceRevision, confirmation=true | Resuelto con recurso activo y restoredResourceIds; bloquea si venció, padre en papelera o conjunto incompleto |
| DELETE /trash/{kind}/{id} | operationId, scopeRevision, confirmation=true, acknowledgePermanentLoss=true | Pendiente mientras se completa eliminación; éxito únicamente tras completar el alcance confirmado |

Un proyecto enviado a papelera incluye solo patrones activos en ese instante; registrar explícitamente el conjunto con causeOperationId. Patrones previamente en papelera mantienen sus propios plazos y no se restauran con el proyecto. Restauración conjunta conserva todas las versiones/archivos y concede acceso solo al propietario. Un patrón independiente exige padre activo. Eliminar definitivamente proyecto se bloquea si conserva hijos independientes recuperables; DEPENDENCIES_BLOCK incluye IDs/plazos autorizados. No ampliar plazos por error, reintento ni restauración de cuenta.

Eliminación definitiva puede requerir varias operaciones físicas: primero verificar autorización/alcance y registrar intención; retirar recuperación/acceso de ese conjunto al confirmar la intención; borrar blobs y metadatos correspondientes idempotentemente; finalizar resultado solo después de completar. Un fallo de purga no es éxito ni devuelve el recurso al acceso normal. La interfaz mantiene estado pendiente/error sin permitir una restauración ficticia parcial. La decisión de negocio autorizada se serializa antes del trabajo físico; una sesión revocada antes de esa frontera no permite iniciarlo. Ningún proceso de purga afecta contenido fuera del scope confirmado.

## Eliminación y recuperación de cuenta

GET /account/deletion: acceso limitado de recuperación, devuelve status, requestedAt, expiresAt y operationId de solicitud; no contenido privado normal. POST /account/deletion: sesión normal, operationId, currentPassword, phrase exactamente «ELIMINAR MI CUENTA», scopeRevision. Devuelve resultado confirmado y plazo 30 días; invalida sesiones, no devuelve sesión normal nueva. Repetición conserva el plazo.

POST /account/recovery: acceso limitado obtenido autenticándose con contraseña actual, operationId y confirmationText exactamente «Recuperar mi cuenta». Revalidar plazo en confirmación; resultado success con loginRequired=true, finalizar accesos limitados, no reactivar sesiones ni permisos. Los recursos ya en papelera conservan estado/plazos. Si hubo pérdida de respuesta, autenticarse de nuevo y consultar el estado permitido; no inferir recuperación por un error de login ni repetir sin comprobación. El restablecimiento de contraseña no cancela eliminación.

Al vencimiento, la cuenta deja de ser recuperable aunque el borrado físico tarde. La purga elimina contenido propio y registros mínimos cuando desaparece la última cuenta autorizada. No afecta documentos del CAD ni datos ajenos. Cuenta nueva con mismo correo recibe identidad nueva sin historia heredada.

## Resultados pendientes y evidencia

OperationView distingue pending de resolved, resultado histórico de estado actual del recurso. OPERATION_RESULT_UNAVAILABLE preserva desconocimiento; ACCESS_DENIED no se transforma en fracaso. Si existe Version.commitOperationId o evidencia transaccional de otra mutación, el endpoint puede resolver exclusivamente por vínculo inequívoco; igualdad de nombres/fechas no basta. El cliente no necesita acceder al objeto borrado para consultar el mínimo permitido por identidad histórica. Al borrar una cuenta se anonimiza su etiqueta; al borrar la última autorizada se elimina ese registro, no se crea una retención adicional.

Pausas, bloqueos y listas resueltas son estado local por cuenta/dispositivo conforme spec, no nuevas tablas de notificaciones. Reintentos automáticos son solo de consulta; primera entrega publica manualmente. Una respuesta terminal perdida no permite repetir el commit.

## Tiempo

GET /time?nonce=... es público, no revela datos de cuenta y devuelve nonce, responseId, serverReceivedAt, serverSentAt. No-Store. Cliente mide ida/vuelta monotónica y guarda intervalo de incertidumbre; solo determina vencimiento si la cota inferior lo alcanza, o vigencia si la superior es anterior. Intervalo cruzado/incoherente conserva incertidumbre. El reloj civil no sustituye continuidad entre reinicios. Timeout de 30 segundos cubre consulta y validación de respuesta; guardar la evidencia es una fase separada, sin declarar comprobación completada hasta persistir.

## Verificación del contrato

Probar pares de solicitudes concurrentes por operationId, versión y cuota; revocación antes/después de la confirmación; respuestas perdidas; conjunto de eliminación cambiado; padre en papelera; tokens consumidos/reemplazados; transferencia parcial y reanudación; límites inclusivos exactos. Este documento no afirma que las pruebas se hayan ejecutado. La generación de OpenAPI será una representación de este contrato durante implementación, no un aplazamiento de sus decisiones a tasks.md.

## U2 — comprobación limitada de solicitud

Diseño cerrado según FR-286–292; ninguna implementación. La credencial autentica una capacidad limitada, no es una sesión de cuenta. El servidor autoriza cada consulta exclusivamente contra su solicitud. No equivale a una API pública de búsqueda por correo o cuenta.

| Operación | Autorización / contrato |
|---|---|
| POST /account/deletion | Conserva contrato existente y entrega al dispositivo credencial limitada de la solicitud confirmada; no emitirla antes del commit |
| POST /account/deletion/credentials | Acceso limitado autenticado durante recuperación, operationId; emite credencial propia vinculada a esa solicitud, sin cambiar plazos ni recuperar la cuenta |
| GET /deletion-status/{requestId} | Solo credencial limitada de esa solicitud; No-Store; devuelve requestId, state, confirmedAt y checkExpiresAt cuando terminal; sin nombres, correo, contenido ni historial |

Estados: pending (solicitud aún sin resultado terminal), cancelled (recuperación confirmada), deleted (eliminación definitiva completada). Un trabajo de purga inconcluso sigue sin resultado deleted. cancelled se muestra como «Solicitud cancelada». Los dos estados terminales son inmutables para esa identidad; una nueva eliminación usa otra solicitud. checkExpiresAt = confirmedAt + 90 días para cada resultado terminal; no se actualiza por consultas o nuevas credenciales. Durante recuperación solo se emiten credenciales con autenticación y comprobación transaccional del plazo. No emitirlas tras eliminación definitiva. Si falla la entrega de la credencial, reautenticar dentro del plazo para obtener otra: no repetir la eliminación ni inferir su fracaso.

Al vencer, deshabilitar consulta y retirar evidencia/credenciales de esa comprobación; HTTP 401/404, una credencial inválida o resultado no disponible no prueban eliminación. No conservar por esta vía OperationResult de la última cuenta. Solo deleted autenticado, vinculado inequívocamente a la solicitud/cuenta local original y persistido correctamente activa FR-140/228; cancelled nunca lo hace. No mostrar historiales ocultos o detalles a otra cuenta. El CAD conserva sus documentos.

Plan de consulta técnico: reutilizar el planificador existente, con estado y contador separados de la comprobación temporal FR-242. Timeout de consulta 30 segundos; esperas 5, 10, 20, 40, 80 y luego 120 segundos tras fallos temporales. Una consulta en curso por solicitud; «Comprobar ahora» solicita consulta inmediata cuando no hay una activa, sin encolar duplicados. Aplicación cerrada/sin conexión no consulta. Un éxito termina los reintentos de fallo; pending no es error ni prueba de eliminación y se vuelve a consultar por los disparadores aprobados. No renovar credenciales/plazos automáticamente. Error de autorización o evidencia no disponible no se trata como fallo temporal que deba repetirse indefinidamente. No guardar secretos en URL, parámetros de consulta, logs ni OperationResult. Estas son elecciones técnicas, no nuevos plazos funcionales.

Detalle de reconciliación de publicación (implementación 2026-11-16): OperationView.authorizedResourceRefs incluye kind=publication e id=publicationId para beginPublication confirmado, además de las referencias existentes de proyecto/patrón/versión. La consulta conserva autorización histórica y no expone claves de almacenamiento ni contenido. Permite recuperar un inicio cuya respuesta se perdió sin reenviar la mutación.
