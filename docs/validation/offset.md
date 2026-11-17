# T033 — Construcción y validación de márgenes

2026-11-15, patronaje, speckit-implement. **Estado vigente: T033 completada; regresión 185/185, TypeScript y OpenAPI correctos.** Sin cambios de alcance, despliegues ni gastos AWS. Los dos avances siguientes se conservan como historial; la evidencia vigente y las limitaciones están en «Cierre de T033», al final.

## Implementado

`offset.ts` consume contorno, ancho y elecciones por vértice sin depender del paquete de documento. Valida estructura, ancho finito no negativo y referencias de esquinas. Distingue margen ausente, base geométricamente inválida, margen cero coincidente y candidato positivo pendiente de validación. No cambia el objeto recibido ni sus configuraciones.

Los candidatos conservan controles originales, identidad de origen, ancho, orientación, raíces estacionarias y uniones. La evaluación en parámetros racionales usa O(t)=B(t)+d·N(t) con normales algebraicas exactas, sin redondear raíces cuadradas a binary64. Un ancho cero no requiere dividir por velocidad. En extremos estacionarios calcula la tangente lateral mediante la primera derivada no nula; un parámetro estacionario interior positivo produce un error explícito hasta resolver sus límites laterales.

`joins.ts` clasifica con signos racionales las uniones suaves, convexas round/miter, cóncavas y de inversión. Las geometrías derivadas incluyen centro, radio, extremos desplazados e intersección exacta de soportes tangentes cuando existe. No aplica MiterLimit, bisel ni truncamiento. La intersección de soportes de una concavidad curva no se presenta como la intersección real de sus offsets. La forma circular se conserva conceptualmente; todavía no se genera una aproximación certificada para renderizado/PDF.

Se expuso `curvePolynomials` desde el módulo de intersecciones para reutilizar su conversión exacta de controles. Las pruebas de T032 siguen pasando. No se usa muestreo para afirmar validez topológica ni se declara un candidato válido porque tenga puntos calculables.

## Evidencia ejecutada

- RED inicial: el archivo de prueba no pudo importar el módulo de offset, todavía inexistente.
- 11 pruebas nuevas aprobadas: ausencia/cero, mezcla round/miter, normales exteriores en ambos sentidos, borrador inválido sin modificación, anchos rechazados, punta mayor que 5000 mm conservada sin truncamiento (no aceptada para producción), radios exactos con normales irracionales, concavidad, extremos estacionarios, rechazo explícito de velocidad interior cero y distancia normal exacta sobre una curva.
- Regresión: **158/158**, 24 archivos de unitarias y contratos.
- TypeScript y OpenAPI correctos.
- T027 mantiene **71 aprobados y 8 RED de dimensiones/separación**, sin omisiones. Informe local `.local/geometry-t033.json`; no es una batería de aceptación del offset.

Comandos: `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts`; `tools/validation/toolchain.ps1 run contracts:check`; `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/geometry/predicates.spec.ts --reporter=json --outputFile=.local/geometry-t033.json`. La comprobación OpenAPI ejecuta también TypeScript. La última suite conserva salida no cero por los ocho pendientes conocidos.

## Pendientes históricos tras el primer avance

1. Resolver y separar los intervalos estacionarios con límites laterales, sin ocultar singularidades.
2. Recortar extremos adyacentes cóncavos hasta la intersección local real del offset; no realizar unión booleana global.
3. Completar y validar las entidades derivadas, incluidos cierre, contactos, cruces y área; distinguir margen inválido de fallo técnico.
4. Integrar las cotas y dimensiones de T034 antes de aceptar el resultado para producción; certificar arcos y offsets en todo el intervalo, sin usar solo muestras.

Los resultados positivos permanecen explícitamente `validation: 'pending'`. Ninguna ruta de esta implementación autoriza exportación o convierte esos pendientes en margen inválido. T033 no está marcada como completada y T034 no se considera implementada. No existe `.specify/extensions.yml`: no hay hooks posteriores.

## Segundo avance — recortes y validación exacta

El estado anterior se conserva como historial. T033 sigue sin completarse, pero ya no todos los márgenes positivos quedan pendientes.

### Recortes y puntos estacionarios

`resolveConcaveOffsets` resuelve recta–recta y recta–Bézier sobre las trayectorias desplazadas reales. La ecuación polinómica de la Bézier genera candidatos por aislamiento exacto; la ecuación original con signo elimina las raíces espurias introducidas al elevar al cuadrado. La selección exige el primer encuentro compatible al retroceder por el extremo entrante y avanzar por el saliente. Encuentros incomparables producen error técnico explícito, no selección arbitraria. Se rechazan recortes fuera de los dos tramos adyacentes y tramos consumidos o invertidos; no se aplica unión booleana global. El resultado local no constituye una certificación global de un margen curvo.

