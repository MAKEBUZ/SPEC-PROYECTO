# Avance local autorizado — 2026-11-15

El usuario autorizó continuar las tareas pendientes, dejando al final decisiones/aprobaciones necesarias. No autoriza despliegue, gasto AWS ni cambios de alcance. Rama `patronaje`.

## Resultados comprobados hasta este punto

- T036/T037: renderer React/Three.js real, herramientas numéricas, cuadrícula/snapping, unidades de vista, selección, edición y propiedades. Modelo canónico separado de la escena. Acceso CAD condicionado a habilitación local de cuenta. 27/27 escenarios de `tests/e2e/cad-edit.spec.ts` pasan en Electron/Playwright (347,11 s). Fixture de cuenta local solo en la entrada de pruebas, sin bypass en producción. Un ajuste del driver envía el evento de soltar con coordenadas subpíxel mediante DOM, evitando la reducción a float32 del transporte del ratón; ejecuta el mismo manejador real, sin duplicar edición. Dos pruebas adicionales del controlador local pasan. Compilación de escritorio y TypeScript correctos.
- T045: proyectos propios con paginación firmada ligada a cuenta/filtro, idempotencia, nombres sin unicidad global, renombrado con revisión, consulta de patrones y sesiones revalidadas antes de confirmar. Dos pruebas de integración pasan contra PostgreSQL 18.7 efímero local.
- T046/T047 en curso: migración de versiones/staging y restricciones de propiedad/inmutabilidad; reservas y carga privada verificada. Seis pruebas conjuntas de proyectos, esquema y publicación pasan; aún faltan el commit/worker y el conjunto de fallos/aceptación de T040.
- T048 en curso: PNG determinista con resvg WASM y Noto Sans fijados por SHA-256; dos pruebas locales pasan. No acredita reproducción Windows/Linux ni todos los artefactos de impresión.
- T039/T041–T044 en curso: escritor con intención, candidatos, respaldo independiente y verificación; apertura validada; guardia de salida; recuperación por generaciones y descarte durable. Quince pruebas locales pasan usando un doble explícito de reemplazo de archivos. No prueban ReplaceFileW, USB físico ni integración completa con ventanas/IPC.

## Pendientes que requieren entorno o participación posterior

- No se encontró compilador C++ Windows (`cl`, CMake, g++ ni instalación VC detectada por vswhere). El fuente Node-API `apps/desktop/native/file-replace.cc` está preparado; no se declara compilado, instalado ni validado. Se conserva el adaptador nativo aprobado, sin reemplazarlo por unlink/rename. Antes de instalar herramientas de sistema se concretará el instalador, espacio y permisos necesarios.
- Pruebas físicas de USB, impresora, Android/iPhone instalados y equipo de referencia permanecen pendientes; no se sustituirán por emulación.
- Ninguna tarea que necesita esos resultados se marca completada por disponer de un doble o del fuente.

