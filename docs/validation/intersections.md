# T032 — Intersecciones Bézier y raíces polinómicas

2026-11-15, rama patronaje, speckit-implement. Implementación local; sin modificación de decisiones aprobadas, despliegue ni uso de AWS.

## Implementación y garantías

`polynomials.ts` opera con los racionales BigInt exactos de T030. Implementa división, MCD, reducción libre de cuadrados, secuencias de Sturm, aislamiento de raíces reales dentro de un intervalo racional y multiplicidades. Los extremos se tratan separadamente; las raíces interiores se aíslan sin epsilon. El polinomio nulo no se confunde con ausencia de raíces. Las extensiones ordenadas por raíces aisladas permiten determinar signos, dividir y resolver fibras algebraicas sin emparejar aproximaciones flotantes. Los factores ajenos a la raíz elegida se eliminan cuando una división lo requiere.

La eliminación usa la resultante de Sylvester sin división en el anillo de coeficientes. Se limita explícitamente a matrices de tamaño 6, suficiente para los pares de polinomios cúbicos de esta tarea; grados superiores producen un error técnico. La proyección puede alcanzar grado nueve. Cada raíz proyectada se verifica mediante MCD de las dos ecuaciones en su fibra: una raíz de la resultante por sí sola no acredita una intersección.

`intersections.ts` convierte controles rectos/cúbicos a polinomios exactos. Devuelve contactos con certificados racionales de parámetros y reconocimiento exacto de extremos. Distingue cruces transversales, cruces de orden impar con tangentes paralelas y tangencias de orden par mediante series locales. Un contacto entre dos parametrizaciones singulares se informa como contacto bloqueante, sin atribuirle un orden no demostrado. Las cajas conservadoras solo permiten descartar pares estrictamente separados.

Los componentes colineales se comparan por sus rangos exactos, incluidos extremos interiores y recorridos de ida y vuelta. Para componentes no lineales coincidentes se verifica una identidad de reparametrización afín; se distingue solape positivo de contacto puntual. Los autocruces se obtienen eliminando la diagonal t=u de las ecuaciones, conservando parámetros distintos. Esto también detecta cruces aislados entre partes de un mismo componente que no se solapan. Una curva constante genera contactos puntuales, no solape de longitud positiva.

La inspección del contorno incorpora T031 y clasifica cruces, contactos, tangencias y solapes. Excluye solo las uniones ordinarias de extremos con conectividad explícita, incluido el cierre de un único tramo cúbico. No excluye todos los contactos de un par por ser adyacente. No modifica controles, IDs, tiradores ni borradores. Los errores técnicos se propagan; no se convierten en ausencia de intersecciones ni validez de producción.

## Evidencia ejecutada

- **30 pruebas nuevas** en `tests/unit/geometry-polynomials.spec.ts` y `tests/unit/geometry-intersections.spec.ts`: raíces múltiples y extremos, conteo abierto ante raíces repetidas, raíces irracionales, inversión con factores ajenos, separación dyádica 2^-600, eliminación, cruces/tangencias en ambos órdenes, sistema de grado nueve, fibras con varios parámetros, coincidencias parciales, autocruces entre partes coincidentes, retrazado colineal, constantes, cierre normal de un lazo, invariancia por escala/traslación/inversión y ausencia de mutación.
- Regresión de unitarias y contratos: **147/147**, 23 archivos.
- TypeScript estricto y comprobación OpenAPI correctos.
- T027: **71/79 aprobados, 8 RED explícitos**, ninguno omitido. Los 18 casos anteriormente pendientes de intersecciones, autocruces e inspección del contorno pasan con el motor real; dimensiones y separación mantienen errores de tarea pendiente.
- El ciclo TDD de intersecciones parte de los casos RED existentes de T027. Las pruebas unitarias adicionales profundizan esa cobertura; no se presenta su primera ejecución como RED de un módulo inexistente.

Comandos: `tools/validation/toolchain.ps1 run check`; `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts`; `tools/validation/toolchain.ps1 run contracts:check`; `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/geometry/predicates.spec.ts --reporter=json --outputFile=.local/geometry-t032.json`. Este último conserva salida no cero por los ocho RED declarados.

T032 completada. T033 implementará márgenes y uniones; T034, cotas y dimensiones. La aceptación integral de geometría/editor sigue en T038 y la impresión en US6. Esta evidencia no acredita rendimiento de composiciones máximas, offsets, PDF ni aceptación completa de US2. T026 mantiene sus dependencias. No existe `.specify/extensions.yml`; no hay hooks posteriores que ejecutar.
