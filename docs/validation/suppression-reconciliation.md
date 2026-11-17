# T087 — reconciliación y compactación de evidencia

Validación local del 2026-11-16 en `patronaje`. T087 completa en el alcance implementado localmente; no se desplegó ni se utilizó AWS.

## Reconciliación

`PurgeWorker.reconcile` recorre intenciones externas y busca el job por su identidad de supresión. Exige coincidencia exacta de tipo, recursos y objetos. Reanuda el protocolo existente bajo la barrera de mantenimiento y el bloqueo del job: objetos pendientes, metadatos/cuota, confirmación durable y resultado transaccional. Las ejecuciones periódicas de purga de recursos y de cuentas incluyen esta reconciliación.

Una intención sin job no demuestra rollback. Un job completo sin confirmación externa tampoco demuestra que el journal pueda reconstruirse. Esos casos, los alcances incompatibles y los errores físicos permanecen bloqueados; la restauración sigue aislada cuando no hay evidencia suficiente. Un caso bloqueado no autoriza borrar objetos ni fabricar un resultado y no impide tratar otros trabajos independientes.

Para nuevas admisiones de purga, un error anterior al intento de COMMIT permite registrar `cancelled` únicamente después de recibir confirmación de ROLLBACK. Si se intentó COMMIT, falla ROLLBACK o no se logra guardar esa evidencia, la intención permanece incierta. No se infiere cancelación de la ausencia de filas ni de la pérdida de conexión. `cancelled` resuelve solo la intención operacional: no borra recursos ni representa una purga exitosa. No puede sustituirse posteriormente por `confirmed`.

## Compactación

El mantenimiento del respaldo drena los escritores y mantiene bloqueado el inventario durante la decisión y la escritura de compactación. La limpieza física de copias precede a la compactación. Una copia `deleting` sigue protegiendo la evidencia; ni la fecha de vencimiento ni un intento fallido de borrado bastan. Se incluyen restauraciones y copias temporales con sus watermarks originales.

Se retiran pares de intención/confirmación solo cuando ningún respaldo recuperable puede preceder la confirmación y el job ha finalizado su resultado SQL. Esto evita retirar evidencia entre la confirmación externa y el resultado final. Una cancelación con rollback confirmado no requiere un job inexistente. Las intenciones sin resolver y las confirmaciones aún necesarias permanecen intactas; no frenan la retirada de otros pares independientes.

El archivo compacto conserva secuencias y hashes como anclas anónimas para validar manifiestos, sin identidades de intención, cuenta, recurso ni claves de objetos retirados. Cada ancla lleva checksum y la representación compactada completa tiene su propio checksum. Los watermarks anteriores a evidencia retirada son rechazados, incluso si alguien vuelve a presentar un dump antiguo. La secuencia no vuelve a cero.

Se escribe y sincroniza `compaction.pending`, se verifica por lectura y se sustituye `compaction.json`; solo entonces se eliminan los archivos anteriores cubiertos por esa representación. Una interrupción durante el borrado conserva la representación nueva como autoridad y el siguiente mantenimiento termina la limpieza. Corrupción, una escritura pendiente sin confirmar o un bloqueo de propietario abandonado impiden continuar automáticamente: se conserva la evidencia y se requiere reconciliación operativa, sin volver silenciosamente a una versión antigua. Los ensayos no prometen borrado forense ni supervivencia a pérdida simultánea de almacenamiento.

`createBackupRuntime().maintain()` combina retención y compactación. El programador lo llama antes de comprobar la copia diaria y antes del respaldo de preapagado; el CLI local lo utiliza también con `--cleanup`. El transporte de PostgreSQL identifica sus conexiones de mantenimiento para no confundirse con otro escritor entre dos ciclos, pero sigue rechazando aplicaciones ajenas activas.

## Pruebas ejecutadas

- **498/498** pruebas de unidades, recuperación y contratos, en 91 archivos.
- **162/162** pruebas de integración en 26 archivos, con PostgreSQL 18.7 efímero; contenedores retirados.
- TypeScript y compilación correctos.
- Escenarios añadidos: rollback conocido frente a COMMIT incierto/rollback fallido; expiración de sesión después de la intención; reanudación después de confirmar supresión pero antes de confirmar resultado; job ausente, alcance incompatible y confirmación ausente; copia derivada cuyo borrado falla; compactación integrada tras retirar la última copia; reapertura, preservación de watermarks, rechazo de dumps antiguos, limpieza interrumpida y representación dañada.

Los primeros ensayos detectaron un doble de trabajador sin el método de reconciliación y un fixture que intentaba alterar un alcance SQL inmutable. Se corrigieron los fixtures, manteniendo la protección SQL; la regresión final anterior pasó completa.

## Límites

La evidencia sigue siendo un transporte de archivos local para validar el protocolo externo. La conexión S3, sus permisos/cifrado, coordinación fuera del monolito y ensayo del entorno AWS requieren el despliegue autorizado posterior. Un caso realmente indeterminado conserva el bloqueo previsto por la especificación; este cierre no promete resolverlo inventando información. No se cambian decisiones de producto ni se completan por ello los ensayos físicos o la aceptación de la entrega.