Fuentes técnicas del adaptador: [Microsoft ReplaceFileW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew) y [Node-API](https://nodejs.org/api/n-api.html). La API Windows puede fallar después de cambiar nombres y no admite `REPLACEFILE_WRITE_THROUGH`; el escritor reconcilia por hashes y no promete resistencia absoluta a fallo físico.

## Validación adicional de publicación, portal y seguimiento

- T046/T050: esquema y commit atómico verificados. Once escenarios de proyectos/esquema/publicación incluyen reservas concurrentes, repetición idempotente, PNG alterado, sesión revocada, dos publicaciones sobre la misma versión, fallo SQL después de insertar archivos y reanudación del mismo intento. El rollback no expone un patrón ni una versión parcial; las versiones/archivos publicados rechazan actualizaciones. Los identificadores de archivos publicados son independientes de los identificadores dentro del staging. Un commit devuelve FileView saneado, nunca claves privadas.
- T051 en curso: consulta autorizada por identidad histórica y anonimización del solicitante eliminado verificadas; falta integrar la eliminación del registro al desaparecer la última cuenta con la purga de US8.
- T048: comparación ejecutada en Windows y Linux local (`node:24.22.3-bookworm-slim`, sin red, repositorio de solo lectura). `tools/validation/preview-profile.mjs` obtuvo iguales hashes para documento vacío, rectángulo con texto Unicode, geometría diminuta y composición grande. Falta ampliar primitivas/corpus y aceptación conjunta de artefactos; no se marca el perfil completo por estos cuatro casos.
- T049 en curso: worker aislado con límite de memoria, espera hasta terminar el hilo y bloqueo PostgreSQL para un solo trabajo intensivo; cola persistente. PDF se rechaza con perfil no admitido hasta conectar T080; nunca se acepta por metadatos. El transporte local aún usa buffers y debe terminarse el streaming/temporales antes de la aceptación de capacidad.
- T054: journal por generaciones verificadas y encadenadas, compare-and-append, identidad inmutable, aislamiento de daño y tombstone sin resurrección. Tres pruebas de recuperación en disco y prueba IndexedDB real con dos conexiones concurrentes pasan. Adaptadores preparados; integración en todas las pantallas pendientes en T055/T056/T061.
- T055 en curso: consulta sin transporte de mutaciones; pausa, estados sin permiso/no disponible, bloqueo por recurso, una consulta simultánea, resultado vinculado por identidad y persistencia antes de liberar. Dos pruebas unitarias pasan; falta orquestación de aplicación y UI.
- T058: endpoint público /time con nonce, respuesta no-store sin datos de cuenta y evidencia por intervalo/continuidad monotónica. Dos pruebas unitarias y una HTTP pasan. T059/T060 integrarán el ciclo y persistencia; todavía no se habilita limpieza con evidencia no guardada.
- T064/T066/T067 en curso: biblioteca/descarga privada; historia inmutable, rangos, ETag/hash, nombres saneados, reautorización después de leer almacenamiento y por nueva solicitud. Portal real verifica tamaño/hash antes de ofrecer descarga, distingue PNG de PDF, retira datos al perder conexión o cambiar sesión. Prueba HTTP y recorrido Edge pasan; faltan cobertura de transferencia interrumpida/iniciada, streaming y PDF de US6/dimensiones.
- T065/T068 en curso: manifiesto, iconos PNG, instalación técnica y service worker de caché exclusivamente pública. Una prueba Edge real confirma los cuatro recursos públicos cacheados y página neutral sin conexión. Protocolo físico en `pwa-devices.md`; no acredita instalación Android/iPhone ni integra aún todo el seguimiento US3.
- Suite de cuenta ampliada: 7/7 escenarios E2E pasan (34,52 s), incluidos biblioteca e IndexedDB, además de los cinco escenarios previos. Suite conjunta HTTP/PostgreSQL: 14/14 pasan. Regresión anterior de unitarias/contratos/recuperación: 230/230; los nuevos módulos de seguimiento añaden pruebas posteriores, pendientes de una ejecución consolidada final.
- Compilaciones de escritorio, portal Next con webpack y TypeScript correctas. Next requiere `--webpack` por la configuración existente; no se cambió de bundler. Sin AWS ni despliegue.

La primera entrega completa sigue en desarrollo. Las casillas de tasks.md y evidencias específicas prevalecen sobre este registro de avance.

## Estado consolidado al cerrar este tramo

**47 de 98 tareas marcadas; 51 siguen pendientes**, incluidas tareas con implementación parcial. En este trabajo se cerraron T036, T037, T038, T045, T046, T050, T054, T058, T070, T072, T083, T085 y T086. Las demás no se cierran por tener archivos creados o pruebas de una parte.

Validaciones finales:

| Comprobación | Resultado |
|---|---|
| Unitarias, contratos, recuperación y offset transversal | 251/251, 41 archivos, 43,35 s |
| Integración completa con PostgreSQL 18.7 local | 112/112, 17 archivos, 10,23 s |
| Cuenta, biblioteca e IndexedDB con navegador/Electron | 7/7, 32,58 s |
| Preparación de impresión en Electron | 1/1, 19,26 s |
| PWA/service worker en Edge local | 1/1, 3,39 s |
| Editor CAD completo, ejecutado anteriormente en este trabajo | 27/27, 347,11 s |
| TypeScript y compilaciones desktop/portal | Correctos; portal usa webpack existente |

T070/T072: cinco pruebas del modelo de preparaciones, integrado en el historial común del documento. Selección explícita no vacía, nombres trim/case-insensitive, duplicación/cancelación, faltantes conservados, configuración, eliminación confirmada y undo/redo solo de sesión. Se mantiene el contenido al serializar/reabrir y no se añaden piezas nuevas automáticamente.

T073 parcial: pantalla real de preparaciones en CAD, colocación numérica X/Y/rotación, vista derivada de contornos, nombres/configuración/selección y aviso de cambios/faltantes. Una prueba Electron confirma que la colocación y duplicación conservan la geometría original. Falta la integración completa con guardado nativo y la representación/validación de márgenes para impresión; no se ofrece todavía generar PDF.

T075 parcial: paginado físico en milímetros, solape 10 mm, dos páginas auxiliares incluidas en límite 250, A4/Carta, franja inferior de gran formato y escala 1. Cuatro pruebas unitarias pasan, incluida frontera exactamente 250 y exceso mínimo que necesita otro bloque. Falta conectarlo a selección validada, contenido auxiliar definitivo y PDF/verificador.

T083/T085/T086: cinco pruebas PostgreSQL de lotes/restauración, scope obsoleto, propiedad, plazos exactos, hijos previamente eliminados, lote incompleto, sesión que vence durante confirmación e inmutabilidad de alcance/progreso. Se movió la ruta de scope a un controlador común que conserva el tratamiento de cuenta de US1. PurgeJob es solo el esquema: T087/T088 siguen pendientes, sin endpoint de purga funcional ni borrado físico de contenido publicado.

Se concretó en el contrato HTTP la operación de abandono ya definida mediante `POST /publications/{id}/abandon`. Reserva y resultado son idempotentes; se rechaza abandonar un commit pendiente. Se devuelve el detalle de cuota autorizado y se limpian únicamente blobs de staging explícitamente abandonado, sin inferir abandono por antigüedad. La prueba de rutas se actualizó de 38 a 39, y la de migraciones verifica ahora los siete nombres exactos, conservando el rechazo de migraciones alteradas.

Continuación prioritaria:

1. Completar compilación/prueba del adaptador Windows y conectar apertura/guardado, recuperación y guardia de salida. No instalar herramientas de sistema sin concretar el cambio; no sustituir el adaptador por borrado/rename.
2. Completar validación de impresión (incluidas cuatro pruebas RED de separación de T027), PDF, verificación y cancelación; conectar publicación desde archivo guardado.
3. Integrar journal/consulta con todas las pantallas y terminar tiempos, limpieza y seguimiento de eliminación; no confundir los núcleos probados con aceptación de US3 completa.
4. Implementar purga física con evidencia durable y cierre de cuenta, luego aceptación transversal/instalador/documentación.
5. Dejar para participación posterior USB físico, impresora, Android/iPhone instalados y equipo de referencia. No se ha solicitado ni ejecutado despliegue o gasto AWS.

No hay procesos de implementación programados para continuar después de finalizar la respuesta. No se hizo commit ni push; se preservó el árbol de trabajo existente.

## Continuación local — 2026-11-15

Estado: 48/98 tareas validadas, 50 pendientes. T082 se incorpora a las completadas. Sin cambios de alcance, despliegues, recursos AWS, commits ni push.

### Comprobación temporal y guardado independiente

`packages/document/src/operations/time-check.ts` implementa transiciones deterministas sin reloj civil: consulta única, rechazo de respuestas antiguas, máximo de 30000 ms exclusivo para recepción/validación, esperas 5/10/20/40/80/120 segundos, interrupción contada una vez y distinción entre cierre voluntario y fallo. La reapertura conserva la espera fiable; continuidad desconocida exige el intervalo completo del nivel vigente. La evidencia histórica se vuelve a evaluar; una vigencia anterior no declara vigente el presente.

`maintenance.ts` conserva el resultado en memoria durante el guardado fallido, con una sola escritura y su propia espera creciente, sin dependencia de conexión o sesión. No publica el estado completo ni reinicia el contador de consulta hasta confirmar la escritura. El aviso de fallo es genérico y se retira tras guardar. Nueve pruebas de transiciones y tres de guardado pasan. T059/T060 continúan pendientes: faltan adaptadores durables, limpieza/aislamiento de registros y conexión con el lifecycle T061; no se declara protección completa entre reinicios por estos componentes aislados.

### Archivos locales y papelera

Se retiraron los rechazos de apertura y guardado local por superar 100000000 bytes. FR-284 reserva ese límite para publicación. `local-document-size.spec.ts` guarda y reabre un documento estructuralmente válido con más de 100 MB y verifica revisión y contenido; no cambia la cuota remota ni certifica rendimiento o el adaptador Windows.

T082: ocho escenarios en `tests/recovery/local-trash.spec.ts`, con archivos temporales reales y adaptador de papelera controlado. Cubren cancelar, guardar/descartar, fallo de guardado, nuevos cambios durante guardado/confirmación, rechazo del sistema, cambio externo, confirmación falsa y concurrencia. Un PDF vecino queda intacto. `LocalDocumentTrash` no dispone de transporte remoto ni alternativa de borrado definitivo. Solo vacía memoria tras confirmar el envío. T084 queda abierta por integración con `shell.trashItem`, diálogo y prueba real de la papelera del sistema.

### Validación ejecutada

```powershell
.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts tests/recovery tests/geometry/offset.spec.ts
.local/toolchain/node.exe node_modules/typescript/bin/tsc --noEmit
```

Resultado: **272/272, 45 archivos, 38,46 s**, y TypeScript correcto. La prueba de movimientos temporales requirió ejecución local fuera del sandbox; la ejecución autorizada pasó. No hubo acceso a AWS. La regresión excluye las cuatro pruebas RED de separación de T074 ya registradas; no se afirma que toda la entrega esté validada. Las integraciones PostgreSQL y E2E previamente documentadas no se repitieron al no cambiar sus componentes.

## Continuación de descargas — 2026-11-15

Estado actualizado: **51/98 tareas validadas, 47 pendientes**. Se cierran T064 y T066: descarga privada por streaming desde snapshot verificado, autorización tras lectura de almacenamiento, rangos/If-Range, aislamiento y transferencia iniciada que puede terminar tras revocar sesión. Seis escenarios de integración y siete pruebas de snapshot/limpieza; detalle y límites en [downloads.md](downloads.md).

Regresión actual: **279/279** locales (46 archivos, 38,12 s), **117/117** integración PostgreSQL (17 archivos, 9,34 s), **7/7** E2E cuenta/biblioteca (32,61 s), TypeScript correcto. Se corrigió la espera del arnés de publicaciones para observar la cola persistida cuando otro esquema ocupa el worker global. No se relajó la exclusión del worker ni se cambiaron resultados esperados.

Se cierra T096 como entrega documental: [procedimiento AWS](../operations/aws-test-runbook.md), con Ohio/160 horas, respaldo diario y previo al apagado, retención 7 días, restauración aislada y evidencia de supresión. Conserva la estimación histórica de 13,09 USD/mes y los 100 USD declarados; no afirma haber comprobado saldo, vigencia, precios actuales, dominio, SES o capacidad. Esas comprobaciones y la autorización explícita siguen siendo necesarias antes de desplegar. T091/T092 permanecen pendientes.

No se crearon recursos AWS, no hubo gastos, commit ni push. Los contenedores locales de ensayo se retiraron. La implementación restante, las cuatro pruebas RED de separación y las pruebas físicas conservan su estado pendiente.

## Continuación temporal y conflictos — 2026-11-15

Estado: **52/98 completadas, 46 pendientes**. T059 cerrada con coordinador de consulta única, persistencia por generaciones verificadas y recuperación de esperas/interrupciones. Se conecta al guardado independiente de resultados sin tratar la escritura lenta como timeout remoto. T060/T061 mantienen limpieza y conexión con eventos reales pendientes.

T053 avanza con respaldo exclusivo verificado antes de reemplazar memoria, rechazo de cambios concurrentes, patrón independiente y política que no confunde red/permisos con eliminación. Sigue abierta hasta conectar publicación y evidencia remota.

Pruebas: 292/292 en regresión local (49 archivos, 42,19 s); tras dos casos adicionales, 7/7 en conflictos; TypeScript correcto. [Evidencia y límites](time-conflicts.md). Sin despliegues, AWS, commit ni push.

## Continuación U2 — coordinación de comprobaciones

T061 avanza, pero permanece abierta. `DeletionCheckController` sustituye el bucle de la pantalla compartida CAD/web/PWA: apertura, reconexión, temporizador y botón manual comparten una sola consulta sin encolar duplicados. Reintentos independientes de 5/10/20/40/80/120 segundos, detenidos sin conexión o al cerrar la pantalla. Las respuestas tardías tras desmontar se descartan y las respuestas se validan íntegramente antes de mostrar estado. Una excepción o resultado inválido no confirma eliminación ni llama a limpieza o mutaciones. El aviso se muestra en la sección de eliminación, sin sobrescribir mensajes de otros formularios.

`AccountClient` comparte también el transporte de `checks` mientras está en curso, incluso entre desmontaje y reapertura de la pantalla con el mismo cliente. Tras fallo libera la consulta para un reintento explícito. No se cambian credenciales protegidas, cookies ni plazos del servidor.

Validación ejecutada:

- Regresión local: **298/298**, 50 archivos, 52,03 s.
- E2E cuenta/biblioteca en navegador/Electron: **7/7**, 33,96 s; contenedor PostgreSQL local retirado.
- Tras añadir la protección de transporte entre reaperturas: archivo específico **5/5**, TypeScript correcto. El E2E anterior cubre el controlador/pantalla compilados antes de esa última protección; no se presenta como ejecución posterior a ella.
- Compilaciones desktop y Next/webpack correctas antes del último cambio de transporte; warnings existentes del bundle desktop grande y directiva `use client`. La primera compilación Next falló por permiso de sandbox sobre `.next`; la ejecución local autorizada terminó correctamente.

Pendientes explícitos de T061: comprobación mientras se usa otra pantalla, eventos completos de aplicación/suspensión, adaptación web del seguimiento temporal, journal de todas las mutaciones y enlace con limpieza T057/T060/T088. No se declara U2 completo ni se cambia el total: **52/98 completadas, 46 pendientes**. Sin AWS, despliegue, commit ni push.

## Observador global U2 — continuación

Resuelta la comprobación mientras se usa otra pantalla. `watchDeletionChecks` comparte un controlador por cliente con suscripciones: Workspace mantiene el observador mientras se usa el CAD/preparación, y el layout web/PWA lo mantiene fuera de Cuenta, incluida Biblioteca. La página de cuenta usa el mismo cliente y recibe el estado limitado compartido. No se crean consultas independientes al montar otro consumidor.

`pagehide` detiene reintentos e invalida respuestas del intento interrumpido; `pageshow` inicia la comprobación nueva cuando corresponda. Si la respuesta anterior todavía no terminó, se descarta y se inicia la nueva al liberarse la consulta, sin solaparlas. La última suscripción libera eventos y temporizadores. Se mantiene la separación entre una consulta de estado y cualquier limpieza o mutación; no se modifican plazos del servidor.

Validación sobre los archivos finales de esta continuación: **7/7 pruebas específicas** (dos del observador y cinco del controlador/transporte); **7/7 E2E** cuenta/biblioteca, 34,45 s; TypeScript y ambas compilaciones correctos. Persisten únicamente los warnings ya documentados del bundle desktop. Contenedor PostgreSQL de ensayo retirado. No se repitió la regresión geométrica, al no modificar ese núcleo.

T061 sigue abierta por integración completa del lifecycle temporal, persistencia/limpieza y journal de todas las mutaciones. La suscripción global no demuestra suspensión/reinicio nativo ni limpieza de cuentas. Estado **52/98**, sin nuevas marcas de finalización, despliegue, gastos AWS, commit ni push.

## Continuación: publicación, paginado y pendientes

T055 y T075 completadas; estado actualizado: **54/98**, 44 pendientes. Se validaron el coordinador de consultas pendientes y el módulo de paginado. La integración de pantallas/lifecycle y la generación/verificación PDF siguen en sus tareas respectivas.

T040/T047 avanzadas con fallos de almacenamiento/SQL, reintentos, cuota de versiones en papelera y rechazo temprano de tamaño declarado. T087/T092 avanzadas con registro local externo al dump y planificación conservadora de supresiones; aún sin purga ni restauración integrada. No se marcaron completas.

Evidencia: [publication-suppression-layout.md](publication-suppression-layout.md). Regresión local 313/313; consultas pendientes finales 6/6; integración PostgreSQL 124/124; TypeScript correcto. Se conservaron registrados los primeros intentos fallidos por permisos/timeouts y sus repeticiones. Sin despliegue, AWS, commit ni push.

## Streaming y resultados históricos — continuación

T047 y T051 completadas: recepción/escritura/verificación por streaming y conservación mínima de resultados para cuentas históricamente autorizadas. Corregida la condición que bloqueaba confirmar una purga cuando debía sobrevivir evidencia para otra cuenta. T087/T088 mantienen abierta la purga integrada; PDF y capacidad completa siguen en sus tareas.

Evidencia y límites: [streaming-operation-results.md](streaming-operation-results.md). 323/323 pruebas locales, 125/125 integración completa y 10/10 específicas sobre los cambios finales de concurrencia; TypeScript correcto. El arnés de integración limita a dos trabajadores para evitar saturación, sin ampliar límites temporales. Estado vigente: **56/98 completadas, 42 pendientes**. Sin despliegue, AWS, commit ni push.

Continuación integridad de recuperación: T039/T044 avanzadas con rechazo de descartes obsoletos, secuencias incompletas/duplicadas y control de fallos del capturador periódico. Tres pruebas reprodujeron los fallos antes de la corrección; siete específicas y 63/63 de recuperación pasan, TypeScript correcto. Evidencia: docs/validation/recovery-integrity.md. T039/T044 siguen abiertas por integración y aceptación; se conservan 56/98 completadas, 42 pendientes. Sin despliegue ni AWS.

Continuación recuperación IPC: conectado RecoveryStore al proceso principal de Electron mediante capacidades de ventana y almacenamiento local. Inspección sin rutas/snapshots, restauración explícita sin guardar y descarte solo de copia vigente. Evidencia: docs/validation/recovery-ipc.md. 64/64 pruebas de recuperación, 7/7 E2E de cuenta/Electron, TypeScript y compilación desktop correctos. T044 permanece abierta por captura del documento activo e interfaz, dependiente de T043 para cambios sin guardar. Estado: 56/98 completadas, 42 pendientes. Sin despliegue ni AWS.

Continuación documento activo y recuperación: T044 completada. Captura inicial y periódica mediante IPC validado, interfaz de recuperar/descartar y documentos recuperados siempre sin guardar. Se bloquea el reemplazo de cambios actuales o de un documento que cambió durante la respuesta. 71/71 pruebas dirigidas, dos escenarios E2E Electron aprobados por separado, TypeScript y compilación desktop correctos. Evidencia: docs/validation/active-recovery.md. T043 y la aceptación de cargas/fallos físicos siguen pendientes. Estado actualizado: 57/98 completadas, 41 pendientes. Sin despliegues ni gastos AWS.

Continuación T043: conectada la protección de cambios sin guardar a Nuevo documento y al cierre normal de Electron desde cualquier pestaña. Cancelar conserva el contenido y descartar requiere decisión explícita. Guardar informa de su dependencia pendiente y no cierra ni sustituye el documento. 11/11 pruebas de guardia, cierre, IPC y preparación pasan; TypeScript y compilación desktop correctos. T043 permanece abierta hasta integrar el guardado nativo T041 y apertura T042. Evidencia: docs/validation/unsaved-changes.md. Se mantienen 57/98 completadas, 41 pendientes. Sin despliegue ni AWS.

Validación adicional de T043: regresión completa del editor 27/27, 306,41 s; conservadas todas las aserciones con presupuesto E2E explícito de 30 s por escenario, tras diagnosticar timeouts del límite predeterminado de 5 s. Las 11 pruebas específicas también pasan. T043 sigue abierta por T041/T042; sin cambios en las decisiones aprobadas ni AWS.

Continuación T041/T042/T043: integrada la capa de archivos con diálogos, capacidades y revisiones; botones Guardar/Guardar como/Abrir, control compartido de Nuevo/Abrir/cierre y comprobación final de versión. Bloqueo de sobrescritura externa incluso mediante SaveAs directo o enlace al mismo archivo. 86/86 pruebas dirigidas; 5/5 cierre final con Electron y 12/12 tras refuerzo de identidad; TypeScript y compilación desktop correctos. Evidencia: docs/validation/document-file-integration.md. Siguen abiertas hasta compilar y validar el adaptador Windows real; autorización de instalación de Build Tools/SDK pendiente. 57/98 completadas, 41 pendientes. Sin despliegue ni gastos AWS.


Validación nativa Windows 2026-11-15: instalación de C++ Build Tools y Windows SDK autorizada y completada. Adaptador x64 compilado; smoke nativo correcto; 18/18 pruebas dirigidas con escritor/manejadores nativos; 2/2 E2E Electron y 1/1 tras ampliar formato futuro/conflicto externo/Guardar como. T042 y T043 completadas. T041 conserva reconciliación tras reiniciar y aceptación de rutas/sistemas de archivos; T039 conserva ensayos físicos. Evidencia: docs/validation/native-document-windows.md. 59/98 completadas, 39 pendientes. Sin AWS ni despliegue.


T041 completada 2026-11-15: journal con checksum, copias independientes y reconciliación tras reiniciar integrada en Recuperación local; restauración explícita sin guardar ni sobrescribir. Validación nativa de volumen/sistema de archivos, protección frente a cambio de unidad, rutas ambiguas, red y raíces Cloud Files registradas. 84/84 pruebas dirigidas, 3/3 E2E Electron, smoke nativo NTFS, TypeScript y builds correctos. Evidencia y límites: docs/validation/save-reconciliation.md. T039 conserva ensayos físicos USB/NTFS/exFAT y fallos de dispositivo. 60/98 completadas, 38 pendientes. Sin despliegue ni gastos AWS.


T039 — avance 2026-11-16: añadidos 15 escenarios de fallos de almacenamiento (ENOSPC parcial, EIO/flush, EACCES), salida real de procesos de ensayo y bloqueo real de reemplazo por otro proceso Windows. 15/15 nuevos y 99/99 de regresión en 20 archivos; TypeScript y build desktop correctos. Evidencia: docs/validation/t039-storage-failures.md. T039 sigue abierta: solo se detectó C: NTFS; USB NTFS/exFAT, retirada física/reconexión y disco realmente lleno quedan al final para intervención/medio de ensayo. No se modificó código de producción, no se formatearon/llenaron discos ni se usó AWS. 60/98 completadas, 38 pendientes.


Avance local 2026-11-16: T048/T073/T084 completadas. Perfil PNG comparado en Windows/Linux para diez casos con bytes fijados; preparaciones guardadas/reabiertas tras reiniciar Electron; papelera local real con confirmación de un solo uso y protección de cambios. 115/115 pruebas dirigidas, 3/3 Electron/IPC papelera y 4/4 preparaciones/perfil; TypeScript y build correctos. Evidencia: docs/validation/local-milestones-2026-11-16.md. T068 sigue pendiente de integración US3 y T039 físico aplazado. 63/98 completadas, 35 pendientes. Sin AWS ni despliegue.
