# T028 — Escenarios de edición CAD

2026-11-15, patronaje, speckit-implement. Preparación TDD de US2; no implementación del editor.

## Ejecución

- TypeScript estricto: correcto.
- tests/e2e/cad-edit.spec.ts: **27 escenarios ejecutados, 27 RED, 0 omitidos**. Fallan en la preparación con CAD_EDITOR_NOT_IMPLEMENTED, antes de las acciones y aserciones de edición.
- Informe: .local/cad-edit-t028.json, ignorado por Git.
- No se afirma que las acciones UI, sus resultados o la aceptación de US2 hayan pasado.

## Cobertura preparada

| Requisito | Escenarios |
|---|---|
| FR-005/035 | Rectas construidas por puntos, curvas y tramos mixtos, ambos tiradores, añadir/eliminar puntos y cierre explícito por identidad |
| FR-006 | Cambiar mm/cm y zoom sin alterar el documento almacenado en mm |
| FR-007 | Deshacer/rehacer cambios, recuperar identidades y contenido; nueva edición descarta la rama rehechable anterior |
| FR-023/017 | Seleccionar, mover, rotar 90° y reflejar en el eje x=10; distancias conservadas; duplicado con IDs nuevos e independiente; cancelar/confirmar eliminación |
| FR-024 | Margen uniforme 10/0/sin margen, contorno base intacto; rechazo de negativo y no finitos; miter inicial y cambio round por esquina; elección conservada al cambiar ancho |
| FR-025 | Coordenadas y desplazamientos numéricos respetados con snapping activo; cuadrícula configurable; activar/desactivar ajustes no cambia geometría; arrastre y extremos; rechazo de cuadrícula no positiva/no finita y coordenadas no finitas |
| FR-026 | Nombre, talla, cantidad, hilo y doblez separados del contorno y reversibles |

La figura rectangular de referencia se construye con cuatro puntos y tres rectas abiertas, cerrándose por una acción posterior. No se introduce una herramienta de rectángulos, que está aplazada. Las tolerancias de las aserciones de rotación/arrastre sirven para comparar resultados numéricos del ensayo, no para cerrar contornos, validar topología ni añadir mínimos de producto.

## Vinculación con el editor real

tests/support/cad-edit-driver.ts define un puerto de prueba, sin operaciones de negocio. Al implementar T035–T037, tests/support/cad-edit-binding.ts deberá abrir Electron con sesión verificada de ensayo o habilitación local de fixture y operar los controles reales mediante Playwright. No sustituirá el renderer por un modelo simulado ni devolverá los valores esperados del test.

Las entradas, incluso inválidas, deben enviarse por el flujo de UI correspondiente. Un rechazo observable de la interfaz se traduce en rechazo de la promesa para la aserción, conservando el documento. Snapshot será una lectura del modelo canónico del editor, sin reconstruirlo desde la escena ni recalcularlo en el driver. Deshacer/rehacer deshabilitado se observa sin introducir una edición ficticia. El driver debe fijar viewport/zoom para convertir coordenadas del ensayo a movimientos de puntero reproducibles; las coordenadas numéricas se introducen por sus controles, no mediante arrastre.

El archivo de vinculación todavía no existe. Su ausencia produce el RED explícito en cada escenario y no se convierte en skip, todo o éxito artificial. Las firmas del puerto se podrán adaptar a los controles definitivos sin alterar las decisiones ni las aserciones funcionales aprobadas.

La persistencia y reapertura completa pertenecen a US3; impresión y representación de marcas en PDF a US6. Esta preparación no las acredita. T026 conserva sus dependencias; T029 sigue pendiente como siguiente implementación del modelo.

Comandos: tools/validation/toolchain.ps1 run check; .local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/e2e/cad-edit.spec.ts --reporter=json --outputFile=.local/cad-edit-t028.json. La segunda orden devuelve salida no cero hasta disponer del editor real. No necesita PostgreSQL, AWS ni iniciar ventanas en este estado RED.
