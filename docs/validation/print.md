# Validación de impresión — primera entrega

Rama `patronaje`, funcionalidad `001-patronaje`. Validación local; sin AWS ni despliegues. T081 no se considera completa mientras falten las mediciones y ensayos físicos indicados aquí.

Resultado local final: 152/152 pruebas de regresión; 50/50 PDF verificados y guardados, 30/30 cancelaciones y cinco casos deterministas Windows/Linux. Datos individuales y hashes en `pdf-performance-results.json`. T078 completa; T081 permanece abierta por impresión física y la aceptación de hardware corresponde a T095.

## Precisión numérica y seguridad

El generador usa un snapshot guardado e inmutable. Un worker independiente interpreta el PDF con PDF.js y compara trayectorias, transformaciones, recortes, estilos, marcas, dimensiones, escala, páginas y elementos auxiliares. No acepta un manifiesto embebido como evidencia de geometría. PDF incompleto, modificado, de otra revisión, con acciones o adjuntos, se rechaza.

La aproximación certificada del margen tiene error máximo de 0,01 mm; el cotejo de trayectorias del PDF admite 0,02 mm. La conversión numérica añade menos de 0,00000003 mm en las plantillas acotadas. La suma permanece por debajo de la desviación CAD–PDF aprobada de 0,1 mm. Las decisiones de cierre, contactos, cruces, separación de 2 mm y límites dimensionales conservan cálculo exacto.

La regresión incluye A4, Carta, gran formato con UserUnit, 250 páginas incluidas auxiliares, selección parcial, estilos de contorno/margen, geometría curvada y rotada, corrupción y coincidencias exactas. Las pruebas están en `tests/print/`, con detalle de las optimizaciones en `pdf-performance-analysis.md`.

## Series ejecutables

`tools/validation/pdf-performance.mjs` solicita diez ejecuciones por carga y registra cada tiempo, equipo y resultado. Incluye generación, verificación independiente y guardado local nativo; no presenta un temporal como PDF final. La guarda de 120 segundos pertenece exclusivamente al arnés y no cancela automáticamente exportaciones del producto.

Los casos dimensionales son una composición exacta de 10 000 × 10 000 mm y un mosaico A4 de 31 columnas × 8 filas más dos páginas auxiliares, total 250. Las cargas mixtas conservan rectas, Bézier, margen positivo y marcas. `--cancel` solicita cancelar durante la generación, comprueba «Cancelando» inmediato y mide hasta recuperar el estado cancelado. Los resultados y limitaciones vigentes se registran en `performance.md`.

`tools/validation/pdf-platforms.mjs` compara dos generaciones de cada documento en Windows y Linux, con Node y fuente fijados. Linux se ejecuta en un contenedor local sin red y con montajes de solo lectura. La verificación independiente se hace en Windows sobre los mismos bytes. Este ensayo no acredita soporte de CAD para Linux.

## Ensayos físicos aplazados

- Imprimir A4 y Carta a tamaño real, sin «ajustar a página»; medir ambos lados del cuadrado de 100 × 100 mm: rango inclusivo 99,5–100,5 mm.
- Comprobar solape de 10 mm, alineación, numeración, esquema de montaje y legibilidad de estilos/leyenda.
- Imprimir gran formato y comprobar su cuadrado integrado y escala real.
- Registrar impresora/controlador, papel, configuración, medidas y resultado. Un PDF numéricamente correcto no prueba la calibración de la impresora.
- Completar rendimiento en el equipo de referencia y determinación del mínimo en T095; el equipo actual no se presenta como equivalente.

Los ensayos físicos se conservan en `intervention-queue.md`; no se sustituyen por mocks ni por el resultado de las pruebas numéricas.

### Kit listo para ensayo físico (2026-11-16)

`node tools/validation/prepare-print-acceptance.mjs` generó y volvió a leer/verificar tres PDF y sus editables en `.local/validation/physical-print`: gran formato (1 página), A4 (6 páginas) y Carta (6 páginas), escala 1:1. `manifest.json` registra dimensiones y SHA-256. Todos conservan `physicalResult: pending`; no se envió nada a la impresora.
