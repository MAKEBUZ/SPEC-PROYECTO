# Contrato local propuesto

## Documento

Extensión .patron, JSON UTF-8: formatVersion=1, documentId, revisionId, units=mm, pieces, preparations. Hash de contenido canónico excluye revisionId mismo y vínculos remotos. Cambiar preparación genera revisión distinta. PDF guarda revisión y hash de preparación de origen.
Rechazar estructura corrupta y formato futuro sin cambiar archivo/documento abierto; borrador geométrico inválido no equivale a corrupción. No reparar ni convertir automáticamente. Nunca ejecutar contenido activo o seguir rutas de documentos como instrucciones.

## Frontera IPC

### Campos y respuestas comunes

Cada solicitud IPC incluye requestId único dentro de la ejecución. Main devuelve resultado discriminado success/cancelled/error y requestId; error contiene code y message, sin rutas sensibles innecesarias. Cancelar un diálogo no equivale a un fallo ni a un guardado. Los identificadores de documentos y trabajos son capacidades emitidas por main, no rutas recibidas libremente desde el renderer.

| Solicitud | Entrada adicional | Salida confirmada |
|---|---|---|
| document.open | Sin ruta arbitraria; diálogo nativo o capacidad de archivo previamente concedida | documentHandle, snapshot validado, revisionId, estado de guardado |
| document.save | documentHandle, snapshot, revisionId esperado, modo save/saveAs | revisionId escrito y hash de bytes; cambios posteriores siguen modificados |
| recovery.inspect | documentHandle o enumeración de recuperaciones autorizadas del usuario Windows | candidatos íntegros identificados, sin aplicarlos |
| recovery.restore/discard | recoveryId y decisión explícita | snapshot recuperado como cambios sin guardar o descarte confirmado |
| export.confirmSave | Sin ruta ni snapshot; confirmación nativa de guardar antes de exportar | confirmed; cancelar no genera PDF |
| export.generate | documentHandle, revisionId guardado, preparationId | jobId; progreso por fases consultable con secuencia; archivo final solo tras validación |
| export.status | jobId emitido para esa ventana | estado/fase, sequence creciente por transición y nombre final si se confirmó el guardado; consultas serializadas |
| export.cancel | jobId | cancelación solicitada; evento final cancelled al liberar recursos y recuperar edición |
| publication.pdfs | documentHandle y revisionId guardado | metadatos de PDF íntegros de esa revisión/preparación, sin rutas libres |
| publication.prepare | documentHandle, revisionId y pdfIds opcionales | manifiesto del editable, vista previa y PDF seleccionados tras verificar bytes y origen |
| publication.action publish | documentHandle, revisionId; projectId, patternName y pdfIds opcionales | seguimiento de publicación del conjunto completo, sin aceptar rutas ni afirmaciones de verificación del renderer |
| document.confirmTrash | documentHandle y estado dirty; main muestra nombre y alcance local | elección guardar/descartar/enviar/cancelar y confirmationId de un solo uso |
| document.trash | documentHandle, confirmed y confirmationId emitido por main para ese archivo | enviado a papelera o fallo preservando archivo; nunca borrado definitivo |

Errores locales estables: DOCUMENT_INVALID, FORMAT_UNSUPPORTED, EXTERNAL_FILE_CHANGED, STORAGE_UNAVAILABLE, ACCESS_DENIED, DISK_FULL, SAVE_UNCONFIRMED, RECOVERY_INVALID, EXPORT_INVALID y TRASH_UNAVAILABLE. EXTERNAL_FILE_CHANGED ofrece únicamente guardar como otro archivo o cancelar, nunca forzar sobrescritura. Los detalles de error geométrico incluyen pieza/vértice/tramo y motivo, sin cambiar el documento.

La exportación consulta un único snapshot de estado cada vez; un fallo de consulta no desbloquea la preparación ni repite la generación. «Cancelando» se muestra de inmediato y no retrocede por una respuesta anterior. El archivo final tiene un punto de confirmación local: cancelar después no deshace un PDF ya guardado. Si se interrumpe su registro opcional en el catálogo, se informa que el PDF está guardado y que todavía no quedó disponible para publicación. La continuación de una carga remota obtiene los PDF del manifiesto persistido original, no de una selección nueva.

