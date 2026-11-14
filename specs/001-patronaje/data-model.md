# Modelo de datos — primera entrega

Diseño lógico, sin migraciones ni código. IDs estables, no nombres/correos como identidad.

## Local

| Entidad | Campos y restricciones |
|---|---|
| Document | formatVersion, documentId, revisionId, units=mm, pieces, preparations; estructura válida, no necesita proyecto remoto |
| Piece | id, name, sizeLabel, cutQuantity, contour, seamWidth, grainline, fold; datos incompletos en borrador, FR-279 para producción |
| Point/Segment | id, coordenadas finitas, recta/Bézier, endpoints y handles; cierre explícito |
| Preparation | id, nombre único normalizado, selección, transforms, modalidad/papel/margen; referencias faltantes conservadas |
| LocalRevision | hash canónico del contenido editable, incluidas preparaciones, excluido el propio hash y metadatos de transporte |
| PdfArtifact | sha256, revisionId, preparationId/preparationHash, dimensiones y escala; origen inmutable |
| Recovery | documentId, snapshot, checksum, savedAt; incluye documentos nuevos, no sustituye guardado explícito |
| RemoteBinding | accountId, patternId, lastPublishedVersion; no autoriza acceso y no altera revisión editable |
| LocalOperation | operationId, accountId, requestHash, type, state, pause, retryLevel y deadline; oculto fuera de cuenta |

En esta entrega talla es etiqueta de pieza; variantes y reglas de escalado no se implementan.

## Servidor

| Entidad | Campos esenciales |
|---|---|
| Account | id, email normalizado, passwordHash, verifiedAt, status, deletionDeadline, usedBytes/reservedBytes |
| Session | id, accountId, tokenHash, startedAt, expiresAt absoluto, revokedAt, limitedAccess |
| OneUseToken | accountId, purpose, hash, issuedAt, expiresAt, consumedAt |
| Project | id, ownerId, name, status, trashedAt/expiresAt |
| Pattern | id, projectId, ownerId, latestVersionId, status, trashedAt/expiresAt |
| Version | id, patternId, ordinal, authorId, localRevisionId, publicationId, createdAt |
| StoredFile | id, versionId, role, privateKey, bytes, sha256, originMetadata |
| Publication | id, actorId, destination, expectedVersionId, manifestHash, state, reservedBytes |
| OperationResult | id, requesterId, historicalOwnerId, requestHash, type, outcome, resourceRefs |
| OutboxJob | id, kind, payloadRef, attempts, nextAttemptAt, state |

Version/StoredFile inmutables tras commit. Cuota incluye archivos de todas las versiones y papelera; deduplicación física no reduce por sí sola el cómputo lógico. Staging reserva cuota sin presentarse como versión. Eliminar staging no elimina archivos publicados.

## Estados

- Cuenta: pendiente verificación, activa, eliminación pendiente, eliminada; recuperar exige autenticación y no revive sesiones.
- Recurso: activo, papelera, eliminado; restauración no extiende plazo.
- Publicación: staging, validada, committed o rechazada/abandonada. Unknown describe percepción del cliente, no una versión parcial válida.
- Seguimiento: enviando, resultado desconocido, confirmado; cerrado por cuenta eliminada mantiene resultado separado y ocultación.
- Tiempo: waiting → querying → save_pending → persisted. Timeout solo querying; fallo escritura permanece save_pending con contador local separado.
- Daño: quarantined → recovered únicamente con copia y evidencia compatibles; ausencia de copia no inventa vencimiento.

## Invariantes transaccionales

Bloqueo de cuenta para cuota y de patrón para versión esperada. Revalidar sesión y estado de cuenta al commit, serializado con revocaciones. Guardar resultado de operación en la misma transacción de negocio. Clave repetida con igual petición devuelve resultado; otra petición con esa clave produce conflicto.
Copias antiguas no resucitan tombstones. Restauración operacional debe reaplicar eliminaciones definitivas antes de servir datos; respaldos de pruebas conservados 7 días conforme a decisión aprobada; producción requiere política posterior.

