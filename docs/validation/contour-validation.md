# T031 — Análisis básico del contorno

2026-11-15, patronaje, speckit-implement. Sin cambios de alcance, despliegues ni gastos AWS.

## Implementación

contour-validation.ts valida la estructura y resuelve los extremos por ID. analyzeContour informa cada discontinuidad entre segmentos consecutivos, incluido último/primero; no cierra por cercanía ni coordenadas coincidentes. Un recorrido vacío no se considera cerrado. No modifica ni repara el borrador.

La longitud geométrica cero se detecta como trayectoria constante: todos los controles de la recta/cúbica deben coincidir exactamente. Una cúbica con extremos coincidentes y tiradores distintos conserva su trayectoria no constante. No se calcula una longitud aproximada ni se compara con epsilon.

El área firmada se integra exactamente con racionales BigInt sobre la base Bernstein, mediante productos de polinomios y diferencias de controles. Esta fórmula es independiente de la integración en base de potencias del oráculo de T027. analyzeContour devuelve área null en recorridos abiertos; pathIntegral se expone explícitamente como integral de trayectoria sin cierre implícito. Área algebraica positiva no acredita ausencia de cruces ni validez de producción.

Las cajas incluyen todos los controles de cada segmento y unen sus envolventes convexas. Son conservadoras y pueden ser más amplias que la trayectoria; no deciden por sí solas si se exceden 5000 mm. No se restan extremos para producir anchos que puedan desbordar, ni se incluyen puntos sueltos sin segmento. Un recorrido vacío devuelve caja null. T034 implementará las dimensiones ajustadas y las cotas necesarias para producción.

Entradas no finitas, referencias inválidas o número de controles incorrecto producen errores explícitos. No se convierten en área cero, trayectorias válidas o cajas ficticias.

## Evidencia

- RED inicial del nuevo archivo de prueba por módulo aún inexistente.
- **22 pruebas nuevas** aprobadas: constantes/no constantes, resultados analíticos de área, áreas positivas pequeñas y menores que Number.MIN_VALUE, huecos por identidad, segmento nulo, vacío, lazo cúbico, cajas conservadoras, puntos sueltos, referencias y entradas inválidas, ausencia de mutación y traslación grande con área pequeña.
- Regresión de unitarias y contratos: **117/117**, 21 archivos.
- TypeScript y OpenAPI correctos.
- T027 conectado parcialmente al código real mediante tests/support/geometry-binding.ts: **53/79 pasan, 26 RED explícitos**, sin omisiones. Los 12 casos nuevos en verde corresponden a constancia y área; las 41 comprobaciones anteriores de fixtures siguen pasando. Informe .local/geometry-t031.json.
- Las operaciones aún no implementadas del binding lanzan errores identificando la tarea pendiente. No devuelven clasificaciones esperadas ni hacen pasar intersecciones, dimensiones o separación mediante sustitutos.

Comandos: tools/validation/toolchain.ps1 run check; .local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts; tools/validation/toolchain.ps1 run contracts:check; .local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/geometry/predicates.spec.ts --reporter=json --outputFile=.local/geometry-t031.json. La suite geométrica devuelve salida no cero por sus 26 RED restantes.

T031 completada; T026 mantiene sus dependencias. Próxima tarea T032: intersecciones, raíces y coincidencias de curvas. No se declara aceptado todo US2 ni habilitada la exportación.
