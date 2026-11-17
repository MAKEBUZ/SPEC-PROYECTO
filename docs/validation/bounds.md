# T034 — dimensiones y aproximación acotada

Fecha: 2026-11-15. Implementación local en `patronaje`; sin despliegue ni recursos AWS.

## Implementación

`packages/geometry/src/bounds.ts` mide las trayectorias mediante extremos algebraicos: extremos del intervalo y raíces de las derivadas para Bézier; extremos críticos del offset retenido; extremos cardinales pertenecientes a cada arco. Las puntas miter forman parte del camino medido. Devuelve caja, ancho, alto, comparaciones inclusivas con 5000 mm y ejes excedidos. Los errores de tamaño del margen conservan también sus valores exactos cuando se ha podido construir y medir la trayectoria. La caja de controles no decide la aceptación.

La aproximación parte exclusivamente de márgenes certificados por T033. Conserva la distinción entre margen ausente, geometría inválida y fallo técnico. Los márgenes cero con Bézier se aproximan sobre el propio contorno. No modifica el documento, los márgenes solicitados ni las esquinas.

La tolerancia predeterminada es el racional 1/100 mm; el consumidor puede solicitar una menor. Cada segmento devuelve vértices racionales, origen, intervalo local normalizado de la primitiva retenida y cota de error. En un offset recortado ese intervalo local no es el parámetro original del contorno base. Las dimensiones se calculan sobre el origen exacto, no sobre la aproximación.

## Justificación de la cota

Para cada intervalo local de longitud h se encierra la segunda derivada completa mediante intervalos racionales. La desviación respecto de la cuerda es como máximo h²·(Mx+My)/8, usando cotas de los valores absolutos de ambas componentes de la segunda derivada. Se suma el máximo error L1 de los extremos racionalizados. L1 acota la distancia euclídea. No se decide la cota comparando únicamente muestras.

La normal se calcula sobre la derivada reducida de la Bézier, conservando el signo de la rama retenida. Su segunda derivada se encierra mediante la fórmula de v/|v|. Los arcos usan la normalización de la interpolación entre sus radios extremos: recorre el arco menor real, sin aproximar ángulos con trigonometría. Las raíces cuadradas se encierran hacia fuera con enteros y racionales; no se usan épsilon ni redondeos binarios para aceptar topología.

Después se valida exactamente la polilínea racional completa: cierre, segmentos no constantes, contactos, cruces, solapes y área positiva; se conserva el sentido del contorno. Si falla, se refina sin reparar ni fusionar detalles. Los extremos compartidos proceden de la misma caja certificada. El presupuesto inicial se adapta al ancho y dimensiones positivas, evitando imponer un tamaño mínimo a detalles diminutos. La comprobación de tamaños sigue usando el margen exacto incluso en el límite inclusivo de 5000 mm.

Hay presupuestos técnicos de trabajo para refinamiento y número de segmentos. Agotarlos genera un error técnico, nunca una clasificación geométrica válida o inválida, ni un cambio del borrador. No representan nuevos límites funcionales de tamaño.

## Pruebas

- RED inicial: importación de `bounds.ts` ausente.
- Diez pruebas específicas: extremos reales de una Bézier cuya caja de controles excede el límite; límite inclusivo y exceso positivo; mezcla round/miter; escala 2^-600; offset positivo Bézier con tolerancias 0,01 y 0,001 mm; margen cero y rechazo de margen inválido; valores excedidos incluidos los márgenes; cierre, orientación inversa y determinismo; medida exacta en 5000 mm; Bézier cerrada diminuta con margen cero.
- El offset de una parábola se contrasta además con una expresión analítica independiente en puntos interiores de cada segmento. Es una regresión complementaria, no la prueba de la cota continua.
- `tests/support/geometry-binding.ts` conecta dimensiones al motor real. T027: 75/79 aprobadas, cuatro RED de separación entre piezas, ninguna omitida. Informe local `.local/geometry-t034.json`.
- TypeScript y verificación OpenAPI correctos. Regresión final: **195/195 en 29 archivos**, 55,96 segundos en esta ejecución local. Comando: `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts`. Diez casos específicos aprobados con `run tests/unit/geometry-bounds.spec.ts`.

## Límites de esta evidencia

No acredita el objetivo de rendimiento a capacidad máxima, aceptación transversal T038, separación entre piezas de una preparación ni generación/medición de PDF. La separación requiere emplear las cotas y refinar frente a otras trayectorias en su validador correspondiente. Los futuros consumidores CAD/PDF deben conservar el presupuesto al convertir los racionales a su representación; convertirlos sin control a `number` no queda certificado por esta tarea. La precisión física de impresora sigue siendo una validación independiente.
