# T074 — validación de producción, avance 2026-11-16

Estado vigente: T074 completada funcionalmente el 2026-11-16. No habilita por sí sola la generación de PDF ni cierra T079. Los apartados de avances posteriores conservan la secuencia de validación; el cierre vigente está al final.

`packages/print/src/validate.ts` valida primero la estructura completa del documento, después únicamente las piezas seleccionadas y su preparación. Devuelve `valid`, `invalid` o `technical-error` con códigos y referencias a las piezas afectadas. Solo `valid` puede permitir continuar una futura exportación. No modifica el borrador ni repara geometría.

Implementado y probado:

- Selección de 1 a 100 piezas, referencias faltantes y metadatos obligatorios (nombre, talla, cantidad entera positiva y línea de hilo). Doblez opcional.
- Reutilización del análisis exacto de contorno y margen: cierre, segmentos constantes, área nula, cruces/contactos y márgenes inválidos.
- Tamaño de pieza hasta 5000 mm por eje, incluido su margen. Composición hasta 10000 mm por eje. Comparación algebraica antes de convertir dimensiones para paginado.
- Colocación independiente: traslación y rotación sin alterar el original. Rotaciones cardinales exactas; las demás normalizan seno/coseno para no introducir escala accidental. Extremos Bézier obtenidos por raíces de derivadas, no por la caja de los tiradores.
- Separación poligonal exacta por distancia entre segmentos; 2 mm es válido y un valor inferior se rechaza sin epsilon. Comprueba cruces y contención, incluidos márgenes esquinados.
- Las cajas exactas permiten certificar separación de curvas cuando la distancia entre cajas es suficiente. Una caja próxima o superpuesta no se interpreta como solape de las piezas.
- Integración con paginado existente: margen imprimible, gran formato y máximo 250 páginas A4/Carta. Las dimensiones numéricas de layout se redondean hacia fuera; no son el criterio de validez geométrica.

## Resolución de pendientes y aceptación posterior

1. Resuelto el cálculo de distancia en el dominio completo de los parámetros, sin exigir soporte separador local y sin interpretar un resultante nulo como ausencia de soluciones. Véase el cierre algebraico al final. Un fallo técnico sigue bloqueando la exportación; no se sustituye por aprobación ni por una clasificación geométrica inventada.
2. Pendiente en T078/T081: medir y optimizar el coste del cálculo dentro de la exportación completa, incluida la cancelación. Las pruebas funcionales de T074 no acreditan los objetivos globales de PDF ni las mediciones físicas.

La aceptación transversal sigue siendo necesaria para la entrega. No se ha añadido un límite funcional de complejidad ni un mínimo de longitud/área.

## Evidencia

121/121 pruebas en cinco archivos: `production-validation.spec.ts`, `preparations.spec.ts`, `piece-model.spec.ts`, `print-layout.spec.ts` y `predicates.spec.ts`. Las cuatro pruebas antiguas FR-036 dejaron de usar un stub pendiente y llaman a la distancia exacta de segmentos. TypeScript y build desktop correctos, con las advertencias existentes del bundle y `use client`.

La prueba combinada de Bézier rotada y consulta posterior próxima tarda aproximadamente 13 segundos en este equipo. Su primer intento superó el timeout predeterminado de 5 segundos; se fijaron 30 segundos para ese caso funcional, sin modificar ni dar por cumplidos objetivos de rendimiento. La regresión final completa duró 14,72 segundos.

No se ejecutaron ensayos físicos T039, despliegues ni operaciones AWS. Estado: 67/98 tareas completas, 31 pendientes.

## Continuación: arcos y fronteras de paginado

`path-separation.ts` resuelve distancias recta–arco y arco–arco mediante candidatos algebraicos de extremos y puntos estacionarios, intersecciones y contención con un rayo de regla semiabierta. Incluye orientación horaria/antihoraria y tangencias. Descarta pares mediante cajas exactas antes de extender los cálculos algebraicos: una ejecución inicial sin ese descarte fue interrumpida por su coste excesivo; las cinco pruebas dirigidas finales tardaron 1,38 s. Las cajas no sustituyen la prueba de distancia cuando están próximas.

Los márgenes formados por rectas y arcos se transforman conservando radios y orientación, y se recalculan sus extremos tras rotación, también no cardinal. Se prueban la separación diagonal de exactamente 2 mm entre esquinas redondeadas, valores inmediatamente inferiores/superiores, contención circular y cruces de rectas/arcos.

El paginado acepta las dimensiones algebraicas del validador y decide filas/columnas sin convertir primero la extensión a binary64. Una prueba distingue 250 páginas de exceso con una diferencia de 2^-60 mm, aunque los tamaños redondeados coincidan. La conversión numérica queda para dimensiones de salida, no para decidir la cantidad de hojas ni el límite geométrico de composición.

Validación final de esta continuación: 132/132 pruebas en seis archivos (se añade `path-separation.spec.ts`), 19,70 s; TypeScript y build desktop correctos. T074 continúa abierta por los pendientes Bézier indicados arriba. No habilita todavía generación/publicación de PDF.