### Identidad y representación

revisionId = SHA-256 de la representación canónica JCS del contenido editable validado; incluir documentId, formatVersion, units, pieces y preparations. Excluir revisionId, remoteBinding y datos de transporte. Rechazar nombres de propiedad duplicados, números no finitos y Unicode mal formado; no normalizar ni redondear coordenadas como reparación. Arrays conservan su orden. Hash de bytes del archivo y revisionId son conceptos distintos; la detección de edición externa usa el archivo completo, no solo la revisión geométrica. Fuente: [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).

IDs de piezas, segmentos, vértices y preparaciones únicos dentro de su dominio; referencias del contorno deben existir. Las referencias de selección a piezas eliminadas pueden conservarse como faltantes según spec, pero no crean geometría ficticia. Datos de producción incompletos no invalidan la estructura de un borrador. La serialización de una nueva esquina escribe miter explícitamente; una elección existente nunca se sustituye al guardar.

Guardar como otro archivo requiere un destino distinto del archivo externo en conflicto. Si el destino elegido existe, se comprueba su identidad y se aplica el flujo ordinario de confirmación de reemplazo de ese destino; no sirve para eludir el bloqueo del archivo en conflicto.

- document.open/save: diálogo nativo, esquema validado; revisionId confirmado solo tras persistir.
- recovery.inspect/restore/discard: decisión explícita; recuperar mantiene cambios sin guardar.
- export.prepare/generate/cancel: snapshot guardado, jobId, progreso veraz y final solo tras validar.
- document.trash: confirmación local, papelera del SO; ningún fallback definitivo.
- publication.begin: documento guardado, vista previa y PDF seleccionados de misma revisión; no publicar recuperación como guardado.

Main valida capacidades/rutas; no IPC de ejecución arbitraria. Renderer nunca recibe acceso general a filesystem.

## Persistencia

### Protocolo Windows seleccionado para el diseño

Un escritor por ruta/documento en main. Congelar el snapshot; ediciones posteriores permanecen modificadas. Comprobar identidad y hash del archivo previo para detectar cambios externos antes de reemplazarlo.

Crear temporal exclusivo en el mismo directorio y volumen; escribir, solicitar flush, cerrar y releer para validar estructura/hash. Conservar y verificar una copia previa independiente antes de tocar el destino; si falla, abortar. Persistir intención con saveId, hashes previo/nuevo y candidatos controlados por main. No hay transacción atómica entre journal y documento.

Seleccionar un adaptador Windows mínimo C++/Node-API para ReplaceFileW con backup, justificado por conservación de atributos y acceso a semántica nativa. No es un segundo núcleo geométrico ni código creado ahora. Para la primera escritura, usar creación/movimiento sin sobrescritura de un destino aparecido entretanto. Nunca borrar el original como fallback. Verificar destino después de la operación y solicitar flush antes de confirmar el snapshot guardado.

Si falla después de intentar reemplazar, inspeccionar candidatos por hash: una llamada fallida no prueba que los nombres no hayan cambiado. Destino íntegro nuevo permite identificar el resultado; destino anterior conserva el último guardado y puede ofrecer recuperación del nuevo. Ausencia, corrupción o contradicción impide declarar éxito; conservar candidatos y ofrecer recuperación explícita, sin reparar automáticamente el documento. No sobrescribir el archivo actual al abrir una copia recuperada.

Para seguimientos locales usar generaciones independientes con identidad, secuencia, hash y referencia anterior. Persistir y verificar la generación nueva antes de anunciar transición. Evidencia posterior de vencimiento/eliminación prevalece sobre copias antiguas; evidencia ilegible implica aislamiento, no reactivación. save_pending no habilita limpieza. No eliminar candidatos antes de persistir la evidencia que permite reconciliarlos.

