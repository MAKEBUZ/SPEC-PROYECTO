# Redondeo del contorno desde el tablero

Fecha: 2026-11-17. Versión: 0.1.8. Código: 3b1625e. Ampliación solicitada expresamente por el usuario; sin AWS.

## Resultado

«Redondear pieza» permite radio nominal en mm y clic en un vértice entre rectas. Genera una Bézier tangente, conserva identidad, metadatos y ancho del margen, y admite deshacer/rehacer en un único paso. La reapertura conserva el contorno. «Redondear margen» mantiene su función anterior.

## Validación automatizada

- TypeScript sin errores.
- Regresión de tests/unit, tests/geometry y tests/print: 528 pruebas correctas en 76 archivos.
- Suite específica final tests/print/rounded-piece.spec.ts: 4/4, incluida generación y verificación geométrica del PDF con margen. Se ejecutó tras añadir el escenario de PDF; no se suma al recuento anterior porque hay solapamiento.
- tests/unit/round-corner.spec.ts: 14/14; orientación, cuatro vértices, cierre, tangencias, errores atómicos, historial y esquina cóncava.
- Electron: cad-edit.spec.ts y cad-graphical.spec.ts, 28/28; clic, radio inválido, atajos y guardado/reapertura del contorno redondeado.
- Build e instalador correctos; packaged-desktop-smoke comprueba versión, nombre, instancia única, dependencias y adaptador nativo.

## Artefacto

PATRONAJE-0.1.8-Setup.exe (local, no incluido en Git), 186634752 bytes. SHA-256: 584c894ab0822e6072bdaee1438d97bbc368b95e8edbdbebe9aa3dd16ac934e7.

## Límites y aceptación manual

Redondeo mediante aproximación Bézier; no arco circular exacto. Se rechazan extremos abiertos, uniones con curvas, radios no positivos, degeneraciones y radios que no caben. Para modificar el radio aplicado se deshace y se vuelve a redondear; los tiradores siguen siendo editables. La validez del resto de la pieza y la preparación se comprueba antes de exportar.

Pendiente: el usuario instala 0.1.8 y prueba una pieza propia. No se han repetido ensayos de USB, impresora o móviles ni se han cerrado las ocho tareas de aceptación pendientes.