## Continuación: offsets Bézier rotados y separación certificada

`offsetCriticalParameters` acepta ejes de proyección y conserva su comportamiento anterior por defecto. Los extremos rotados se encuentran proyectando la derivada de la base y añadiendo los parámetros de velocidad singular del offset. Se evalúa el offset original en esos parámetros antes de aplicar la transformación rígida; no se redondean previamente los puntos de control. Se respetan los intervalos recortados de cada tramo. Se elimina el bloqueo general de rotación no cardinal de offsets Bézier.

`certified-separation.ts` reutiliza las aproximaciones con error acotado sobre toda la trayectoria y topología preservada del motor. Aplica la misma transformación rígida, conservando la cota euclídea. Para cada par de segmentos compara la distancia algebraica con 2 mm más/menos la suma de errores: la cota inferior permite aprobar, la superior demostrar distancia insuficiente. Si las cotas no deciden, reduce la tolerancia y recalcula. No utiliza puntos muestreados como certificado. Tras probar separación de los tubos completos, comprueba contención de las polilíneas; el resultado es invariante bajo la deformación acotada entre las curvas y esas polilíneas.

El cálculo dispone de límites técnicos de trabajo (250000 pares acumulados y 24 refinamientos), además de los límites de recursos del aproximador existente. Alcanzarlos devuelve error técnico; no constituye un máximo de complejidad del producto ni clasifica la pieza como inválida. El fallback algebraico para las fronteras que no convergen sigue pendiente y por eso T074 permanece abierta.

Pruebas nuevas: extremo analítico de una parábola desplazada en un eje girado; offsets positivos enfrentados con separación válida e insuficiente; contención con bordes separados más de 2 mm; validación de offset positivo rotado 45 grados; conservación íntegra del documento. El caso antes bloqueado de curvas próximas en la regresión ahora demuestra distancia insuficiente.

Resultado: 142/142 pruebas en ocho archivos, incluidos `bezier-production.spec.ts` y la regresión `offset.spec.ts`, 30,95 s. TypeScript/build correctos. Las advertencias de build existentes permanecen. No se ha ejecutado una exportación PDF completa ni se acredita aún el rendimiento de T081. T039 físico aplazado, sin despliegues ni AWS.

## Continuación algebraica — 2026-11-16

`algebraic-elimination.ts` calcula resultantes mediante eliminación Bareiss sobre un campo ordenado, incluidos coeficientes algebraicos. `algebraic-separation.ts` elimina un parámetro de las ecuaciones de normal común entre las curvas base colocadas, recupera los parámetros mediante MCD especializado y comprueba los soportes de las fronteras exteriores completas. Incluye los extremos de cada tramo recortado, puntos críticos del offset real y extremos de arcos. Compara el cuadrado de la distancia entre soportes con cuatro veces la norma cuadrada del eje: no emplea epsilon ni aproxima la igualdad.

El certificado se intenta después del primer refinamiento indeciso. Solo aprueba si prueba separación de las piezas completas. Un par de puntos reales de offsets retenidos a menos de 2 mm prueba distancia insuficiente; en los demás casos devuelve `unresolved` y continúa el refinamiento existente. Las raíces candidatas y los puntos auxiliares por sí solos nunca autorizan exportar.

La prueba de frontera usa B(t)=(3t,3t²), una copia girada 180° y trasladada a (3,75; -1,15625), con márgenes nominales de 0,25 mm. En t=u=3/8 la normal base mide exactamente 2,5 mm: los dos márgenes dejan 2 mm. Se varía un margen en ±2^-36 mm para comprobar ambos lados sin cambiar la normal. Los tres casos se verifican en el certificado, el refinamiento integrado y `validateProduction`, incluyendo la inmutabilidad del documento. Las pruebas independientes del resultante cubren coeficientes irracionales, eliminación cuadrática y componentes comunes.

Limitación explícita: este certificado es suficiente, no un algoritmo completo de distancia mínima para cualquier par de curvas. No cierra T074 ni acredita el rendimiento de exportación. La búsqueda con raíces algebraicas de grado alto todavía requiere optimización; no se sustituyen esos casos por comparaciones aproximadas. T039 físico sigue aplazado; no se usaron AWS ni despliegues.

Validación final: 148/148 pruebas en nueve archivos, 42,25 s, sin omisiones en la regresión completa ejecutada. TypeScript y build desktop correctos; permanecen las advertencias previas de tamaño del bundle y directivas use client. Estado: 67/98 tareas completas, 31 pendientes.


## Continuación cóncava — 2026-11-16

La separación integrada usa certificados algebraicos por par de orígenes de la frontera exterior. Cada certificado incluye todos los tramos recortados o uniones que compartan ese origen, sin asumir convexidad de la pieza ni requerir un único eje para todo el contorno. Los resultados se conservan durante el refinamiento de ese par de piezas. Una identidad ausente no permite certificar una frontera vacía.

