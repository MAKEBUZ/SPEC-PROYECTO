# Tareas: PATRONAJE — primera entrega

> Estado vigente 2026-11-14: implementación local autorizada por el usuario, comenzando por fundamentos con speckit-implement. No autoriza despliegue ni gasto AWS. Las prohibiciones de implementación de registros anteriores describen aquella fase documental.


**Fecha:** 2026-11-14. **Rama:** patronaje. **Funcionalidad:** 001-patronaje.
**Estado:** implementación local iniciada por autorización explícita del usuario el 2026-11-14. Fundamentos en curso; no se autorizan gastos ni despliegues AWS. Evidencia y pendientes: `docs/validation/foundations.md`.

**Entradas:** [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [runtime-matrix.md](runtime-matrix.md), [quickstart.md](quickstart.md), [API](contracts/api.md), [autenticación](contracts/authentication.md), [documento local](contracts/local-document.md), [geometría/PDF](contracts/geometry-print.md), [AWS](aws-proposal.md) y constitución v1.0.2.

Las rutas siguientes son destinos relativos a la raíz del repositorio; se incorporan al ejecutar cada tarea. Las tareas se agrupan por los identificadores originales de historia. US4 y US7 están aplazadas. Tampoco se implementan publicación automática, centro de notificaciones, importaciones, adjuntos arbitrarios, macOS/Linux ni edición móvil. La talla sigue siendo una etiqueta de pieza. Las garantías transversales de seguimiento de operaciones sí están incluidas.

## Formato y ejecución futura

Cada casilla usa ID secuencial, [P] solo para trabajo independiente y [USn] para historia. Por defecto una tarea depende de las anteriores de su fase; las excepciones y dependencias entre historias se indican al final. [P] permite ejecutar juntas únicamente las tareas citadas en los ejemplos después de sus prerrequisitos; no autoriza agentes ni ejecución en esta sesión.

Los escenarios obligatorios de la spec (User Scenarios & Testing y Success Criteria) y quickstart justifican las tareas de prueba. Escribir los casos antes del componente y comprobar que detectan su ausencia/fallo; ejecutar de nuevo tras implementarlo. No marcar una tarea terminada por escribir un test que no se ha ejecutado. Un hito interno no reduce la entrega aprobada.

## Puerta documental previa

- [X] T001 Revisar la matriz individual `specs/001-patronaje/coverage.md` antes de implementar: tareas, escenarios y alcance parcial/aplazado; comprobar las decisiones U1/U2 registradas y su cobertura sin asumir implementación. Evidencia ejecutada permanece pendiente.

## Fase 1 — Preparación

- [X] T002 Preparar npm workspaces en `package.json` y `tsconfig.base.json` para apps/desktop, apps/web, apps/api y packages/geometry, document, print, contracts, siguiendo runtime-matrix.md, sin incorporar módulos aplazados.
- [ ] T003 Fijar dependencias directas y generar `package-lock.json` con la matriz aprobada; registrar licencias y hashes de fuentes/WASM/corpus en `docs/dependencies.md`; no introducir servicios ni actualizar versiones mayores silenciosamente.
- [X] T004 [P] Configurar comprobaciones y comandos de quickstart en `tools/validation/commands.md` y `tools/validation/run.mjs`, enlazándolos desde los manifiestos al integrar; distinguir unit/integration/e2e/recovery/print/performance y no necesitar AWS real.
- [X] T005 [P] Preparar configuración de ensayo y manejo de secretos en `.env.example` y `docs/local-environment.md` para PostgreSQL local, almacenamiento/correo de prueba y las tres aplicaciones; ningún secreto real ni recursos remotos.

## Fase 2 — Fundamentos compartidos

**Puerta:** completar esta fase antes de las historias; aquí se crean contratos e infraestructura, no se anticipan funciones aplazadas.

- [ ] T006 Definir validadores y DTO compartidos en `packages/contracts/src/http.ts` y `packages/contracts/src/ipc.ts` según los contratos: requestId, capacidades de main, success/cancelled/error, códigos estables, trazas sin secretos y entradas externas validadas.
- [X] T007 Definir esquema base del documento en `packages/document/src/schema.ts`: «formatVersion, documentId, revisionId, units=mm, pieces, preparations; estructura válida, no necesita proyecto remoto»; UUID opacos, «No aceptar NaN/Infinity ni IDs duplicados dentro del documento» (data-model.md); rechazar formato desconocido sin conversión.
- [ ] T008 Implementar revisión canónica en `packages/document/src/revision.ts`: «hash canónico del contenido editable, incluidas preparaciones, excluido el propio hash y metadatos de transporte»; JCS/SHA-256, rechazo de claves duplicadas/Unicode inválido y hash de bytes separado para cambios externos.
- [ ] T009 Preparar migraciones y transacciones node-postgres en `apps/api/src/db/migrate.ts` y `apps/api/src/db/transaction.ts`; consultas parametrizadas, una conexión por transacción, orden de bloqueo cuenta→sesión→recurso y rollback verificable.
- [ ] T010 Crear Account, Session y OneUseToken en `apps/api/src/db/migrations/001-identity.sql`: «email de acceso único entre cuentas existentes; identidad nunca reutilizada tras borrado», «usedBytes/reservedBytes no negativos», «displayName opcional»; «accountId obligatorio; secreto solo en hash; accessClass normal/verification/account_recovery; expiresAt inmutable desde startedAt, máximo 7 días»; «solo una emisión vigente por cuenta/propósito; sustituir y consumir serializados».
- [ ] T011 Implementar esquema y servicio idempotente en `apps/api/src/db/migrations/002-operations.sql` y `apps/api/src/operations/operation.service.ts`: clave (requesterId,operationType,operationId), HMAC para datos sensibles y resultado persistido con la mutación; depende de identidad y precede a registro, tokens, perfil, publicaciones y eliminaciones. Probar duplicados y conflictos en `tests/integration/idempotency.spec.ts`; FR-126–139.
- [X] T012 Preparar acceso privado a blobs y correo mediante interfaces en `apps/api/src/storage/blob-store.ts` y `apps/api/src/mail/mail-transport.ts`, con dobles locales; no rutas públicas permanentes ni envío a personas reales en pruebas.
- [ ] T013 Preparar shell Electron en `apps/desktop/src/main/index.ts` y `apps/desktop/src/preload/index.ts`: sandbox/contextIsolation, renderer sin Node, validación de origen y capacidades, sin rutas arbitrarias desde renderer.
- [ ] T014 Preparar base HTTP en `apps/api/src/http/bootstrap.ts`: errores de contracts/api.md, validación, autorización por clase de sesión, logs con traceId sin datos sensibles y límites de transporte compatibles con FR-284.
- [ ] T015 Comprobar fundamentos en `tests/contracts/foundation.spec.ts`: serialización estable, rechazo de entrada hostil, aislamiento IPC, rollback y respuestas de error; generar contratos OpenAPI desde los DTO sin cambiar la API aprobada en `docs/api/openapi.json`.

## Fase 3 — US1: Crear cuenta e iniciar sesión (P1)

**Objetivo:** identidad única en CAD/web/PWA, acceso inicial verificado, sesiones y recuperación/eliminación de cuenta. No incluye invitaciones ni notificaciones.
**Prueba independiente:** con transporte de correo local, registrar/verificar, iniciar sesión, restablecer contraseña, revocar sesiones y recuperar cuenta dentro de plazo; comprobar rechazo de acceso no autorizado y habilitación local posterior. La eliminación física del contenido se integra con US8 antes de declarar completa la historia.

- [ ] T016 [P] [US1] Escribir escenarios de autenticación y concurrencia en `tests/integration/authentication.spec.ts`, incluidos FR-001–003, FR-107–119, FR-125, token sustituido/consumido, sesión de 7 días y rechazo antes de verificar.
- [ ] T017 [P] [US1] Escribir escenarios de eliminación/recuperación de cuenta en `tests/integration/account-lifecycle.spec.ts` para FR-142–148 y FR-150–151: 30 días, contraseñas, frases exactas, papelera previa y nuevo login; usar repositorio de contenido de ensayo hasta integrar US8.
- [ ] T018 [US1] Implementar política de contraseña en `apps/api/src/auth/password.service.ts`: 12–128 puntos de código, categorías Unicode y corpus local versionado de authentication.md, Argon2id con parámetros aprobados, sin truncar/normalizar secreto, permitir pegado y sin caducidad periódica.
- [ ] T019 [US1] Implementar registro/verificación/reset en `apps/api/src/auth/tokens.service.ts` y `apps/api/src/auth/auth.controller.ts`: verificación 2 horas, reset 30 minutos, un uso, reemisión invalida anterior, GET no consume, reset invalida sesiones sin login automático.
- [ ] T020 [US1] Implementar OutboxJob en `apps/api/src/db/migrations/003-outbox.sql` y `apps/api/src/mail/outbox.worker.ts`: «deduplicationKey único», «el correo no se envía antes de confirmar emisión en base», «Token en payload de entrega protegido/cifrado, nunca logs ni respuesta de consulta»; borrar secreto tras entrega/invalidación y no reenviar tokens sustituidos.
- [ ] T021 [US1] Implementar sesiones, revocación y perfil en `apps/api/src/auth/session.service.ts` y `apps/api/src/account/profile.controller.ts`: secretos opacos de 32 bytes en hash, reautenticación de cambio de contraseña, plazos absolutos, comprobación al confirmar y cierre actual/todas con confirmación según API.
- [ ] T022 [US1] Integrar cookie segura y CSRF en `apps/web/src/auth/session.ts` y `apps/api/src/auth/csrf.guard.ts`; mismo origen, __Host-patron-session Secure/HttpOnly/SameSite=Lax, proteger login/logout y mutaciones, nunca guardar secreto en localStorage/service worker.
- [ ] T023 [US1] Implementar acceso CAD en `apps/desktop/src/main/account-session.ts`: safeStorage sin texto claro alternativo, primer login verificado habilita CAD; logout/expiración preservan trabajo local; logout offline conserva solo capacidad de revocación y exige conexión para cerrar todas. Distinguir la credencial limitada de eliminación: conservarla protegida tras logout según FR-290, sin mantener acceso normal; probar SC-281.
- [ ] T024 [US1] Implementar ciclo de cuenta en `apps/api/src/account/deletion.service.ts`: contraseña actual y «ELIMINAR MI CUENTA», plazo 30 días no renovable, acceso limitado, «Recuperar mi cuenta», nuevo login, restablecimiento no cancela plazo; solicitar purga idempotente de US8 al vencer. Añadir entrega de credencial protegida limitada al estado de la solicitud conforme a FR-286; comprobación tras eliminación definitiva durante 90 días desde su confirmación en servidor, sin renovación; al recuperarse la cuenta, permitir solo «Solicitud cancelada» durante 90 días desde la recuperación confirmada, sin renovación (FR-288). Implementar FR-289: emitir credencial propia a otro dispositivo autenticado durante recuperación, vinculada a la misma solicitud y sin ampliar plazos; comprobar SC-280. Materializar DeletionCheck/DeletionCheckCredential y endpoints de contracts/api.md en `apps/api/src/account/deletion-check.service.ts` y migración `apps/api/src/db/migrations/007-deletion-check.sql`; conservar 90 días desde cada resultado terminal, sin mantener contenido ni OperationResult eliminado. Esta migración se prepara aquí y se ejecuta en orden con el conjunto de migraciones disponible, sin exigir que US8 esté implementada para definirla.
- [ ] T025 [US1] Crear pantallas de cuenta en `apps/web/src/app/account/page.tsx` y `apps/desktop/src/renderer/account/account-panel.tsx`, incluidos perfil, verificación, reset, cierre y acceso limitado; asociar mutaciones al seguimiento de US3 sin reenvío automático. Integrar credencial de comprobación protegida también en web/PWA según contracts/authentication.md, diferenciada de sesión y conservada tras logout; acción «Comprobar ahora» sin exponer contenido ni historiales.
- [ ] T026 [US1] Ejecutar y completar escenarios de US1 en `tests/e2e/account.spec.ts`; verificar tres clientes, estados sin conexión, rechazo por sesión vencida antes de commit y finalización de acceso limitado; registrar evidencia en `docs/validation/account.md`.

## Fase 4 — US2: Crear y editar un patrón en el CAD (P1)

**Objetivo:** dibujo editable y medidas reales, sin variante de talla ni proyecto remoto obligatorio.
**Prueba independiente:** crear rectas/Bézier, cerrar explícitamente, transformar, ajustar margen mixto y datos, deshacer/rehacer; medir invariancia de dimensiones. Puede probarse con sesión verificada de ensayo y snapshots, sin publicación.

- [ ] T027 [P] [US2] Crear fixtures analíticos de geometría en `tests/geometry/predicates.spec.ts`: segmentos constantes frente a curvas cerradas no constantes, área nula/positiva pequeña, cruces, contactos, solapes y tangencias; FR-035–046 sin mínimo añadido.
- [ ] T028 [P] [US2] Crear escenarios de editor en `tests/e2e/cad-edit.spec.ts`: FR-005–007 y FR-023–026, cuadrícula, extremos, medidas numéricas, transformaciones, marcas y undo/redo.
- [ ] T029 [US2] Implementar Point/Segment/Piece en `packages/geometry/src/model.ts` y `packages/document/src/piece.ts`: «id, coordenadas finitas, recta/Bézier, endpoints y handles; cierre explícito» y «datos incompletos en borrador, FR-279 para producción»; cornerJoins por ID estable con round/miter, nuevos miter, preservar existentes.
- [ ] T030 [US2] Implementar intervalos, racionales BigInt y predicados filtrados en `packages/geometry/src/numeric.ts`; no decidir topología por tolerancia fija ni confundir fallo técnico con geometría inválida.
- [ ] T031 [US2] Implementar cierre, longitud constante, área y cajas conservadoras en `packages/geometry/src/contour-validation.ts`, usando integración algebraica y conectividad; FR-035, FR-042–046, BR-004–005.
- [ ] T032 [US2] Implementar intersecciones Bézier en `packages/geometry/src/intersections.ts` y aislamiento de raíces/eliminación polinómica en `packages/geometry/src/polynomials.ts`; cubrir autocruces, raíces múltiples y componentes coincidentes sin reparación silenciosa.
- [ ] T033 [US2] Implementar margen por tramo y esquina en `packages/geometry/src/offset.ts` y `packages/geometry/src/joins.ts`: ancho finito no negativo uniforme, d=0, convexas round/miter y cóncavas, sin MiterLimit ni truncamiento; validar resultado y conservar ancho/configuración inválidos en borrador.
- [ ] T034 [US2] Implementar aproximación acotada y dimensiones en `packages/geometry/src/bounds.ts`: cota offset 0,01 mm refinable, topología conservada, límites 5000 mm incluidos márgenes y puntas; valores excedidos identificados, sin imponer mínimo positivo.
- [ ] T035 [US2] Implementar comandos reversibles en `packages/document/src/commands.ts`: puntos/tiradores, cierre, mover/eliminar/duplicar/rotar/reflejar piezas y márgenes/marcas; IDs nuevos en duplicado, confirmación destructiva y dimensiones conservadas.
- [ ] T036 [US2] Implementar escena derivada y herramientas en `apps/desktop/src/renderer/cad/canvas.tsx` y `apps/desktop/src/renderer/cad/tools.ts`: Three.js no es fuente de verdad, cuadrícula configurable, snapping opcional, coordenadas/desplazamientos y cambio de unidad sin cambiar mm.
- [ ] T037 [US2] Implementar propiedades y errores por pieza en `apps/desktop/src/renderer/cad/piece-panel.tsx`: nombre, talla, cantidad, línea de hilo y doblez; elección por esquina; mostrar cruces/contactos/margen inválido sin bloquear edición o borrador estructuralmente válido.
- [ ] T038 [US2] Ejecutar pruebas geométricas y de edición con fixtures en `tests/geometry/offset.spec.ts` y documentar resultados en `docs/validation/geometry.md`; cubrir precisión en todo intervalo, puntas largas y detalles pequeños, sin reducir alcance para superar pruebas.

## Fase 5 — US3: Guardar y publicar versiones (P1)

**Objetivo:** archivos locales recuperables y publicación manual íntegra con seguimiento durable de resultado desconocido.
**Prueba independiente:** guardar/reabrir sin red, inyectar fallo y cambio externo, recuperar documento nuevo; publicar editable+preview sin PDF y perder respuesta de commit sin duplicar versión. Los PDF opcionales se integran tras US6. Publicación básica no depende de generar PDF.

- [ ] T039 [P] [US3] Escribir pruebas de persistencia en `tests/recovery/document-save.spec.ts`: FR-011, FR-277–281, desconexión USB, disco lleno, reemplazo interrumpido, cambio externo, recuperación explícita y rechazo de formato sin alterar documento actual.
- [ ] T040 [P] [US3] Escribir pruebas de publicación en `tests/integration/publication.spec.ts`: FR-009–010, parte manual FR-020, FR-022, FR-120, FR-274–276, FR-284, BR-002–003/007–008; fallar cada frontera, competir por cuota/versión y perder respuestas.
- [ ] T041 [US3] Implementar escritor y adaptador Windows en `apps/desktop/src/main/documents/save.ts` y `apps/desktop/native/file-replace.cc`: temporal mismo volumen, flush/relectura/hash, copia previa independiente, intención persistida, ReplaceFileW y reconciliación por candidatos sin promesa de transacción multifichero.
- [ ] T042 [US3] Implementar apertura y conflicto externo en `apps/desktop/src/main/documents/open.ts` y `apps/desktop/src/renderer/documents/save-dialog.tsx`: solo .patron, formato dañado/futuro no modifica estado; cambio externo bloquea sobrescritura y ofrece otro archivo o cancelar, tampoco SaveAs sobre original permite eludir bloqueo.
- [ ] T043 [US3] Implementar aviso ante cambios sin guardar antes de cerrar documento, sustituirlo al abrir otro o cerrar normalmente el CAD en `apps/desktop/src/main/documents/leave-guard.ts`; probar en `tests/recovery/leave-editor.spec.ts` que cancelar conserva memoria/documento y un guardado fallido no permite continuar por la vía de guardar. Constitución §5 UI; distinguir cierre inesperado y recuperación, que no sustituyen el aviso.
- [ ] T044 [US3] Implementar Recovery en `apps/desktop/src/main/documents/recovery.ts`: «documentId, snapshot, checksum, savedAt; incluye documentos nuevos, no sustituye guardado explícito»; copia local independiente del USB con objetivo 60s, ofrecer recuperar/descartar, no sobrescribir ni publicar automáticamente.
- [ ] T045 [US3] Implementar Project/Pattern y sus rutas en `apps/api/src/db/migrations/004-projects.sql` y `apps/api/src/projects/projects.controller.ts`: «ownerId → Account; resourceRevision entero creciente para metadatos/estado», «projectId → Project y ownerId igual al propietario del proyecto; latestVersionId pertenece al mismo patrón»; nombres no vacíos, crear/listar/renombrar sin unicidad global añadida.
- [ ] T046 [US3] Implementar esquema de versiones y staging en `apps/api/src/db/migrations/005-publications.sql`: «(patternId,ordinal) único», «publicationId y commitOperationId únicos», «immutable después de commit»; StoredFile «versionId → Version» y «privateKey nunca expuesta como acceso público»; Publication «expectedVersionId nullable solo para patrón nuevo; manifest completo inmutable; commitOperationId único una vez solicitado; reservationBytes convertida a cuota una vez»; PublicationFile «publicationId + fileId únicos» y «no aceptar contenido alternativo bajo misma identidad».
- [ ] T047 [US3] Implementar staging/carga/cuota en `apps/api/src/publications/staging.service.ts`: un editable+preview y PDF opcionales misma revisión, validar bytes reales y tipos, 100000000 bytes/archivo y 2000000000/cuenta inclusivos con versiones/papelera y reservas concurrentes; limpiar solo staging confirmado abandonado, nunca commit desconocido.
- [ ] T048 [US3] Implementar perfil PNG reproducible en `packages/print/src/preview.ts` y `packages/print/src/profile.ts`: mismo resvg WASM y fuentes, sin sistema/red/azar/reloj, exportProfileId obligatorio para PNG/PDF, inmutable y hashes versionados, conservar capacidad de verificar perfiles emitidos.
- [ ] T049 [US3] Implementar verificador aislado en `apps/api/src/publications/artifact-worker.ts`: regenerar preview y comparar bytes propios; conectar verificación PDF de US6 cuando exista, nunca aceptar PDF solo por metadatos; una tarea intensiva a la vez en EC2, cola persistida y fallo preserva versión anterior.
- [ ] T050 [US3] Implementar commit y resultados en `apps/api/src/publications/commit.service.ts`: blobs durables antes de transacción, revalidar sesión/cuenta/propiedad/revisión/cuota, Version+StoredFile+cabecera+OperationResult juntos, ninguna versión parcial ni sustitución de anterior.
- [ ] T051 [US3] Implementar consulta de resultados en `apps/api/src/operations/operations.controller.ts` sobre T011: autorización histórica, evidencia inequívoca, anonimización y eliminación al desaparecer última cuenta autorizada; FR-126–139. El esquema y registro idempotente ya existen en fundamentos.
- [ ] T052 [US3] Implementar selección de proyecto y publicación manual en `apps/desktop/src/renderer/publication/publish-panel.tsx`: primera publicación elige/crea proyecto, editable guardado y preview obligatorios, PDF opcionales misma revisión, estados local/remoto distintos; RemoteBinding «accountId, patternId, lastPublishedVersion; no autoriza acceso y no altera revisión editable» solo se confirma al éxito.
- [ ] T053 [US3] Implementar conflictos en `apps/desktop/src/main/publication/conflicts.ts`: independiente nuevo o cargar remoto tras respaldo válido; si falla respaldo no reemplazar; remoto en papelera bloquea, eliminado definitivamente ofrece nuevo patrón explícito con identidad/historial nuevos; FR-022, FR-093–094, FR-141.
- [ ] T054 [US3] Implementar journal compartido en `packages/document/src/operations/journal.ts` y adaptadores `apps/desktop/src/main/operations/storage.ts`, `apps/web/src/operations/storage.ts`: LocalOperation «operationId, accountId, requestHash, type, state, pause, retryLevel y deadline; oculto fuera de cuenta»; generaciones verificadas, evidencia posterior prevalece, daño aísla sin inventar resultados.
- [ ] T055 [US3] Implementar consultas/bloqueos de pendientes en `packages/document/src/operations/pending.ts`: FR-126–135, persistir pausa, backoff, Comprobar ahora, sin permiso/no disponible suspenden consultas; bloquear repetición/cambios dependientes, conservar trabajo independiente y reintento manual solo tras fracaso confirmado.
- [ ] T056 [US3] Implementar Pendientes/Resueltas en `apps/desktop/src/renderer/operations/operations-panel.tsx` y `apps/web/src/components/operations-panel.tsx`: FR-217–226, 30 días desde confirmación local, limpieza confirmada incluso offline con sesión válida, ocultar detalles/cantidad tras logout y no repetir operación resuelta por fallo de consulta de estado actual.
- [ ] T057 [US3] Implementar cierre por eliminación de cuenta en `packages/document/src/operations/closed.ts`: FR-140, FR-227–229, FR-231–241; historiales ocultos durante eliminación pendiente, Resueltas borradas al confirmar definitiva, cerrados 30 días sin limpieza manual, respuestas tardías no extienden plazo ni reconstruyen historial.
- [ ] T058 [US3] Implementar evidencia temporal en `apps/api/src/time/time.controller.ts` y `packages/document/src/operations/time-evidence.ts`: nonce, No-Store, timestamps servidor e intervalo monotónico; no datos de cuenta ni sesión; incertidumbre no usa reloj civil ni incorpora respuestas tardías; FR-242–246.
- [ ] T059 [US3] Implementar ciclo de comprobación en `packages/document/src/operations/time-check.ts`: FR-247–266; consulta única, máximo 30s solo consulta/validación, esperas 5/10/20/40/80/120s persistidas, suspensión cuenta, interrupción contabilizada una sola vez y reinicio de secuencia solo al guardar éxito.
- [ ] T060 [US3] Implementar guardado/limpieza y avisos en `packages/document/src/operations/maintenance.ts`: FR-237–238 y FR-267–272; save_pending conserva resultado en memoria, escritura con backoff independiente sin conexión, no limpiar hasta persistir, recuperar solo copia válida compatible con evidencia posterior, avisos genéricos sin cuentas/detalles/cantidades.
- [ ] T061 [US3] Integrar lifecycle de aplicación/red/suspensión y respuestas tardías en `apps/desktop/src/main/operations/lifecycle.ts` y `apps/web/src/operations/lifecycle.ts`; distinguir cierre voluntario, fallo y reinicio, conservar espera/nivel, no doble fallo; enlazar todas las mutaciones incluidas al journal. Integrar FR-291/SC-282: comprobación limitada al abrir o reconectar con aplicación abierta y acción «Comprobar ahora», sin sesión normal y sin alterar plazos. Implementar FR-292: reintentos automáticos crecientes de la consulta limitada con conexión y aplicación abierta, contador separado y una consulta en curso; preservar «Comprobar ahora», sin repetir mutaciones ni ampliar plazos.
- [ ] T062 [US3] Probar modelo de estados con reloj controlado en `tests/recovery/operation-history.spec.ts`: pausas/logout, 30 días, incertidumbre, respuestas tardías, timeout vs escritura, cierres/suspensión, corrupción y borrado parcial; cubrir cada transición FR-126–141 y FR-217–272 aplicable, excluyendo filtro FR-230. Añadir pruebas U2 en `tests/recovery/deletion-check.spec.ts`: FR-286–292/SC-277–283, dos dispositivos, logout, cancelled/deleted, frontera de 90 días, credencial inválida, pérdida de respuesta y reintentos sin limpieza falsa.
- [ ] T063 [US3] Completar recorrido guardar→publicar y pérdida de respuesta en `tests/e2e/save-publish.spec.ts`; medir recuperación <=60s con cargas quickstart, reproducir PNG Windows/Linux y registrar evidencia en `docs/validation/persistence-publication.md`.

## Fase 6 — US5: Consultar y descargar desde web y móvil (P2)

**Objetivo:** acceso privado a versiones y archivos en portal y PWA instalada, sin CAD ni biblioteca offline.
**Prueba independiente:** con versiones sintéticas válidas, listar historial, abrir preview y descargar comparando hashes; sin PDF no ofrecer impresión. Probar PWA desde icono en Android/iPhone y descarga interrumpida.

- [ ] T064 [P] [US5] Escribir pruebas de consulta/descarga en `tests/integration/downloads.spec.ts`: FR-012–013, FR-018, FR-121/124, autorización antes de enviar, rangos/reintentos reautorizados y transferencia iniciada puede terminar tras invalidación.
- [ ] T065 [P] [US5] Escribir recorrido de PWA en `tests/e2e/pwa.spec.ts` y protocolo físico en `docs/validation/pwa-devices.md`: Android 12 o posterior con Chrome e iPhone iOS 17 o posterior con Safari aprobados, incluida PWA instalada desde su icono; instalación real, icono, cuenta, preview, descarga completa/incompleta y ausencia de caché privada tras logout; FR-283.
- [ ] T066 [US5] Implementar consultas privadas y descarga mediada en `apps/api/src/library/library.controller.ts` y `apps/api/src/files/download.controller.ts`: DTO/cursor de API, sin rutas S3 públicas, nombre saneado, bytes/hash/ETag, revalidación por solicitud/rango y antes de iniciar respuesta.
- [ ] T067 [US5] Implementar portal de proyectos/patrones/versiones en `apps/web/src/app/library/page.tsx` y `apps/web/src/components/version-files.tsx`: historial autor/fecha, preview privada, editable/PDF reales con escala/dimensiones, no presentar preview ni descarga parcial como lista para producción.
- [ ] T068 [US5] Implementar instalación y layout móvil en `apps/web/src/app/manifest.ts` y `apps/web/public/sw.js`: iconos/rutas instalables, shell sin caché de respuestas privadas/credenciales, compartir cuenta de US1 y operaciones de US3; no introducir edición ni acceso remoto offline.
- [ ] T069 [US5] Validar US5 en Chrome y Edge de computadora, versión estable actual y anterior, y en los dispositivos físicos de runtime-matrix.md y guardar evidencia en `docs/validation/library-pwa.md`, incluidos hashes de descarga y revocación durante transferencia; no declarar instalación móvil probada por una simulación de viewport.

## Fase 7 — US6: Exportar para producción (P2)

**Objetivo:** PDF local real 1:1, preparaciones persistidas y validación limitada a selección con estructura global válida.
**Prueba independiente:** guardar documento con pieza inválida no seleccionada, exportar selección válida y medir; seleccionarla debe bloquear sin impedir borrador. Cubrir mosaicos y gran formato, cancelación y límites exactos.

- [ ] T070 [P] [US6] Escribir aceptación de preparaciones en `tests/unit/preparations.spec.ts`: FR-031–034/036, FR-047–053, FR-057–061, nombres normalizados, duplicar/cancelar/eliminar/deshacer, faltantes y actualización geométrica sin recolocar.
- [ ] T071 [P] [US6] Escribir fixtures PDF en `tests/print/pdf-geometry.spec.ts`: FR-014–015, FR-027–030, FR-040–041, FR-054–056, FR-273/279/285; máximos inclusivos, pieza inválida no seleccionada y guardar cancelado/fallido.
- [ ] T072 [US6] Implementar Preparation en `packages/document/src/preparation.ts`: «id, nombre único normalizado, selección, transforms, modalidad/papel/margen; referencias faltantes conservadas»; nombre obligatorio único trim/sin mayúsculas, selección no vacía, sin variantes; duplicación con nombre nuevo, eliminación confirmada reversible solo sesión.
- [ ] T073 [US6] Implementar editor de preparación en `apps/desktop/src/renderer/print/preparation-panel.tsx`: mover/rotar sin alterar piezas, varias preparaciones con cambios en memoria persistidos al guardar, conservar ubicación y avisar cambios/faltantes, margen uniforme inicial 10mm para cuatro bordes.
- [ ] T074 [US6] Implementar validación de producción en `packages/print/src/validate.ts`: estructura completa válida; únicamente piezas seleccionadas con nombre/talla no vacíos, entero positivo y línea de hilo; doblez opcional; cierre/geometría/margen, 5000mm/pieza, 10000mm/composición, 1–100 piezas, separación >=2mm y sin solapes incluidos márgenes, sin reparar ni mínimo adicional.
- [ ] T075 [US6] Implementar paginado en `packages/print/src/layout.ts`: A4/Carta margen finito no negativo viable, solape 10mm, máximo 250 páginas contando prueba/instrucciones/montaje; gran formato añade franja inferior fuera del rectángulo de piezas sin reducir escala.
- [ ] T076 [US6] Implementar PDF vectorial en `packages/print/src/pdf.ts`: contorno base/exterior con estilos y leyenda, marcas/datos, filas/columnas/alineación/montaje, cuadrado 100mm e instrucciones 99,5–100,5mm; UserUnit/página grande, perfil reproducible sin metadatos aleatorios.
- [ ] T077 [US6] Implementar verificador independiente PDF.js en `packages/print/src/verify.ts`: operadores, matrices, clips/UserUnit y medición bidireccional <=0,1mm, sin código activo ni recursos externos; comprobar límites en trayectorias completas, no solo muestras de vértices.
- [ ] T078 [US6] Implementar exportación y cancelación en `apps/desktop/src/main/print/export-job.ts`: guardar antes, snapshot inmutable, progreso y bloqueo de preparación, Cancelando inmediato, objetivo cancelación <=5s y PDF completo validado guardado <=60s sin cancelar automáticamente al exceder; no presentar temporales como PDF final.
- [ ] T079 [US6] Persistir PdfArtifact en `packages/document/src/pdf-artifact.ts`: «sha256, revisionId, preparationId/preparationHash, dimensiones y escala; origen inmutable»; asociar solo misma revisión guardada y habilitar selección de PDF en publicación sin modificar versiones previas.
- [ ] T080 [US6] Conectar regeneración y comparación PDF remota en `apps/api/src/publications/pdf-verifier.ts`, siguiendo geometry-print.md: bytes propios frente a cargados y verificador independiente; perfil desconocido o diferencia rechaza conjunto, ningún PDF de otra revisión.
- [ ] T081 [US6] Ejecutar medición numérica, impresión física, determinismo Windows/Linux y rendimiento en `tests/print/acceptance.spec.ts` y `docs/validation/print.md`: 10 ejecuciones por carga quickstart, grandes páginas/mosaicos, cancelación y archivos corruptos; no confundir cuadrado físico con exactitud matemática.

## Fase 8 — US8: Eliminar y recuperar patrones y proyectos (P2)

**Objetivo:** separar papelera local y remota, restaurar conjunto correcto y purgar sin resucitar contenido.
**Prueba independiente:** eliminar una copia local sin tocar la cuenta y viceversa; proyecto con patrón previamente en papelera mantiene plazos originales; restaurar/eliminar solo alcance autorizado. Usar versiones sintéticas para ensayos aislados.

- [ ] T082 [P] [US8] Escribir escenarios locales en `tests/recovery/local-trash.spec.ts`: FR-017, FR-082–083/090; guardar/descartar/cancelar, fallo de guardado/papelera conserva archivo y memoria, no borrado definitivo alternativo ni backend obligatorio.
- [ ] T083 [P] [US8] Escribir escenarios remotos en `tests/integration/trash.spec.ts`: FR-084–096 y FR-122, plazo 30 días, lote conjunto, hijo previamente eliminado, propietario exclusivo, scope obsoleto, restauración bloqueada y concurrencia con expiración de sesión.
- [ ] T084 [US8] Implementar papelera local en `apps/desktop/src/main/documents/trash.ts` y diálogo `apps/desktop/src/renderer/documents/delete-dialog.tsx`; confirmación con alcance, solo papelera SO, fallo conserva trabajo, no borrar PDF ni recurso remoto.
- [ ] T085 [US8] Crear TrashBatch/PurgeJob en `apps/api/src/db/migrations/006-trash.sql`: «causeOperationId único; rootKind/rootId, confirmedAt, expiresAt, memberIds capturados al commit; no incorpora hijos ya eliminados por separado» y «objectKeys pendientes y completadas», «ejecución idempotente; éxito solo cuando el conjunto físico/metadata se completó».
- [ ] T086 [US8] Implementar scope y papelera/restauración en `apps/api/src/trash/trash.service.ts` y `apps/api/src/trash/trash.controller.ts`: validar scopeRevision/propiedad/sesión antes de confirmar, 30 días desde servidor, restaurar lote original, no descargar en papelera, padre activo requerido y plazos no ampliables.
- [ ] T087 [US8] Implementar purga y evidencia externa en `apps/api/src/trash/purge.worker.ts` y `apps/api/src/storage/suppression-log.ts`: intención durable→DB/job→objetos→confirmación durable→resultado, bloqueos por hijos recuperables, cuota liberada con borrado, sin éxito parcial; evidencia solo mientras backups precedentes recuperables la necesitan.
- [ ] T088 [US8] Integrar purga de cuenta de US1 en `apps/api/src/account/account-purge.worker.ts`: eliminar contenido y registros mínimos de última cuenta, identidad no reutilizada, conservar documentos locales; confirmar estado sin inventar éxito por ausencia de respuesta y avisar al seguimiento de US3. Probar SC-277: solo confirmación explícita autoriza transiciones locales, sin acceso a contenido ni eliminación de documentos CAD; probar SC-278: frontera exacta de 90 días, consultas sin extensión y vencimiento sin limpieza local; probar SC-279: recuperación conserva solo comprobación «Solicitud cancelada» por 90 días, sin sesión normal ni limpieza por eliminación definitiva.
- [ ] T089 [US8] Implementar vistas de papelera/alcance en `apps/web/src/app/trash/page.tsx` y `apps/desktop/src/renderer/account/trash-panel.tsx`: confirmar recurso y contenido/pérdida de recuperación, mostrar vencimientos y dependencias, revalidar tras SCOPE_CHANGED y seguir operaciones desconocidas.
- [ ] T090 [US8] Ejecutar pruebas de purga, restauración y separación de copias en `tests/e2e/trash-lifecycle.spec.ts`; cerrar integración US1/US3/US8 y registrar resultados en `docs/validation/deletion.md`, sin simular colaboración aplazada como función entregada.

## Fase 9 — Validación y preparación de entrega

**Puerta:** requiere las seis historias incluidas, salvo pruebas aisladas explícitas. Las tareas siguientes tampoco autorizan despliegue.

- [ ] T091 Preparar respaldo/recuperación de pruebas en `tools/operations/backup.mjs` y `tools/operations/restore.mjs`: dump consistente fuera de EC2 con manifiesto/hash/esquema/watermark y roles recuperables, diario encendido y preapagado, conservar 7 días; drenar mutaciones, fallo cancela apagado; probar con dobles/entorno local, no operar AWS.
- [ ] T092 Validar restauración aislada y supresiones en `tests/integration/backup-restore.spec.ts`: aplicar evidencia posterior antes de servir tráfico, no resucitar eliminados, intención incompleta mantiene aislamiento, no ejecutar correos/jobs normales del respaldo y no limpiar evidencia necesaria.
- [ ] T093 Preparar instalador Windows 11 de 64 bits, arquitectura x64, en `apps/desktop/forge.config.ts` y validar instalación/archivos/recuperación/impresión en `docs/validation/windows.md`; verificar el soporte aprobado Windows 11 x64 y conservar el alcance USB, sin contratar firma de pago.
- [ ] T094 Ejecutar análisis de seguridad y fronteras en `tests/integration/security.spec.ts`: aislamiento entre propietarios, IPC, CSRF, rutas/archivos hostiles, logs sin secretos, tokens y revocación al commit, caché privada y límites de cuota; registrar hallazgos corregidos en `docs/validation/security.md`.
- [ ] T095 Ejecutar flujos completos y rendimiento de quickstart en `tests/e2e/first-release.spec.ts` y `docs/validation/performance.md`: CAD→guardado→PDF→publicación→PWA→descarga→papelera/cuenta, recursos medidos y objetivos 60s/5s/60s sobre 4 núcleos, 16 GB de RAM y SSD; ensayar configuraciones inferiores para determinar y documentar el mínimo admitido antes de validar la entrega, sin excluirlas de antemano; si capacidad/coste debe cambiar, informar antes de hacerlo.
- [ ] T096 Documentar operación y puerta de despliegue en `docs/operations/aws-test-runbook.md`: Ohio, EC2 160h/mes, 100 USD de créditos y estimación 13,09 USD/mes condicionada; comprobar saldo/vigencia, dominio/HTTPS/SES, restauración y costes antes de solicitar autorización. No crear recursos ni convertir el entorno en servicio continuo.
- [ ] T097 Completar evidencia ejecutada de la matriz previa `specs/001-patronaje/coverage.md` en `docs/validation/acceptance-matrix.md`, relacionando cada FR/SC incluido con prueba/evidencia o fallo explícito, y registrar los aplazados por alcance; no marcar entrega completa con criterios incumplidos.
- [ ] T098 Actualizar `specs/001-patronaje/quickstart.md` y `docs/user-guide.md` con comandos realmente disponibles y uso local/publicación/impresión/recuperación, comprobar ausencia de módulos aplazados y entregar informe de validación; implementación y despliegue mantienen autorizaciones separadas.

## Dependencias y orden

El orden de presentación conserva P1 antes de P2 y los IDs de la spec; no obliga a completar una historia que depende de otra todavía incompleta.

1. T002→T003→(T004,T005)→T006–T015. Fundamentos bloquean historias.
2. US1: T016/T017→T018–T025. T026 de cuenta sin contenido puede ejecutarse con fixture; su aceptación final requiere T088/T090. T023 habilita el acceso CAD de producción.
3. US2: T027/T028→T029–T038. Independiente de biblioteca/publicación con sesión de ensayo. Las operaciones numéricas preceden a margen y renderizado.
4. US3 local: T039→T041–T044 después de US2 y fundamentos. US3 remoto: T040, T045–T051 después del servicio de sesión T021 y geometría T038. T052/T053 integran ambos. T054–T061 usan los contratos de identidad y resultado; T062/T063 prueban el conjunto.
5. US5: T064/T065→T066–T069, requiere US1 y T045/T046/T051. Puede usar versiones sintéticas antes de publicación completa; aceptación final requiere T063 y T081.
6. US6: T070/T071→T072–T081, requiere US2, T041–T044 y perfil T048. T080 requiere T049/T050. T063 se amplía con PDF tras T081. Por tanto se puede completar exportación local antes de terminar publicación remota.
7. US8: T082/T083→T084–T090, requiere esquema/cuenta/resultados T010/T021/T024/T045/T046/T051 y guardado T041–T044. No requiere centro de notificaciones ni colaboradores. T088 completa purga delegada de US1; T090 cierra aceptación integrada de ambas historias.
8. T091–T098 después de historias; T092 después de T087/T091. No tarea de despliegue está implícita en preparar scripts o runbook.

Dentro de cada bloque secuencial, validar modelos antes de servicios y servicios antes de integración. Las pruebas de contrato pueden escribirse antes de tener implementación; no pueden declararse superadas con dobles que omitan el comportamiento que se pretende verificar.

## Paralelismo previsto

| Historia/fase | Ejemplo independiente una vez cumplidos prerrequisitos |
|---|---|
| Preparación | T004 comandos de validación y T005 configuración de ensayo, tras T003; integrar manifiestos secuencialmente |
| US1 | T016 autenticación y T017 ciclo de cuenta, archivos distintos |
| US2 | T027 fixtures numéricos y T028 escenarios UI |
| US3 | T039 fallos de archivos y T040 transacciones de publicación |
| US5 | T064 contrato de descarga y T065 protocolo PWA |
| US6 | T070 preparaciones y T071 geometría PDF |
| US8 | T082 papelera local y T083 papelera remota |

No ejecutar simultáneamente tareas que editen un mismo manifiesto/migración o dependan de un contrato aún inestable. El marcador [P] describe posibilidad futura, no ejecución realizada.

## Cobertura y exclusiones

| Requisitos | Tareas responsables / delimitación |
|---|---|
| FR-001–003, 018–019, 107–119, 125 | US1 y fundamentos; acceso de propietarios, no concesiones compartidas |
| FR-004–007, 023–026 | US2 para editor; T045 y US8 para proyectos |
| FR-009–011, parte manual 020, 022, 120, 274–278, 280–282, 284 | US3, T093; editable propio, no importar ni sincronizar carpetas |
| FR-012–013, 121, 124, 283 | US5 |
| FR-014–015, 027–061, 273, 279, 285 | US6 con núcleo US2; FR-048 se aplica a piezas sin introducir variantes |
| FR-017, 082–096, 122 | US8; FR-093–094 también T053, propiedad FR-096 en T045; escenarios de colaboradores aplazados |
| FR-126–141, 217–229, 231–272 | US3 y ciclo de cuenta US1/US8; FR-128 sin excepción de publicación automática en esta entrega; T062 cubre estados y tiempos |
| FR-142–148, 150–151 | US1/US8; accesos compartidos de FR-148 no se implementan |
| FR-008, 062–081 | Aplazados: US4 y gestión/impresión de variantes; etiqueta de talla FR-026/279 sigue incluida |
| FR-016, 097–106, 123, 149, 152–156 | Aplazados: US7, invitaciones y concesiones; autorización de recursos propios sigue incluida |
| Parte automática FR-020, FR-021 | Aplazada; no crear interruptor ni worker de publicación automática |
| FR-157–216, 230 | Aplazados: centro de notificaciones y preferencia de filtro; no aplazar por ello operaciones de cuenta/publicación |

Los SC se aplican por comportamiento y alcance de la misma spec, sin renumerarlos ni borrar decisiones aplazadas. T097 debe demostrar cobertura individual; la matriz anterior no sustituye esa evidencia ejecutada. Para cada entidad, los campos adicionales, enums y nulabilidad completos de data-model.md y contracts son obligatorios; las citas en tareas preservan restricciones críticas y no autorizan inventar longitudes máximas ni unicidades nuevas.

## Estrategia de entrega incremental

Primer hito interno: fundamentos + US1 de acceso + US2 + guardado/recuperación local T039/T041–T044. Permite demostrar CAD local habilitado tras verificación, sin afirmar que la entrega completa está terminada. Segundo hito: US6 imprime a escala. Tercero: publicación, portal/PWA y seguimiento completo. Cuarto: eliminación/recuperación integrada y validación transversal. Todas las historias incluidas son necesarias para la primera entrega aprobada.

No desplegar al alcanzar un hito. Tras autorización futura de implementación, completar y validar tareas; un despliegue requiere autorización específica y comprobar las condiciones AWS. No sumar tareas de producción continua ni compras para hacer pasar una prueba.

## Registro documental

Se aplicó speckit-tasks sobre 001-patronaje en patronaje con las variables de feature requeridas. No existe .specify/extensions.yml: no hay hooks before_tasks/after_tasks que ejecutar. Las casillas permanecen sin marcar; validación actual limitada al documento, no al producto.

## Cierre documental U1/U2 — 2026-11-14

U1 resuelto: CAD Windows 11 x64; Android 12+ con Chrome; iPhone iOS 17+ con Safari incluida PWA instalada; portal Chrome/Edge estable actual y anterior. Equipo de referencia: 4 núcleos, 16 GB RAM y SSD, sin excluir equipos inferiores; mínimo se determinará por pruebas antes de validar entrega.

U2 resuelto conforme FR-286–292 y SC-277–283: credencial protegida limitada a una solicitud, emisión autenticada también en otros dispositivos durante recuperación, conservación tras logout, comprobación al abrir/reconectar y manual, reintentos automáticos crecientes con aplicación abierta y conexión sin sesión normal. Consulta disponible 90 días desde eliminación definitiva confirmada o recuperación confirmada (resultado cancelado), sin renovar por consultas. Solo eliminación explícitamente confirmada activa las transiciones locales existentes. No conserva contenido de cuenta ni OperationResult por esta excepción. No autoriza código, instalación ni despliegue; las pruebas permanecen pendientes.

Dependencias corregidas: T001 precede a T002; T010/T011 son fundamentos antes de mutaciones. T050 usa T011; T051 añade consulta. T043 depende de T041/T042. C1, C2, I1, I2, G1 e I3 fueron corregidos documentalmente; la repetición de analyze verifica el resultado, no supone implementación.
