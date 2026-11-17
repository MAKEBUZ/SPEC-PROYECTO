# T061 — integración local de eventos y pantallas

2026-11-16, rama patronaje. Avance validado, tarea todavía abierta. Sin despliegues, servicios AWS ni ensayos físicos T039.

## Integración implementada

- Coordinador común OperationLifecycle: serializa historial, confirmaciones y mantenimiento; correlaciona eliminación con una solicitud previamente vinculada a la cuenta. Un recurso ausente o un error no confirma eliminación. Conserva en memoria el inicio de conservación si falla la escritura de la confirmación.
- Escritorio: propietario en main, almacenamiento real, temporizador de mantenimiento, detección de conectividad, powerMonitor suspend/resume, caída del renderer y cierre aprobado. Un cierre impedido por cambios nuevos reactiva el seguimiento. Los avisos genéricos se muestran desde Workspace mediante el estado IPC de cuenta.
- Web/PWA: propietario de mantenimiento mediante Web Locks, IndexedDB para el estado temporal, eventos online/offline, pagehide/pageshow y freeze/resume cuando el navegador los emite. Otra pestaña puede adquirir el mantenimiento al liberarse el propietario. Avisos en el layout raíz.
- Al no poder demostrar continuidad del reloj a través de suspensión/restauración, el adaptador cambia su identificador y aplica la regla aprobada de incertidumbre. No sustituye el tiempo por el reloj civil. El núcleo conserva nivel de espera y evita contar dos veces la misma interrupción.
- Un vencimiento ya persistido puede limpiarse sin inicializar ni consultar el almacén temporal. Un resultado temporal pendiente de escritura bloquea su uso para limpieza.
- Las consultas limitadas se descartan tras interrumpir su intento; reconectar permite otra consulta. Se conserva el botón Comprobar ahora del panel de cuenta y el backoff independiente del controlador.
- Mutaciones autenticadas de cuenta: journal antes del transporte, resolución con identidad coincidente y recepción de resultados consultados. Logout diferido y revocación global del CAD también se enlazan antes del envío. Las revocaciones antiguas sin identidad de cuenta conservan su almacenamiento protegido; no se infiere su propietario.
- El hash de correlación local de estas operaciones contiene solo cuenta/tipo/operationId: no se guardan contraseñas, tokens ni hashes rápidos derivados de ellos. El servidor mantiene la vinculación del payload completo mediante su HMAC independiente.

## Evidencia

- Regresión de recuperación y cuenta: 132/132 pruebas en 31 archivos.
- Después de enlazar revocaciones y endurecer la correlación sin secretos: 20/20 pruebas dirigidas; TypeScript correcto.
- E2E de cuenta: 7/7 con Edge, Electron y Nest/PostgreSQL efímero local; contenedor retirado al terminar. Última ejecución después de enlazar revocaciones. El ajuste posterior del hash local se comprobó mediante las pruebas dirigidas.
- Builds de escritorio y portal correctos. El portal requiere --webpack por su configuración existente. Advertencias existentes del bundle desktop y use client.
- Se corrigió el montaje del ensayo IndexedDB para servir sus dependencias. El cleanup de Electron termina exclusivamente el proceso del ensayo; este caso prueba logout, no el cierre voluntario de la ventana.

## Pendiente para cerrar T061

- Conectar todas las mutaciones de publicación/selección de proyecto y papelera en sus flujos de cliente, aún pendientes en T052 y T089, con los scopes correspondientes.
- Integrar la proyección conjunta Pendientes/Resueltas de T056, incluidas migración conservadora del registro anterior y resolución de rechazos sin OperationResult confirmado. No declarar como resueltas entradas cuyo resultado sigue desconocido.
- Completar la evidencia E2E específica de suspensión/reapertura, varios propietarios web y eliminación definitiva con historial real, más allá de los modelos de estados y los recorridos generales de cuenta aquí ejecutados.

No se marca T061 completa ni se declara que todas las mutaciones del producto estén enlazadas. T039 físico sigue aplazado.

Actualización 2026-11-16: T056 completada; la proyección y migración Pendientes/Resueltas ya están integradas. El lifecycle consulta pendientes fuera del panel y depura snapshots de resueltas retiradas mediante evidencia de supresión. Validación: 147/147 pruebas de regresión local y 9/9 E2E de cuenta; detalles en operations-history-panel.md. T061 continúa abierta por publicación/papelera (T052/T089) y evidencia específica de lifecycle completo.

Actualización de publicación 2026-11-16: creación de proyecto, beginPublication, commitPublication y abandonPublication ya se registran desde main antes del transporte; publicación usa scopes de documento/patrón y correlación persistente independiente para reconciliar tras reiniciar. Consultas respetan las pausas y esperas del journal. Ver manual-publication.md. T061 conserva pendientes de papelera y lifecycle completo, incluida limpieza de esta correlación adicional al eliminar la cuenta.

## Dependencias de publicación — 2026-11-16

La admisión de una nueva publicación incluye el proyecto de destino y la identidad del patrón tomada del documento guardado, aunque aún no exista vinculación en el historial local. Las referencias `project-member` bloquean una operación sobre el proyecto completo, pero no otra publicación independiente en ese mismo proyecto. Tanto el seguimiento genérico como el lifecycle utilizan la misma comparación de dependencias.

Verificación: 463/463 pruebas locales, 14/14 pruebas de integración API/PostgreSQL en desktop-publication y deletion-check, TypeScript y compilación del CAD correctos. El contenedor temporal se retiró. No se empleó AWS.

Queda pendiente cerrar T061: admisión de todas las mutaciones, precisión de sus alcances y tratamiento de rechazos antes del envío. La nueva suite operation-history cubre parte de T062; no representa su aceptación completa.

## Estado posterior: T061 completada localmente

Los pendientes históricos de este informe se cerraron en la continuación documentada en [operations-lifecycle-complete.md](operations-lifecycle-complete.md): 505/505 pruebas locales, 25/25 de integración y 20/20 E2E. T062 y aceptación física siguen pendientes.
