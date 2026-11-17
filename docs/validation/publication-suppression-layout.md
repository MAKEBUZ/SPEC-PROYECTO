# Publicación, evidencia de supresiones y paginado

Validación local del 2026-11-15. Rama patronaje; sin despliegue ni AWS.

## Publicación — T040/T047

Las 15 pruebas de `tests/integration/publication.spec.ts` pasan contra PostgreSQL 18.7 efímero. Incluyen caída antes/después de escribir el objeto, fallo al releerlo, fallo SQL al confirmar la recepción y rollback del commit; reintentar conserva identidad, reserva y versiones anteriores. La prueba de pérdida de respuesta repite la misma operación y comprueba que no crea otra versión. Versiones en papelera siguen consumiendo cuota.

Se rechazan tamaños declarados mayores de 100000000 bytes antes de consumir la carga. El máximo inclusivo se prueba en el manifiesto; no se presenta como transferencia ejecutada de un archivo de 100 MB. Los cuerpos reales se verifican por tamaño, tipo, contenido editable y hash; la validación completa de PDF depende de T080. El controlador aún acumula la carga en memoria: falta cerrar la estrategia de streaming y capacidad antes de dar T047 por terminada. T040 conserva pendientes las fronteras de PDF y del recorrido integrado.

## Evidencia externa — T087/T092 parciales

`LocalSuppressionLog` implementa el transporte local de ensayo separado del dump: intención y confirmación, identificadores opacos, escritura exclusiva, flush, relectura, secuencia y encadenamiento de hashes. La identidad repetida es idempotente solo si conserva el contenido. No admite nombres ni correos en el alcance.

Cuatro pruebas cubren reapertura, corrupción, cambios de identidad, confirmaciones huérfanas, entradas concurrentes, captura inmutable y watermark. Una intención sin confirmar mantiene la restauración aislada. Si la intención precede al respaldo pero la confirmación es posterior, se incluye la supresión. Una cadena alterada o truncada no autoriza restaurar.

Esto todavía no ejecuta purgas ni restaura PostgreSQL. Faltan integración con jobs, borrado de objetos/metadatos, reconciliación y retención ligada a respaldos recuperables. El directorio presupone un único escritor operativo; no equivale al backend externo de producción ni a su aceptación. T087/T092 permanecen abiertas.

## Paginado — T075 completada

Doce pruebas del módulo de paginado pasan: A4/Carta, escala 1:1, márgenes uniformes, cobertura de la composición, orden por fila/columna, solape de 10 mm, máximo inclusivo de 250 páginas con dos auxiliares y rechazo de una baldosa adicional. El gran formato conserva las piezas y añade una franja inferior para auxiliares; el ancho permite el cuadrado de prueba aunque la pieza sea diminuta.

El módulo requiere dimensiones ya validadas de la selección. Se cierra solo T075: no demuestra la geometría/separación T074, el PDF T076/T077 ni impresión física T081. Las cuatro pruebas RED de separación siguen pendientes y no forman parte de la regresión local seleccionada.

## Consultas pendientes — T055 completada

Se valida el coordinador existente con seis pruebas: sesión/cuenta/conexión, consulta única, pausa persistida entre coordinadores, comprobación manual sin quitar pausa, suspensión por falta de permiso o resultado, esperas crecientes conservadas y continuidad incierta. Una respuesta para otra operación no resuelve el pendiente. Un fracaso confirmado libera bloqueos y permanece resuelto; el coordinador no dispone de transporte para repetir mutaciones.

Los bloqueos se aplican al alcance dependiente y permiten operaciones independientes. La persistencia y los rechazos de escritura se cubren además en las pruebas del journal. T056/T061 siguen pendientes para interfaz y conexión de todas las mutaciones; cerrar T055 no declara terminada esa integración.

## Regresión

- Regresión local con dos trabajadores: **313/313**, 52 archivos, 83,21 s. Incluye las cuatro pruebas de supresión y doce de paginado. Las cuatro pruebas adicionales de consultas pendientes se ejecutaron después: archivo completo **6/6**.
- TypeScript: correcto tras los cambios finales.
- Integración PostgreSQL ejecutada por separado: **124/124**, 17 archivos, 23,37 s; contenedor retirado. El intento anterior concurrente tuvo un timeout de inicialización en autenticación (102 pasadas, 22 omitidas); la repetición completa pasó sin cambiar aserciones ni timeouts.
- El primer intento amplio encontró restricciones del sandbox; el siguiente tuvo un timeout de 5 s en el índice de contraseñas bajo concurrencia. La repetición con dos trabajadores mantuvo todas las aserciones y tiempos originales y pasó. No se aumentaron límites para ocultar fallos.