Para aprobar, todos los pares deben superar la cota certificada o disponer de prueba algebraica de distancia >=2 mm. Además se exige separación estricta de los tubos de aproximación antes de comprobar contención: certificar distancia entre fronteras no basta para descartar una pieza dentro de otra. Se mantienen la comprobación de contención y los fallos técnicos explícitos. Las normales comunes también permiten demostrar distancia insuficiente entre un punto real de offset y el punto más próximo de un tramo recto, incluidos sus extremos.

Prueba analítica: una U con extremos interiores en (6,0) y (-6,0) y tiradores (2,4), (-2,4) tiene máximo interior y=3. Una pieza en el hueco, dentro de la envolvente convexa de la U, impide cualquier separación global por recta. Se ensayan márgenes 0 y 0,25 mm y separación nominal 2 mm con perturbaciones ±2^-30 mm, en ambos órdenes. Otros dos casos usan una frontera Bézier enfrentada, rotación común de 90°, traslación y `validateProduction`; también verifican contención y ausencia de mutación.

La prueba inicial sin el cambio no terminó en el tiempo observado y se interrumpió; no se registra como resultado aprobado. Validación final: 148/148 pruebas existentes en nueve archivos (30,78 s) y 8/8 nuevas en `concave-separation.spec.ts` (42,48 s): 156/156 en total. TypeScript y build desktop correctos; advertencias existentes de bundle y use client. No se acredita todavía rendimiento global de exportación.

T074 permanece pendiente por pares de tramos sin soporte local demostrable, degeneraciones algebraicas y rendimiento. Esta continuación elimina la exigencia de separabilidad global, pero no afirma que el certificado por origen resuelva todos los pares posibles de curvas. Sin cambios de alcance, AWS ni despliegues; T039 físico sigue aplazado.

## Cierre algebraico de T074 — 2026-11-16

La ruta final de `algebraic-separation.ts` decide todos los pares de primitivas del origen cuando no encuentra soportes. Cada par usa un contexto algebraico independiente para no acumular extensiones de candidatos anteriores. `primitive-separation.ts` representa rectas, Bézier recortadas, offsets normales y arcos como P(t)+V(t)/sqrt(S(t)), conservando parámetros y transformación rígida. Rectas/arcos reutilizan su distancia analítica sin confundir una primitiva abierta con una pieza rellena. Se conserva la comprobación independiente de contención del validador certificado.

`bivariate-sign.ts` decide no negatividad sobre [0,1]²: primero certificados Bernstein de todo el dominio y contraejemplos exactos; después descomposición por proyección, raíces reales, secciones y sectores. El campo de fracciones elimina factores repetidos antes de calcular discriminantes; contenidos, denominadores, coeficientes, bordes y resultantes entre factores coprimos incorporan las fibras degeneradas. Se comprueban también las secciones, no solo muestras entre raíces. Los puntos de muestra representan celdas con signo invariante; no son una discretización geométrica.

Para offsets, multiplicar la diferencia distancia²−4 por los denominadores positivos produce R+A sqrt(S)+B sqrt(T)+C sqrt(ST). `radical-sign.ts` proyecta su norma algebraica, los lugares de coincidencia de conjugados, coeficientes y radicandos. La evaluación usa siempre las raíces positivas originales. Las coincidencias impiden intercambiar inadvertidamente una rama nula y otra no nula al degenerar la norma; por eso un resultado de elevar al cuadrado nunca autoriza por sí solo la exportación. Una normal estacionaria de orden par se reduce sin dividir por velocidad cero; una rama de normal no validada produce fallo técnico.

Pruebas nuevas: polinomios con diagonal repetida, cero idéntico, cambio de signo de una fibra, igualdad aislada y región interior negativa de 2^-60; radicales coincidentes no constantes, norma idénticamente nula y signo de la rama real; arco Bézier envolvente a 2 mm y ±2^-30 sin soporte separador, offsets hacia dentro y fuera, tangente estacionaria par, continuo de puntos más próximos y arcos concéntricos. El recorrido `validateProduction` comprueba dos piezas con tramos sin soporte local e inmutabilidad del documento.

Validación: 156/156 pruebas existentes en diez archivos (última ejecución 78,97 s) y 22/22 nuevas en tres archivos (3,61 s), 178/178 en total. TypeScript y build desktop correctos; advertencias previas de bundle y use client. Hubo pruebas iniciales que excedieron cinco segundos antes de los certificados Bernstein, simplificación de radicales constantes y contraejemplos exactos; las repeticiones finales pasan sin elevar esos timeouts. Se interrumpió una exploración algebraica costosa antes de reutilizar la distancia analítica de arcos. No se acredita rendimiento de una exportación completa por la duración de estas suites.

T074 queda marcada como completada funcionalmente. T076–T078 y la aceptación T081 mantienen generación, verificación, cancelación y rendimiento global; T079/T052 no se cierran. Estado: 68/98 completas, 30 pendientes. T039 físico aplazado. Sin despliegues, AWS, dependencias nuevas ni cambios de decisiones aprobadas.
