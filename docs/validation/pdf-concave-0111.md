# Margen cóncavo y rendimiento — 0.1.11

2026-11-17. Código: 1c22268dfb131dd6119a79dc0215a74cbe578026. Sin AWS ni cambios de alcance.

## Resultado y limitación

El archivo comunicado por el usuario contiene un entrante redondeado con margen de 10 mm. Se reprodujo la demora fuera de la aplicación instalada: la intersección recta–offset Bézier genera una ecuación de grado 10 con coeficientes algebraicos. Reinstalar no soluciona ese cálculo.

Con la corrección, la prueba completa de escritorio responde en **9.16 s** con un diagnóstico de **recorte local ambiguo**. Conserva el documento, el ancho de 10 mm y cualquier PDF anterior, y devuelve la edición. **Este resultado no es una exportación exitosa:** el motor encuentra candidatos incompatibles para una única unión cóncava y bloquea el PDF, manteniendo el estado de error técnico. No se atribuye sin prueba un defecto definitivo a todo el margen ni se modifica la geometría para forzar una salida.

La curva offset sin recortar presenta cruces certificados; ello no sustituye la validación del tramo retenido. El nuevo certificado de cruce se aplica al interior del tramo que queda después de los recortes cuando estos se han resuelto. Un resultado negativo de ese certificado no prueba validez: continúa la comprobación algebraica completa.

El caso oblicuo exportable de la regresión anterior, también con margen de 10 mm, termina en **13.26 s**, incluidos generación, verificación independiente, guardado nativo y registro del catálogo. Ambos tiempos se midieron con Electron 45.3.2, en este equipo Windows x64 y con perfil temporal sin red. No garantizan tiempos universales.

## Corrección

- Aislamiento exacto por variaciones de Bernstein para raíces simples; Sturm permanece como respaldo para multiplicidades, extremos o casos no certificados.
- Refinamiento de intervalos por signos exactos y ramas algebraicas independientes, sin incorporar radicales ajenos ni calcular todas las coordenadas candidatas anticipadamente.
- Cotas racionales conservadoras de puntos y parámetros descartan únicamente soluciones demostrablemente fuera del segmento. Los extremos inciertos conservan la resolución exacta.
- Se conservan certificados al importar valores exactos y se evitan inversiones algebraicas repetidas. Las cotas de expresiones equivalentes no sustituyen el valor exacto.
- Certificado de cruce mediante cotas de derivadas e intervalo bidimensional. El muestreo/Newton solo propone candidatos; jamás decide una intersección por sí solo.
- Aviso específico ante AMBIGUOUS_LOCAL_TRIM, sin exponer únicamente el código interno ni sugerir que se guardó un PDF.

No se cambian escala 1:1, precisión de 0,1 mm, margen guardado, contorno base ni política de no cancelar automáticamente por tiempo. El archivo personal original conserva su hash; no se borró ni reinstaló la aplicación y no se alteraron recuperaciones.

## Evidencia automatizada

| Comprobación | Resultado |
| --- | --- |
| TypeScript / build | Correctos |
| Regresión unit/geometry/print y catálogo/guardado PDF | 551/551 |
| Verificación final de geometría y PDF tras acotar el refinamiento a ramas de intersección | 276/276; se solapa con la anterior |
| E2E cóncavo | 9.16 s; error explícito; documento, 10 mm y PDF previo intactos |
| E2E exportable oblicuo | 13.26 s; PDF completo y verificado |
| E2E exportación/cancelación/metadatos inválidos | Correcto |
| Paquete 0.1.11 | Inicio, nombre, dos relanzamientos con instancia única y recursos nativos correctos |

Pruebas relevantes: tests/unit/geometry-concave-certificates.spec.ts, tests/unit/geometry-polynomials.spec.ts, tests/unit/geometry-offset-intersections.spec.ts, tests/e2e/pdf-concave-performance.spec.ts, tests/e2e/pdf-rounded-performance.spec.ts y tests/e2e/pdf-export.spec.ts. La fixture conserva solo geometría, sin identificadores ni nombres personales.

## Instalador y pendientes

PATRONAJE-0.1.11-Setup.exe; 186644992 bytes; SHA-256 fa17b1bc72b7d1f6699fca6bbf7e2617aad4b5407139236beea838f910061c5c. Artefacto local, no incluido en Git. Instalación y aceptación manual pendientes. No se cierran ensayos físicos ni aceptación integral. Resolver geométricamente el recorte ambiguo de esta pieza sigue pendiente; no se ha prometido un PDF conservando simultáneamente una unión no resuelta.