Este protocolo sustituye cualquier lectura absoluta del resumen siguiente: «fallo mantiene original» significa conservar una versión anterior válida recuperable, no garantizar que la API Windows deje siempre intacto el nombre del destino. La atomicidad visible de un reemplazo, el flush y la resistencia a un corte eléctrico son garantías distintas. ReplaceFileW no soporta REPLACEFILE_WRITE_THROUGH; no prometer persistencia absoluta frente a fallo físico. Cobertura de guardado editable aprobada: discos locales y USB; carpetas de red y sincronizadas aplazadas. Verificar los sistemas de archivos concretos y semántica de reemplazo/flush en la matriz Windows; no asumir que toda unidad USB ofrece las mismas garantías.

Fuentes: [ReplaceFileW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew), [Node filehandle.sync](https://nodejs.org/api/fs.html#filehandlesync), [flush Windows](https://learn.microsoft.com/en-us/windows/win32/fileio/flushing-system-buffered-i-o-data-to-disk). Ensayos futuros: interrupción en cada frontera, disco lleno, permisos, archivo ocupado, modificaciones externas y pérdida de alimentación. Diseño seleccionado, garantías aún no verificadas en aplicación.

Temporal en mismo directorio, escritura completa y verificación antes de reemplazar. Fallo mantiene original y memoria; copia anterior válida hasta verificar reemplazo. Recuperación separada por documento, objetivo <=60s; no modifica versión explícitamente guardada.
Journal fuera del documento con esquema/checksum; credenciales en almacén del SO. Corrupción se aísla y se recupera solo desde evidencia válida compatible. save_pending del resultado temporal no habilita limpieza hasta persistir.

## Salida

Vista previa PNG propuesta, generada desde snapshot, no producción ni adjunto arbitrario. PDF vectorial con manifiesto origen y escala; bytes inmutables tras exportar. La validación para producción se aplica a selección y preparación con estructura global válida.
formatVersion local no es ordinal remoto. Nueva publicación puede reutilizar revisión; repetir una misma operación no duplica versión.

## Uniones por esquina del margen — decisión aprobada

Persistir cornerJoins por identificador estable del vértice del contorno base, con valor round o miter. No usar índices ni vértices derivados de teselación. Una pieza puede combinar ambos tipos y mantiene un único ancho uniforme. Cambiar una unión modifica la revisión y participa en deshacer/rehacer; guardar/reabrir y PDF conservan la combinación. Las puntas esquinadas se conservan sin límite específico ni recorte automático, sujetas a las validaciones geométricas y límites existentes. Inicializar explícitamente como miter las esquinas nuevas o sin elección previa al aplicar margen; permitir cambiar cada una a round y conservar las elecciones existentes. El valor inicial se aplica al crear la configuración, no sobrescribe la configuración persistida.

**Puntas largas — decisión aprobada:** conservar la punta sin límite adicional si cumple las validaciones y tamaños existentes. Un MiterLimit con conversión automática a bisel/redondeado no cumple el contrato. El adaptador geométrico debe conservar la intersección válida o comunicar invalidez, sin reparación silenciosa. Esta elección no amplía los límites de pieza/composición ni suprime validaciones.

**Valor inicial de esquinas aprobado:** esquinadas, modificables individualmente a redondeadas, conservando las ya configuradas. Las decisiones funcionales sobre forma, ámbito y puntas quedan aclaradas. El algoritmo de uniones mixtas y su precisión están definidos en [geometry-print.md](geometry-print.md); su validación experimental queda para implementación.

**Guardado editable — alcance aprobado:** discos locales y USB; red y carpetas sincronizadas aplazadas (FR-011, SC-271). La recuperación del trabajo debe conservar una copia independiente del USB para que retirarlo no elimine simultáneamente todas las candidatas; ubicación y permisos controlados por main. Probar desconexión durante escritura, flush y reemplazo, y reconexión con letra de unidad distinta; no reintentar contra otra unidad solo por coincidir la ruta. No se promete resistencia a daño físico. Ante cambio externo detectado, bloquear sobrescritura y ofrecer guardar como otro archivo o cancelar, conservando memoria; no hay sobrescritura forzada (opción A aprobada).
