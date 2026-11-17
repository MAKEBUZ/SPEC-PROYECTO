# Rendimiento — evidencia parcial

Fecha: 2026-11-16. Implementación local en `patronaje`. **T078, T081 y T095 no están aprobadas** por este informe.

## Equipo medido

Windows x64 build 26200, AMD Ryzen 7 5700G, 16 procesadores lógicos, 34 137 837 568 bytes de RAM informados por el sistema, Node v24.22.3. No equivale al equipo de referencia aprobado de 4 núcleos/16 GB ni determina el mínimo admitido. No se verificó aquí el modelo del disco; no se atribuye una tecnología de almacenamiento por inferencia.

## Recuperación local

Treinta ejecuciones correctas, diez por carga: 10 piezas × 20 segmentos, 50 × 100 y 100 × 500, interpretando los segmentos por pieza. Las cargas incluyen rectas, una Bézier por pieza, margen y marcas. Se persistió y recuperó todo el documento en cada ejecución, comparando el contenido completo. Máximos de captura más reapertura: **30,67 ms**, **375,84 ms**, **4160,14 ms**. Detalles y comandos: `persistence-publication.md`; datos de cada ejecución en `.local/validation/recovery-{small,medium,large}.json`.

## PDF completo y guardado nativo: evolución y resultado local

`tools/validation/pdf-performance.mjs` mide generación, verificación independiente y guardado mediante el adaptador nativo, sin reemplazar el escritor por una simulación. Prepara copias independientes de la misma forma con margen positivo y una Bézier; usa el corpus anterior y separaciones de 150 mm. Incluye una guarda **exclusiva del arnés** a 120 segundos para detener un ensayo que no termina; la aplicación conserva su comportamiento aprobado sin cancelación automática a los 60 segundos.

La primera ejecución pequeña no terminó antes de la guarda: **120 023,07 ms** antes de reutilizar cálculos y **120 013,31 ms** después. Estas son mediciones históricas anteriores a las optimizaciones algebraicas siguientes; no produjeron un PDF final validado y guardado.

Se incorporó reutilización de geometría y aproximación para formas exactamente iguales dentro de una única evaluación; conserva coordenadas sin redondear, conectividad, ancho, estilo de esquina y rotación. La colocación y los metadatos se comprueban por pieza y la verificación independiente crea otra evaluación. **64/64 pruebas de impresión** aprobaron después del cambio, incluidas colisiones, curvas, márgenes, cambios de geometría y piezas duplicadas. La corrección de esa reutilización no demuestra por sí sola una mejora suficiente del tiempo del corpus.

### Mediciones intermedias del 2026-11-16

Tras incorporar certificados exactos para soportes tangentes y raíces ajenas al intervalo, la carga pequeña completó **10/10** exportaciones con guardado: mínimo **38 222,97 ms**, máximo **40 028,58 ms**, 45 548 bytes por PDF. La carga mediana completó cinco exportaciones; la quinta tardó **66 261,70 ms**, incumpliendo el objetivo, por lo que se interrumpió esa serie. Los resultados originales se conservan en `.local/validation/pdf-performance-{small,medium}-before-templates.json`.

Con la primera versión de reutilización numérica, la carga grande alcanzó la guarda de **120 020,76 ms**, sin PDF final. El diagnóstico de una sola pieza separó el contorno base (aproximadamente 1,8 s) y dimensiones (0,27 s) de la validación del margen, que no terminó dentro de la guarda de 60 s del diagnóstico. No se clasifica por ello el documento como geométricamente inválido.

Se añadieron después plantillas relativas, reutilización del certificado de margen de un snapshot y resultados completos de las intersecciones usadas al recortar. La carga grande pasó por resultados intermedios de 67 489,86 ms, 61 704,20 ms y 62 696,21 ms, todavía incumplidos. El análisis de las garantías está en `pdf-performance-analysis.md`.

### Series finales del 2026-11-16

**50/50 PDF generados, verificados independientemente y guardados mediante el adaptador nativo**, sin otras pruebas pesadas en paralelo. Todos cumplen el objetivo de 60 segundos en el equipo descrito arriba:

| Carga | Ejecuciones | Máximo total | Páginas | Bytes |
|---|---:|---:|---:|---:|
| 10 piezas × 20 segmentos por pieza | 10/10 | 28 172,16 ms | 1 | 45 488 |
| 50 × 100 | 10/10 | 30 930,40 ms | 1 | 372 369 |
| 100 × 500 | 10/10 | 56 441,91 ms | 1 | 3 111 361 |
| Composición exacta de 10 × 10 m | 10/10 | 523,28 ms | 1 | 21 236 |
| A4, 31 × 8 hojas más auxiliares | 10/10 | 1 007,73 ms | 250 | 819 769 |

Cancelación: **30/30**, diez por cada carga mixta, solicitada durante la generación del worker. Máximos: pequeña **9,05 ms**, mediana **10,55 ms**, grande **15,15 ms**. Se observó `cancelling` inmediatamente y el estado final `cancelled` en todos los casos; no se guardó un PDF final.

Las ocho series comparten build SHA-256 `921ee1af562ecac27e6d36409b5a521d412184ece9a6edb8d2f815d987f1b805`. El arnés registra hash de build, snapshot y fuente, y detecta cambios de build durante una serie. `pdf-performance-results.json` conserva cada ejecución y sus metadatos; `tools/validation/record-pdf-evidence.mjs` exige diez resultados válidos por serie antes de consolidar.

Determinismo: **5/5 casos** —gran formato, A4, Carta, curva rotada y formato máximo— coinciden byte a byte entre Windows y Linux; dos generaciones por plataforma y caso. Imagen local Node 24.22.3, contenedor sin red y montajes de solo lectura. Verificación independiente ejecutada en Windows sobre los mismos bytes, sin atribuir a Linux un ensayo de verificador que no se realizó.

Reproducción tras compilar desktop:

```powershell
.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/performance/recovery.spec.ts --maxWorkers=1
.local/toolchain/node.exe tools/validation/pdf-performance.mjs small
```

El segundo comando devuelve código distinto de cero si el objetivo no se cumple o la guarda detiene el ensayo. El resultado se conserva en `.local/validation/pdf-performance-small.json`; los PDF temporales se retiran. No son resultados de producción ni impresiones físicas.

## Pendientes

- Ensayar equipo de referencia, equipos inferiores, móviles e impresión física sin sustituirlos por simulaciones.
- Completar el recorrido integral T095 y su evidencia individual en la matriz de aceptación.

Los resultados locales permiten cerrar la implementación y su validación local de T078. T081 conserva la impresión física y T095 conserva la referencia de 4 núcleos/16 GB/SSD y la determinación del mínimo; no se presenta el equipo actual como equivalente ni se declara terminada la entrega.

No se cambió el alcance ni se desplegaron recursos o generaron gastos AWS.

### Recorrido integrado T095 (2026-11-16)

Nuevo `tests/e2e/first-release.spec.ts`: misma revisión desde guardado nativo y PDF hasta publicación interrumpida/reanudada, descarga íntegra de editable/PDF en portal móvil emulado, papelera/restauración y conservación del catálogo tras reiniciar. Ejecutado localmente con API/PostgreSQL reales. No reemplaza las series 60s/5s/60s ni demuestra prestaciones del equipo de referencia o inferiores. Véase `remaining-eight.md`.