`splitStationaryOffset` devuelve parámetros exactos, intervalos separados y ambos límites laterales. Una cúspide conserva sus dos límites distintos; no se inventa un conector. Un cero estacionario par con normal continua puede evaluarse sin división por cero, incluido el evaluador público anterior. Las rutinas de intersección exigen una rama de normal continua; una inversión interior pendiente de separación produce error técnico.

### Validación incorporada

`validateOffset` construye y certifica márgenes de contornos con soportes rectos, incluso cuando el soporte se almacena como una Bézier colineal sin retrazado. Combina recortes cóncavos, puntas miter sin límite adicional y arcos circulares round. `derived-path.ts` comprueba exactamente cierre, segmentos constantes, intersecciones recta–recta, recta–arco y arco–arco, tangencias y componentes coincidentes, excluyendo únicamente las uniones normales. Un contorno regular cerrado y simple de estas primitivas encierra área positiva; no se redondea una integral de arcos para decidir si el área es cero.

Las dimensiones incluyen extremos interiores de los arcos y se comparan exactamente con 5000 mm. Las puntas excesivas se conservan en la construcción y se rechazan por tamaño, sin truncarse. Para margen cero, también se valida el contorno Bézier original y sus extremos reales mediante raíces de las derivadas, sin usar su caja de controles como límite dimensional. Los resultados son `validated`, `validated-coincident`, `invalid-base` o `invalid-margin`; los fallos técnicos se propagan como errores diferenciados. No se modifica el archivo editable ni se habilita con esto el flujo PDF, todavía pendiente.

`algebraic.ts` mantiene un contexto compartido de números algebraicos exactos para comparar normales, intersecciones y extremos de distintas primitivas. No usa epsilon ni conversiones aproximadas para decidir topología. El punto local recta–Bézier utiliza la ecuación con signo para evitar extensiones radicales innecesarias. Una primera ejecución de la prueba integrada fue interrumpida por lentitud; tras esta corrección la batería correspondiente terminó correctamente. No se atribuye al núcleo un SLA por este ensayo.

### Evidencia del segundo avance

- RED inicial: seis pruebas fallaron porque `validateOffset` aún no existía.
- **19 pruebas adicionales**: recorte en L, muesca consumida, uniones mixtas, umbral inclusivo de tamaño, tamaño positivo 2^-600, inversión de recorrido, recorte recta–Bézier en un contorno completo, margen cero de cúbica cerrada con controles fuera del límite pero trayectoria dentro, normales irracionales, eliminación de raíces espurias, límites laterales de cúspide y estacionario par, tangencias y coincidencia de arcos, cruces no adyacentes, extremos circulares interiores y coherencia del contexto algebraico.
- **177/177 pruebas unitarias y de contratos**, 27 archivos; TypeScript y OpenAPI correctos.
- T027: **71/79 aprobados, ocho RED conocidos de dimensiones/separación**, ninguna omisión. Informe `.local/geometry-t033-validation.json`. Las funciones del puerto T027 todavía no están conectadas a un validador general de dimensiones/separación de T034/US6.

### Pendiente real para completar T033

- Recorte local **Bézier–Bézier** de offsets positivos.
- Certificación global de offsets Bézier positivos: autocruces, pares curvos, encuentros con uniones y dimensiones, integrando las ramas estacionarias y las cotas de T034.
- Integración del resultado completo con la representación acotada que consumirá renderizado/PDF.

Estos casos siguen dando `CURVE_CURVE_LOCAL_TRIM_PENDING` o `CURVED_OFFSET_CERTIFICATION_PENDING`. No están resueltos por los tests de polígonos ni por el recorte local recta–Bézier. Por ello T033 conserva `[ ]`, sin reducir el alcance aprobado. T034, editor y PDF no se declaran completos. Sin recursos ni gastos AWS; comprobación de hooks posterior sin archivo de extensiones.

## Cierre de T033 — Bézier–Bézier y margen curvo positivo

Este apartado sustituye el estado pendiente de los avances históricos. Se retiraron los dos errores de implementación pendiente citados arriba. `validateOffset` despacha los márgenes curvos positivos a `curved-margin.ts`, que construye y valida sus entidades exactas; la construcción conceptual por sí sola sigue sin acreditar validez.

### Intersecciones y recortes

`elimination.ts` calcula resultantes mediante determinantes de Sylvester con eliminación fraccionaria exacta de Bareiss, sin el límite de grado del eliminador de las cúbicas originales. `offset-intersections.ts` elimina las ecuaciones de las dos normales unitarias, aísla las raíces reales proyectadas y verifica cada fibra. La relación lineal de pseudo-restos solo se utiliza cuando sus divisores son distintos de cero; las fibras degeneradas usan el MCD especializado. Se verifica la igualdad de los offsets originales y la positividad de sus velocidades: elevar al cuadrado no basta para aceptar un contacto.