## Intervalos y fronteras de persistencia

TimeEvidence conserva nonce, serverReceivedAt, serverSentAt, monotonicSend/Receive, bootIdentity e intervalo derivado; persistedAt no reinicia el plazo de conservación. Un resultado en memoria no habilita limpieza. La comprobación y su resultado guardado deben conservarse de forma indivisible para evitar doble contabilización al recuperar intentos.

Publication conserva un commitOperationId separado del idempotency key de la carga. Version referencia publicationId de forma única; la transición a committed y el OperationResult se insertan en la misma transacción. Reservas de staging no deben convertirse en consumo definitivo dos veces.

## Uniones por esquina del margen — decisión aprobada

Persistir cornerJoins por identificador estable del vértice del contorno base, con valor round o miter. No usar índices ni vértices derivados de teselación. Una pieza puede combinar ambos tipos y mantiene un único ancho uniforme. Cambiar una unión modifica la revisión y participa en deshacer/rehacer; guardar/reabrir y PDF conservan la combinación. Las puntas esquinadas se conservan sin límite específico ni recorte automático, sujetas a las validaciones geométricas y límites existentes. Inicializar explícitamente como miter las esquinas nuevas o sin elección previa al aplicar margen; permitir cambiar cada una a round y conservar las elecciones existentes. El valor inicial se aplica al crear la configuración, no sobrescribe la configuración persistida.

**Puntas largas — decisión aprobada:** conservar la punta sin límite adicional si cumple las validaciones y tamaños existentes. Un MiterLimit con conversión automática a bisel/redondeado no cumple el contrato. El adaptador geométrico debe conservar la intersección válida o comunicar invalidez, sin reparación silenciosa. Esta elección no amplía los límites de pieza/composición ni suprime validaciones.

**Valor inicial de esquinas aprobado:** esquinadas, modificables individualmente a redondeadas, conservando las ya configuradas. Las decisiones funcionales sobre forma, ámbito y puntas quedan aclaradas. El algoritmo de uniones mixtas y su precisión están definidos en [geometry-print.md](contracts/geometry-print.md); su validación experimental queda para implementación.

## Campos, relaciones y validaciones complementarias

Convenciones: IDs UUID opacos; instantes de servidor UTC; SHA-256 codificado hexadecimal para contenido; bytes como entero de 64 bits en PostgreSQL y entero exacto validado en contratos. No aceptar NaN/Infinity ni IDs duplicados dentro del documento. No aceptar ownership/autoría/fechas autoritativas del cliente. Nombres visibles no vacíos al crear/renombrar proyectos; no introducir unicidad global no aprobada. displayName del perfil es opcional; no añadir cambio de correo por interpretar edición de perfil.

| Entidad | Identidad/relaciones y restricciones de persistencia |
|---|---|
| Account | email de acceso único entre cuentas existentes; identidad nunca reutilizada tras borrado. usedBytes/reservedBytes no negativos; verificación y estado controlan acceso. displayName opcional |
| Session | accountId obligatorio; secreto solo en hash; accessClass normal/verification/account_recovery; expiresAt inmutable desde startedAt, máximo 7 días |
| OneUseToken | id, accountId, purpose, hash, issuedAt, expiresAt, consumedAt, supersededAt; solo una emisión vigente por cuenta/propósito; sustituir y consumir serializados |
| Project | ownerId → Account; resourceRevision entero creciente para metadatos/estado. No cascade de borrado físico que omita papelera o registros mínimos |
| Pattern | projectId → Project y ownerId igual al propietario del proyecto; latestVersionId pertenece al mismo patrón; name, resourceRevision |
| Version | (patternId,ordinal) único; publicationId y commitOperationId únicos por sus claves de negocio; autor histórico distinto conceptualmente del propietario; immutable después de commit |
| StoredFile | versionId → Version; role, originalName, mediaType, bytes, sha256, documentId, localRevisionId; preview y PDF incluyen exportProfileId obligatorio; PDF añade preparationId/hash. privateKey nunca expuesta como acceso público |
| Publication | actorId/destination; expectedVersionId nullable solo para patrón nuevo; manifest completo inmutable; commitOperationId único una vez solicitado; reservationBytes convertida a cuota una vez |
| PublicationFile | publicationId + fileId únicos; declaredBytes/hash/role, actualBytes/hash tras carga, privateStagingKey, uploadState, validationState; no aceptar contenido alternativo bajo misma identidad |
| OperationResult | clave (requesterId,operationType,operationId), requestHash o HMAC para entrada sensible; pending/resolved, outcome y confirmedAt si terminal; requesterId/historicalOwnerId pueden quedar anonimizados según eliminación; datos mínimos sin archivos |
| TrashBatch | causeOperationId único; rootKind/rootId, confirmedAt, expiresAt, memberIds capturados al commit; no incorpora hijos ya eliminados por separado |
| PurgeJob | operationId, scopeHash, memberIds, objectKeys pendientes y completadas, authorizedAt, state; ejecución idempotente; éxito solo cuando el conjunto físico/metadata se completó |
| OutboxJob | kind, deduplicationKey único, payloadRef, state, attempts, nextAttemptAt; el correo no se envía antes de confirmar emisión en base. Token en payload de entrega protegido/cifrado, nunca logs ni respuesta de consulta |

