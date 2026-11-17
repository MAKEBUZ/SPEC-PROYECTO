# T030 — Aritmética y predicados filtrados

2026-11-15, patronaje, speckit-implement. Sin despliegues, servicios remotos ni gastos AWS.

## Implementación

packages/geometry/src/numeric.ts incorpora racionales BigInt normalizados e inmutables, denominador positivo, reducción por máximo común divisor y suma/resta/producto/división/comparación exactas. Los consumidores internos usan racionales creados por rational/fromNumber y sus operaciones. La conversión conserva exactamente el binary64 almacenado, incluidos subnormales; no reconstruye un decimal ideal ni mejora la entrada original.

Los intervalos ensanchan cada operación hacia los vecinos IEEE-754 mediante nextUp/nextDown. Los extremos infinitos se admiten como cotas conservadoras, nunca como coordenadas de geometría. Un resultado indeterminado de extremos o divisor que contiene cero produce el intervalo completo, sin inferir un signo. La división racional por cero y las entradas inválidas generan NumericError.

filteredSign acepta un signo rápido únicamente si el intervalo excluye cero. Si contiene cero, incluso [0,0], ejecuta el cálculo racional suministrado. orientation aplica este filtro al determinante de tres puntos; compareDistance compara distancia al cuadrado contra un umbral finito no negativo, sin raíz ni epsilon. Los intervalos conservadores son responsabilidad del llamador al usar el filtro genérico; los predicados incluidos los construyen internamente.

Un error técnico no se transforma en cero, falso, geometría inválida o aprobación de producción. No se introducen mínimos de longitud/área, cuantización, tolerancias topológicas ni límites de tamaño nuevos. Las decisiones de cierre, área e intersección de curvas permanecen en T031/T032.

## Pruebas

- RED inicial por módulo ausente, seguido de implementación y pruebas.
- 11 pruebas de aritmética y predicados aprobadas: normalización, valor exacto de 0,1, subnormales, operaciones racionales, cero/infinitos/NaN, vecinos IEEE, intervalos puntuales y no puntuales, cancelación, overflow/underflow y distancia de 2 mm con sus vecinos representables.
- 729 configuraciones enteras de orientación, cada una comprobada en tres permutaciones contra un determinante BigInt independiente (2187 comparaciones).
- Comprobación de que el filtro evita la rama exacta solo con signo demostrado; incertidumbre recurre al cálculo exacto y sus fallos se propagan.
- TypeScript estricto correcto.
- Regresión de unitarias y contratos: **95/95**, en 20 archivos.
- Contratos OpenAPI: correctos.

Comandos: tools/validation/toolchain.ps1 run check; .local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit/numeric.spec.ts; .local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts; tools/validation/toolchain.ps1 run contracts:check.

T030 completada. No equivale a aceptar todo el motor: la vinculación de los fixtures T027, intersecciones, márgenes y editor sigue pendiente de sus tareas. T026 conserva sus dependencias. No se declara probado rendimiento máximo ni determinismo de exportación multiplataforma.