Para autocruces se elimina únicamente el factor diagonal conocido y se buscan parámetros distintos. Las componentes base relacionadas por reparametrización afín se verifican mediante identidad polinómica, se retira el factor común correspondiente y se conserva el contacto ordinario entre partes contiguas. Un tramo coincidente positivo genera un defecto geométrico explícito; no se confunde con ausencia de intersecciones ni con un error técnico.

El recorte cóncavo Bézier–Bézier usa las intersecciones reales de los offsets, no las de las tangentes. Selecciona el primer encuentro compatible con los dos extremos adyacentes; encuentros incomparables no se resuelven saltando bucles. Se conservan parámetros, puntos e identidades de origen. Los miter añaden soportes rectos sin límite de punta; los round conservan arcos circulares de radio exacto.

### Validación global

- Se comprueba cierre exacto y se rechazan tramos consumidos o invertidos.
- Se conservan las dos ramas laterales de los puntos estacionarios. Un salto retenido dentro de un tramo da margen inválido; si un recorte termina en el punto, se exige el límite de la rama que permanece. No se inventan conectores ni se oculta la singularidad.
- Se comprueban autocruces de cada offset y todas las combinaciones de offsets, rectas y arcos. Se excluye solo la unión normal de extremos; los contactos adicionales y solapes siguen bloqueando la geometría.
- Las cajas conservadoras descartan únicamente pares estrictamente separados. Un certificado exacto de proyección monótona y factor de velocidad positivo evita la eliminación de autocruces cuando demuestra inyectividad; no conseguir ese certificado activa el cálculo completo, no una clasificación inválida por defecto.
- Las dimensiones incluyen extremos de las coordenadas base, posibles ceros del factor de velocidad del offset, extremos de arcos y puntas. Las comparaciones con 5000 mm son exactas. Una curva cerrada, simple y no constante encierra área positiva; no se usa una polilínea muestreada para decidir topología o área nula.
- Los defectos geométricos producen `invalid-margin`. Los fallos técnicos se propagan separados de esa clasificación. Las pruebas comprueban que el editable conserva ancho, configuración y geometría base.

### Aritmética y reutilización

Las secuencias de Sturm y los MCD normalizan coeficientes sin cambiar signos o raíces. Las extensiones algebraicas descartan factores que se ha demostrado que no contienen la raíz elegida. El contexto reutiliza raíces racionalmente equivalentes, radicales proporcionales por cuadrados exactos y resultados de intersección dentro de una misma validación. Las raíces importadas desde una eliminación independiente conservan su certificado y solo incorporan los generadores usados. Esto evita arrastrar normales de esquinas ajenas al problema. No se introduce epsilon, cuantización ni un límite funcional adicional.

### Evidencia vigente

- **185/185 pruebas unitarias y de contratos**, 28 archivos, ninguna omitida en la regresión completa; duración observada de esa ejecución: **46,86 s** en el entorno local.
- TypeScript estricto y OpenAPI correctos.
- Ocho casos adicionales frente al segundo avance: eliminación de grado superior, intersección analítica Bézier–Bézier con comprobación de cantidad, partes contiguas de una misma curva, coincidencia positiva, recorte Bézier–Bézier integrado con punto conocido, autocruce del margen de una parábola base simple, discontinuidad de cúspide retenida e importación algebraica entre contextos.
- La prueba integrada de recorte utiliza parámetros conocidos 7/8 y 1/4, ancho 105/128 y encuentro en y=3. Las pruebas anteriores de recta–Bézier ahora exigen validación completa, no un error de funcionalidad pendiente.
- T027 mantiene **71 aprobados y ocho RED** de dimensiones/separación todavía no conectadas en el puerto general; ninguna omisión. Informe `.local/geometry-t033-complete.json`.
- Comandos: `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts`; `tools/validation/toolchain.ps1 run contracts:check`; `.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/geometry/predicates.spec.ts --reporter=json --outputFile=.local/geometry-t033-complete.json`. El último conserva salida no cero por los ocho pendientes declarados.

### Límites de esta aceptación

La eliminación algebraica puede ser costosa. Durante el desarrollo se interrumpieron ejecuciones diagnósticas lentas y una ejecución previa del caso integrado tardó aproximadamente 103 s; no son evidencia del objetivo de 60 s del PDF. La regresión final pasa, pero **no acredita el rendimiento de composiciones máximas ni un SLA del motor**. T038 conserva esa validación antes de liberar la entrega.

T034 sigue pendiente: representación aproximada con cota de 0,01 mm, refinamiento y consumo por renderizado/PDF. Las entidades exactas certificadas de T033 constituyen su entrada; no se declara construido el editor ni habilitada la exportación. T026 mantiene sus dependencias. No hay hooks posteriores (`.specify/extensions.yml` ausente), despliegues ni gastos AWS.