Secreto de correo: el verificador de token en base es hash; la entrega necesita transitoriamente el token original en el mensaje. El payload de outbox se cifra con clave de servicio y acceso exclusivo del emisor; borrar ese payload después de entregar/invalidar según ejecución. La conservación mínima de operaciones no incluye el secreto ni el cuerpo del mensaje. Reintentar emisión no vuelve a enviar un token sustituido.

## Transiciones que fijan el alcance de recuperación

- Project activo → papelera crea TrashBatch con patrones activos; marca el conjunto con el mismo causeOperationId y plazo. Hijos ya en papelera mantienen su batch independiente. Restaurar el proyecto procesa únicamente su batch aún vigente; no restaura otro batch por pertenencia al mismo projectId.
- Pattern en papelera independiente → activo requiere Project activo y plazo propio vigente. Un intento bloqueado no cambia resourceRevision, vencimientos ni contenido.
- Papelera → purging conserva el scope confirmado e impide recuperación; eliminar blobs es idempotente, resultado no exitoso hasta completar. purging no es una papelera nueva ni reinicia el plazo. Al terminar queda solo evidencia mínima permitida y tombstone operativo necesario para recuperación de backups.
- Account activa → deletion_pending fija 30 días, invalida sesiones y hace inaccesible su contenido normal sin convertir todos los recursos en una nueva papelera. Sus recursos previamente en papelera conservan los plazos. Recuperar antes de expiresAt retira la suspensión de contenido activo y requiere login nuevo; no revive sesiones/permisos/recursos de papelera.
- Al alcanzar cualquier expiresAt, la recuperabilidad es falsa aunque el job de limpieza física aún no haya terminado. El servidor evalúa plazos al confirmar restauración, no según el momento de abrir la pantalla.
- Un resultado pending no es fracaso confirmado. La resolución se escribe junto con el cambio de negocio, salvo purga física multietapa, cuyo job conserva progreso y solo publica éxito al completar. Rechazos terminales se pueden reintentar como nuevos intentos vinculados, no reciclando una clave exitosa.

## Recuperación operacional sin resucitar eliminaciones

Para pruebas está aprobada la copia PostgreSQL diaria mientras EC2 esté encendido y antes de cada apagado planificado, conservada 7 días; si falla se cancela el apagado. Esto no define la política futura de producción. La copia de base no basta para restaurar por sí sola un conjunto de archivos privados.

Seleccionar un registro de supresión de recuperación en almacenamiento S3 separado de los dumps, con claves inmutables por evento y manifiesto de secuencia. Guarda únicamente referencias opacas de recursos/objetos y estados de supresión necesarios para no reactivar datos, sin nombres, correo, contenido ni resultado de operación de usuario. Es evidencia operacional distinta de OperationResult y no debe usarse para eludir su eliminación cuando desaparece la última cuenta autorizada. Protegerlo con permisos separados y cifrado; no exponerlo por API.

