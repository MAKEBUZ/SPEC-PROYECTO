# T078 — certificados exactos y coste algebraico

El diagnóstico separó inspección del contorno, dimensiones, margen y aproximación. En el caso pequeño de `performance-corpus.ts`, la inspección y las dimensiones tardaban decenas de milisegundos; el atasco estaba en la validación del margen. Una pareja particular era el offset Bézier y el conector recto de su propia esquina esquinada.

## Tangente de soporte desplazada

`supportingEndpointHits` no descarta intersecciones por cercanía. Comprueba exactamente que la recta pase por un extremo del offset y sea perpendicular a su normal. Después proyecta todos los controles Bézier sobre esa normal: deben quedar del lado interior del soporte base, con al menos uno estrictamente interior.

Todos los pesos de Bernstein son positivos dentro de `(0,1)`. Por tanto, toda posición interior de la curva base queda estrictamente dentro de ese semiplano. La contribución de una normal unitaria de ancho `d` sobre el eje de soporte es como máximo `d`; no puede alcanzar la recta desplazada hacia fuera. Las únicas intersecciones posibles son extremos, que se comprueban exactamente y se filtran contra el segmento finito. Si falta una premisa, se conserva la resolución algebraica general. El caso colineal completo no usa el certificado y mantiene la detección de coincidencias.

## Extremos y signo de curvatura

La búsqueda de extremos incluye las raíces de las proyecciones de la tangente base. Si la curvatura con signo exterior es no negativa en todo el intervalo, el factor de velocidad del offset es positivo: no hay ceros adicionales de ese factor. Esta condición se prueba en los extremos y puntos críticos del polinomio, usando aritmética exacta. Si no se prueba, se conserva la ecuación general y su aislamiento de raíces. Los parámetros estacionarios de la base siguen incluidos por las proyecciones y el tratamiento de ramas no se elimina.

## Intervalos algebraicos

- Los polinomios cuadráticos racionales sin raíces en el intervalo pedido se descartan mediante aislamiento exacto antes de introducir radicales ajenos a ese intervalo en el campo algebraico.
- Para extensiones de grado superior a dos sobre coeficientes racionales se refinan hasta 32 veces los intervalos racionales antes de recurrir al GCD y Sturm general. Solo un intervalo estrictamente positivo o negativo certifica un signo; la incertidumbre conserva el procedimiento exacto de igualdad. No se introduce epsilon, redondeo geométrico ni un límite nuevo del producto.

Las pruebas específicas están en `tests/unit/geometry-support.spec.ts`: ambas orientaciones, soporte finito que excluye el extremo, intersección interior real, raíces cuadráticas en los extremos y comparaciones algebraicas con igualdad exacta. Las suites existentes de márgenes, intersecciones, contactos y exportación deben seguir aprobando antes de cerrar T078. Los resultados completos y límites de hardware se registran en `performance.md`.

## Conversión de piezas repetidas

La escena conserva una plantilla numérica por geometría y rotación, solo dentro de esa evaluación. Resta primero el mínimo exacto de cada pieza y convierte después; la traslación entre piezas se obtiene también de diferencias exactas. Para controles relativos de hasta un millón de milímetros, el error acumulado de ambas conversiones y la suma es inferior a 0,00000003 mm. Los controles fuera de ese rango conservan la conversión exacta original, sin introducir un límite de producto. Metadatos y marcas siguen siendo propios de cada pieza. La verificación independiente crea sus propias plantillas.

La regresión detectó un coste excesivo al refinar intervalos sobre torres algebraicas para una tangencia con igualdad exacta. Se restringió esa optimización a extensiones sobre racionales; los campos anidados conservan el algoritmo anterior. Después de corregirlo aprobaron 150/150 pruebas en 20 archivos de geometría e impresión, incluida una traslación común de 10^12 mm con desplazamientos relativos fraccionarios. TypeScript y build desktop correctos. Esto no sustituye las diez mediciones por carga ni la aceptación del equipo de referencia.

## Certificado y recortes reutilizados

`evaluateMargin` valida una copia privada del origen y ofrece la aproximación de ese mismo estado. La escena utiliza el certificado capturado durante la validación de producción; la lectura independiente del PDF vuelve a validar desde el documento. Una prueba modifica el origen después de capturarlo y comprueba que la aproximación anterior permanece igual y que una evaluación nueva rechaza el contorno ahora abierto.

Para un recorte Bézier–recta se conservan **todas** las intersecciones de la curva con el segmento original. El recorte solo acorta ese segmento; la validación global filtra las intersecciones por proyección exacta sobre sus extremos nuevos y por el dominio retenido de la curva. No se sustituye la búsqueda por la única intersección elegida como esquina: un segundo cruce conservado sigue invalidando el margen. Las conexiones de vértice tienen otra identidad y no utilizan este registro.

## Exclusión de pares y conversión racional

Los contornos almacenados usan cajas de sus controles finitos ya validados; los tramos derivados usan cajas exactas de extremos o del círculo completo. Solo se omiten pares con separación estricta de cajas. Una igualdad conserva el ensayo de intersección, por lo que contactos y tangencias no desaparecen. La comparación de dos racionales del mismo contexto usa productos cruzados exactos sin calcular el GCD de una diferencia intermedia.

Para convertir un racional a coordenada PDF se prueba primero una estimación binaria. Se acepta únicamente si la diferencia racional exacta está dentro de ±0,000000005 mm. Si no puede certificarse, se conserva la bisección anterior. No se cambia la tolerancia CAD–PDF ni se aproxima una decisión de validez geométrica.

La escena usa el límite certificado de aproximación de 0,01 mm del motor. Sumado al cotejo de trayectorias de 0,02 mm y la conversión numérica, permanece por debajo de los 0,1 mm aprobados. Regresión final del build medido: **152/152 pruebas en 20 archivos**. Las 50 exportaciones, 30 cancelaciones y cinco comparaciones Windows/Linux están registradas individualmente en `pdf-performance-results.json`.

