# Rendimiento PDF — PATRONAJE 0.1.10

Fecha: 2026-11-17. Código: 32a36349e05f69b9b614bce149926130e7d258cb. Sin cambios en AWS.

## Resultado actual

La regresión que reproduce la geometría reportada (esquina oblicua redondeada, otra curva y margen de 10 mm) termina desde «Generar PDF» hasta el archivo guardado y registrado en **17.94 segundos**, por debajo del objetivo de 60 segundos. La medición usa Electron 45.3.2 en este equipo Windows x64, un perfil temporal sin red y diálogos de archivo automatizados. Incluye generación, verificación independiente, guardado nativo, registro local para publicación y comprobación de los hashes del archivo y del catálogo. No incluye tiempo humano ante un diálogo ni demuestra rendimiento universal en otros equipos o geometrías.

La medición adicional con Node sobre el archivo afectado dio 44,47 s para generación y verificación, sin contar guardado ni catálogo; no se confunde con el ensayo integral anterior. La evidencia de 0.1.9 se conserva como histórica: sus 132,45 s tampoco incluían el registro, que efectuaba otra verificación completa y explicaba parte de la espera de 214 s comunicada por el usuario.

## Cambios y precisión

- Orientación de la aproximación calculada con un determinante racional exacto en el vértice extremo, únicamente después de validar cierre y simplicidad. Evita acumular denominadores enormes en la suma del área; no modifica ni repara el contorno.
- Conversión de coordenadas relativas a un punto racional de la pieza antes de rotar, conservando la rotación normalizada exacta y las cotas de conversión. Casos fuera del rango conservan el cálculo anterior.
- El catálogo reutiliza exclusivamente la verificación del resultado vivo del worker, vinculada al hash del documento guardado, preparación, bytes PDF y mediciones. Una copia serializada, una revisión distinta o datos modificados se rechazan. No se acepta una bandera de «verificado» del renderer o del disco.
- La generación y la verificación independiente siguen siendo dos evaluaciones geométricas completas. La posterior selección para publicar vuelve a verificar; los PDF externos mantienen su validación.
- Se mantienen escala 1:1, tolerancia digital máxima de 0,1 mm, aproximación certificada de margen de 0,01 mm y cancelación manual, sin cancelar automáticamente al llegar a 60 s.

## Pruebas automatizadas

| Prueba | Resultado |
| --- | --- |
| TypeScript y build de escritorio | Correctos |
| tests/unit, tests/geometry, tests/print y recuperación PDF (catálogo/guardado) | 548/548; cero fallos |
| tests/e2e/pdf-rounded-performance.spec.ts | 17.94 s, archivo y catálogo iguales, original intacto, edición habilitada |
| tests/e2e/pdf-export.spec.ts | Exportación, rechazo de metadatos inválidos y cancelación correctos |
| Paquete Windows 0.1.10 | Inicio, nombre PATRONAJE, instancia única en dos relanzamientos y recursos nativos correctos |

Las regresiones incluyen curvas rotadas, traslaciones grandes, orientación cóncava en ambos sentidos, lados colineales, límites, PDF alterados y rechazo de certificados copiados o modificados. Los recuentos de ejecuciones anteriores no se suman a estos.

Comandos: Node local + TypeScript --noEmit; tools/validation/build-desktop.mjs; Vitest run tests/unit tests/geometry tests/print tests/recovery/pdf-artifact-store.spec.ts tests/recovery/pdf-save.spec.ts --maxWorkers=1; Vitest run tests/e2e/pdf-rounded-performance.spec.ts --maxWorkers=1; Vitest run tests/e2e/pdf-export.spec.ts --maxWorkers=1; tools/validation/package-desktop.mjs; tools/validation/packaged-desktop-smoke.mjs. Usar los requisitos de herramientas y recursos del README.

## Entrega y pendientes

PATRONAJE-0.1.10-Setup.exe: 186637824 bytes. SHA-256: 102db92501394f2f06f4f3bdd0faef427db5de9a98d7dc5070b2cfc34651bedf. Artefacto local, no incluido en Git. La instalación y repetición manual por el usuario están pendientes. No se cierran ensayos físicos ni las tareas de aceptación integral anteriores. El objetivo queda demostrado para esta regresión y este equipo, sin cambiar su alcance aprobado.
