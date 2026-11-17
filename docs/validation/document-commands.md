# T035 — comandos reversibles y deshacer/rehacer

Implementación local en `patronaje`, 2026-11-15. Sin cambios de alcance, servicios externos, despliegue ni gastos AWS.

## Comportamiento implementado

`packages/document/src/commands.ts` ofrece `DocumentCommands`, propietario de una copia del documento, y comandos tipados de creación de piezas/puntos/tramos, edición de coordenadas y tiradores, subdivisión de rectas/Bézier, eliminación de puntos, cierre explícito, movimiento, duplicado, rotación, reflexión, eliminación de piezas, márgenes, esquinas y datos/marcas.

Cada acción se aplica a una copia y valida toda la estructura antes de registrar el cambio. Un fallo no altera documento ni historial. Se admiten borradores geométricamente inválidos y datos incompletos según el modelo existente; el ancho negativo/no finito y coordenadas no finitas se rechazan. No se incorpora validación de producción al editor de borradores.

El historial conserva estados anterior/posterior. Deshacer restaura coordenadas e identidades exactas; rehacer reutiliza los mismos IDs, sin volver a generar el duplicado ni ejecutar transformaciones inversas aproximadas. Una edición efectiva tras deshacer elimina la rama de rehacer. Cancelaciones, errores y acciones sin cambios la conservan. Las instantáneas entregadas al consumidor son copias independientes.

Eliminar piezas o puntos exige `confirmed: true`. Los puntos eliminados retiran sus segmentos incidentes y configuración de esquina, sin inventar una reparación del contorno. Las referencias de preparaciones a piezas eliminadas se conservan para su validación posterior. La confirmación visual corresponde a T036; el núcleo no consulta backend.

La subdivisión usa de Casteljau para Bézier y asigna nuevas identidades al punto y al segundo tramo. El cierre de una cadena ordenada añade la recta final; si sus extremos ya coinciden en coordenadas, la acción explícita une sus identidades conservando la esquina inicial. No se cierra por proximidad ni se aplica snapping implícito. Mover un punto o tirador afecta solo al elemento solicitado; transformar la pieza completa transforma además sus tiradores e hilo.

Duplicar reasigna IDs de pieza, puntos, segmentos y referencias de esquina, sin compartir objetos ni añadirla automáticamente a preparaciones. Las transformaciones no cambian el ancho de margen ni datos textuales. Rotaciones de cuartos de vuelta tienen coeficientes exactos; las demás usan binary64, como el modelo aprobado. No hay escalado en estos comandos. Se rechazan resultados no finitos y colapsos de coordenadas distintas por pérdida de precisión. Deshacer no acumula redondeos.

`dirty` compara contenido con la instantánea cuyo guardado se confirmó. `markSaved(snapshot)` debe invocarse únicamente tras éxito del guardado; cambios realizados durante un guardado asíncrono siguen pendientes. Guardar no añade un comando de edición ni se deshace el encabezado de la revisión guardada. La generación del hash y persistencia continúan en sus módulos/tareas de guardado, no en este núcleo.

## Validación y límites

RED inicial comprobado por ausencia de `commands.ts`. Después pasan **16 pruebas específicas** en `tests/unit/document-commands.spec.ts`: historial/ramas/dirty; rollback y aislamiento; transformación de tiradores e hilo; rotación positiva, negativa, diminuta y reflexión; identidades de duplicados y redo; confirmación y referencias de preparaciones; cierre y borradores inválidos; márgenes/esquinas/marcas; inserción/eliminación; coordenadas no finitas y pérdida de precisión; subdivisión Bézier analítica; creación/edición sin snapping; colisiones de IDs; unión explícita de extremos; guardado asíncrono; invariancia de distancias en rotación arbitraria/reflexión oblicua.

TypeScript y verificación OpenAPI correctos. Comando específico: `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit/document-commands.spec.ts`.

Regresión: **211/211 pruebas en 30 archivos**, 58,29 segundos, con `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts`. Tras ajustar la normalización de rotaciones negativas/diminutas se repitieron los 16 casos específicos y TypeScript, ambos correctos.

Estos son comandos del dominio, no la interfaz del CAD. T036/T037 siguen pendientes; no se reemplazó el driver E2E con un simulador ni se marcaron sus 27 escenarios como aprobados. T038 conserva la aceptación integrada y rendimiento, incluido el consumo de memoria del historial de instantáneas. El historial vive en la sesión y no se serializa en el documento.
