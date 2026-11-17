# T029 — Modelo geométrico y piezas

2026-11-15, patronaje, speckit-implement. Implementación local sin despliegue ni gasto AWS.

## Cambios

packages/geometry/src/model.ts define Coordinate, Point, LineSegment, CubicSegment, Segment, Contour y CornerJoin. Usa coordenadas finitas en mm, IDs estables y referencias explícitas. Rechaza propiedades ajenas, IDs repetidos entre puntos/segmentos, referencias inexistentes y tiradores no finitos. No depende de Three.js, React ni servicios remotos.

hasExplicitClosure comprueba solo la conectividad de los segmentos ordenados, incluido último/primero. No fusiona puntos por cercanía ni igualdad de coordenadas, no modifica el contorno y no certifica área o validez de producción. Un contorno sin segmentos no se considera cerrado.

packages/document/src/piece.ts define Piece y su validación estructural, integrada en schema.ts para evitar dos validadores divergentes. Se conservan nombres/tallas vacíos, cantidad pendiente o finita no apta para producción, hilo pendiente, contornos abiertos y demás borradores estructuralmente válidos. Un margen negativo o no finito sigue rechazándose.

createPiece crea un borrador independiente de la entrada. withCornerDefaults copia y completa únicamente las elecciones ausentes como miter; conserva round/miter existentes. La lectura de un documento nunca llama implícitamente a ese helper ni cambia esquinas o la revisión. Las operaciones futuras de T035 lo usarán explícitamente al incorporar puntos/esquinas.

productionMetadataIssues aplica solo FR-279: nombre y talla no vacíos, cantidad entera positiva y dirección de hilo definida. Una línea con extremos coincidentes no define dirección. Corte al doblez es opcional. La lista vacía no certifica geometría, márgenes, tamaño ni exportabilidad; esos controles siguen en tareas posteriores.

## Validación

1. Ejecución inicial del nuevo test: RED por módulos todavía inexistentes, antes de implementar.
2. TypeScript estricto: correcto.
3. 11 pruebas nuevas del modelo; junto con las 13 de documento, 24/24 aprobadas.
4. Regresión completa de unitarias y contratos: **84/84**, en 19 archivos.
5. Contratos OpenAPI: correctos.
6. Fixtures de T027 tras integrar el modelo: 41 comprobaciones analíticas aprobadas; permanecen los mismos 38 RED del motor no implementado, sin omisiones. Informe .local/geometry-t029.json. No se sustituyó su vinculación por respuestas ficticias.

Se probaron cierre por identidad, curvas y tiradores, finitud y referencias, IDs duplicados, creación sin alias mutable, conservación de decisiones de esquina, separación entre borrador y metadatos de producción, margen inválido e ida/vuelta JSON con revisión estable.

Comandos: tools/validation/toolchain.ps1 run check; .local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts; tools/validation/toolchain.ps1 run contracts:check; .local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/geometry/predicates.spec.ts --reporter=json --outputFile=.local/geometry-t029.json. La última suite sigue devolviendo salida no cero por los RED esperados.

T029 completada. T026 mantiene sus dependencias; T030 continúa con aritmética y predicados numéricos. T031–T038 siguen pendientes para validación geométrica, comandos, herramientas y aceptación del editor.