Protocolo de supresión: autorizar y fijar scope → escribir intención durable de supresión → confirmar estado no recuperable/job en base → eliminar objetos según el conjunto autorizado → escribir confirmación durable de supresión → finalizar resultado de purga. La intención no demuestra por sí sola éxito. Un fallo entre fronteras mantiene progreso reconciliable; ninguna restauración interpreta una intención incompleta como permiso para reactivar el recurso ni como borrado confirmado. Primero se resuelve contra la evidencia restante; si no es posible, el entorno restaurado permanece aislado. No se presenta una transacción distribuida ficticia entre S3 y PostgreSQL.

Cada BackupManifest registra backupId, esquema/versión de motor, capturedAt, dumpHash, dumpKey, lista de objetos referenciados con hashes y watermark del registro de supresión observado. Restaurar en aislamiento, validar dump y manifiesto, y aplicar todas las supresiones posteriores antes de servir tráfico. Objetos ya borrados por una eliminación confirmada no se exigen como archivos recuperables: sus entidades se eliminan del conjunto restaurado. Un objeto activo faltante o con hash erróneo impide declarar restauración completa. El almacenamiento S3 de archivos publicados se conserva independiente de la instancia; un dump no es copia de esos bytes.

Conservar la evidencia de supresión solo mientras exista algún backup recuperable que pueda precederla; eliminarla cuando no quede tal copia, incluidas copias de ensayos y temporales de restauración. No retener indefinidamente una identidad por este mecanismo ni ampliar los 7 días aprobados para dumps. Para confirmar eliminación de cuenta, descartar también resultados mínimos cuando corresponda; una copia de base restaurada se depura con la evidencia posterior antes de habilitar acceso. No restaurar por nombre/correo ni permitir que una cuenta nueva herede registros.

Esta elección reduce el riesgo de resurrección lógica pero no promete supervivencia a pérdida simultánea de todos los respaldos y del registro de supresión. Ante evidencia insuficiente se bloquea la reapertura del entorno, preservando datos disponibles para diagnóstico. La política de copias no garantiza recuperación de archivos S3 borrados fuera del protocolo (credenciales comprometidas, intervención manual o fallo operacional): se prueba y documenta por separado antes de producción, sin inventar una réplica adicional ni gasto no aprobado.

Ensayos de diseño exigidos: cortar el proceso en cada frontera de supresión; reintentar sin duplicar borrados; restaurar snapshot anterior a eliminación; restaurar con intención incompleta; comprobar ausencia de recursos ya eliminados y de resultados de última cuenta; confirmar que no se limpia evidencia antes del último backup que la necesita. No se ejecutaron pruebas en esta fase documental.

## Comprobación de eliminación U2

DeletionCheck: requestId opaco e inmutable, state pending/cancelled/deleted, confirmedAt y checkExpiresAt nulos hasta resultado terminal. Referencia interna a cuenta solo mientras exista y sea necesaria para autorizar emisión/confirmación; desvincular al eliminar definitivamente. No email, nombre, archivos ni historial. Una solicitud cancelada no se reutiliza.

DeletionCheckCredential: credentialId, requestId, secretHash, issuedAt. Cada dispositivo autorizado obtiene credencial propia; todas usan el mismo vencimiento terminal de su solicitud. La relación de credencial no prolonga la conservación. Al vencer checkExpiresAt retirar credenciales y evidencia de esa comprobación. Esta evidencia está separada de OperationResult y del registro operacional de supresión de backups.

Confirmar cancelled en la transacción de recuperación. Confirmar deleted únicamente después de purga definitiva completa; proteger su persistencia frente a interrupciones y duplicados con el job existente. No permitir cascada que borre esta evidencia antes de los 90 días aprobados ni conserve OperationResult indebidamente. Estados y acceso definidos en contracts/api.md. U2 cerrado documentalmente.
