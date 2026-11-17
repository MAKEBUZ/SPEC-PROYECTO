# T027 — Fixtures analíticos de geometría

2026-11-15, rama patronaje, speckit-implement. T027 prepara pruebas antes de T029–T038; no implementa ni declara aprobado el motor.

## Resultado

- TypeScript estricto: correcto.
- tests/geometry/predicates.spec.ts: 79 casos ejecutados, **41 aprobados de consistencia de fixtures y 38 RED por motor aún ausente**, ninguno omitido.
- Los RED fallan explícitamente con GEOMETRY_NOT_IMPLEMENTED antes de las aserciones del motor. No son pruebas de exactitud superadas ni errores de un algoritmo ya implementado.
- Informe detallado local: .local/geometry-t027.json, ignorado por Git.

## Datos y demostraciones

Todas las entradas son coordenadas finitas en mm, sin redondeo a una malla ni dependencia de píxeles. fixtures.ts conserva resultados esperados independientes; exact-oracle.ts es solo una herramienta de pruebas para convertir binary64 a racionales e integrar polinomios de grado bajo. No implementa intersecciones, offset, validación de producción ni una alternativa al motor.

- Rectas constantes y positivas; cúbicas constantes, lazo cerrado no constante y trayectoria colineal que avanza y vuelve. La constancia se verifica algebraicamente, no solo por extremos.
- Triángulo colineal de área cero; cuadrado de área 16; cúbica cerrada con controles (0,0), (4,0), (0,4), (0,0), de área 12/5. La inversión del recorrido invierte el signo, sin convertirlo en área nula.
- Triángulo de área 2^-41 y cuadrado de lado 2^-600, cuya área exacta es 2^-1200 aunque el producto double sea cero. Estas entradas no añaden mínimos funcionales.
- Cruces de rectas, contacto extremo/interior, solape parcial y recorrido inverso.
- Parábola cúbica B(t)=(6t−3, 12(t−1/2)²): tangencia doble al eje x, dos cruces con y=3/4 y separación estricta respecto de y=−2^-40. También tangencia con la parábola reflejada y curvas coincidentes en ambos sentidos.
- Autocruce de una sola cúbica: x=96t²−96t+18, y=96t³−144t²+66t−9. B(1/4)=B(3/4)=(0,0); el determinante de tangentes es −1152. No basta revisar pares de segmentos distintos.
- Contornos con uniones normales, cierre por identidad pendiente aunque coincidan coordenadas, abertura pequeña, solape consecutivo, contacto no consecutivo y cruce con área algebraica positiva.
- Distancias de 0, 2−2^-40, 2 y 2+2^-40 mm; dimensiones de 5000 mm inclusive y excesos separados por eje. Un exterior cuadrado de 5000 mm puede proceder de base 4998 y margen de 1 mm por lado; no se declara probado el generador de ese margen.

Los contornos inválidos para producción pasan la validación estructural de borrador existente y conservan sus coordenadas y conectividad. Los tests del motor exigirán además que la consulta no modifique las entradas.

## Vinculación posterior y trazabilidad

tests/support/geometry-driver.ts define un puerto de ensayo. T031/T032 y los validadores correspondientes conectarán sus funciones reales mediante tests/support/geometry-binding.ts; este archivo no existe todavía y su ausencia produce el RED explícito. La vinculación podrá adaptar firmas, sin copiar resultados esperados, importar el oráculo como motor, clasificar por nombre de fixture ni ocultar defectos. No se introduce un módulo de pruebas en el paquete de producción.

FR-035: conectividad; FR-036: separación; FR-037/039: cruces, contactos, solapes y tangencias; FR-042/043/046: área, constancia y ausencia de mínimo; FR-044/045: límites por eje. FR-038 reutilizará estas clasificaciones al validar el contorno derivado, pero construir y conservar márgenes corresponde a T033 y siguientes. FR-040/041 requieren PDF y medición física: esta tarea no acredita exportación ni precisión de impresora.

Comando completo: tools/validation/toolchain.ps1 run test:geometry. Devuelve salida no cero mientras el motor no satisfaga los 38 casos. Para el informe: .local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/geometry/predicates.spec.ts --reporter=json --outputFile=.local/geometry-t027.json.

T027 queda completada como preparación TDD, no como aceptación de US2. T026 conserva sus dependencias. Sin cambio de decisiones, despliegue ni gasto AWS.

## Actualización T031

El estado inicial anterior queda como historial. Ya existe geometry-binding.ts y conecta constancia e integral de área al motor real. Resultado actual: 53/79 aprobados y 26 RED explícitos; ninguna omisión. Intersecciones, clasificación completa, dimensiones y separación siguen pendientes. Véase [contour-validation.md](contour-validation.md).

## Actualización T032

Estado vigente: **71/79 aprobados y 8 RED explícitos**, sin omisiones. geometry-binding.ts conecta intersecciones, autocruces e inspección del contorno a funciones de producción. Los 18 casos incorporados pasan, además de los 53 anteriores. Solo dimensiones (4 casos) y separación (4 casos) permanecen sin implementar en este puerto; la suite completa aún devuelve salida no cero por ellos. Informe local `.local/geometry-t032.json`. Evidencia adicional y límites en [intersections.md](intersections.md).

## Actualización T034

Estado vigente: **75/79 aprobados y 4 RED explícitos**, sin omisiones. Las cuatro pruebas de dimensiones están conectadas a `contourDimensions`, con extremos reales y comparación exacta inclusiva de 5000 mm. Los cuatro RED restantes corresponden exclusivamente a FR-036: contacto y separación inferior, igual o superior a 2 mm. Informe local `.local/geometry-t034.json`. Evidencia de aproximación y límites en [bounds.md](bounds.md). Los recuentos anteriores se conservan como historial.

