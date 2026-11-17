# Avance local — T048, T073 y T084

Rama patronaje, 2026-11-16. Sin despliegue, servicios AWS ni gastos. T039 físico permanece aplazado.

## T048: perfil PNG reproducible

El perfil existente `patronaje-preview-1` conserva WASM y fuente fijados por hash. Se amplió el corpus a diez documentos: vacío, texto Unicode escapado, coordenadas diminutas, pieza grande, cúbica, borrador abierto, autocruce, longitud cero, coordenadas extremas y cien piezas. Cada caso se renderizó dos veces; las salidas de Windows y Linux coinciden byte por byte mediante SHA-256.

Linux se ejecutó con la imagen local `node:24.22.3-bookworm-slim`, sin red y con repositorio montado de solo lectura. No se descargó una imagen ni se contrató capacidad. Los resultados fijados están en `tests/print/preview-profile-1.json`; `tests/unit/preview.spec.ts` detecta cambios de bytes bajo el mismo perfil. La validación incluye rechazo de perfil/activos desconocidos, conservación del documento y ausencia de interpretación de etiquetas como SVG activo.

T048 completada. Esto acredita el perfil PNG, no la generación/verificación PDF aún pendiente en T076–T080 ni la aceptación conjunta T063/T081. No se modifica el perfil silenciosamente para actualizar los hashes.

## T073: preparaciones y guardado

La prueba Electron ahora crea dos preparaciones, mueve y rota sin alterar la pieza original, verifica margen inicial de 10 mm, configura la copia con Carta y 15 mm, guarda con el adaptador nativo, cierra y reinicia Electron, abre el documento y comprueba colocación/configuración recuperadas. El archivo contiene ambas preparaciones y conserva la geometría base.

La pantalla ya permite selección, nombres, duplicación, eliminación y deshacer, y avisa de geometría cambiada y referencias faltantes. T073 completada. Los márgenes de costura, separación y aprobación de producción corresponden a T074 y a la salida PDF; esta vista no se anuncia como certificado de producción.

Primera ampliación del E2E falló porque el visor auxiliar `cad-snapshot` no expone preparaciones. Se corrigió la prueba para verificar el archivo real y la interfaz reabierta, sin modificar el producto para acomodar la prueba. Repetición de preparación y perfil: 4/4, 27,12 s.

## T084: papelera local integrada

Nuevo botón «Eliminar copia local». Main muestra nombre y alcance mediante diálogo nativo; con cambios permite guardar y enviar, descartar y enviar o cancelar. La confirmación genera un identificador de un solo uso asociado al archivo. IPC rechaza identificadores inventados/reutilizados y vuelve a comprobar la identidad antes de llamar a `shell.trashItem`.

El renderer cancela si falla o se cancela el guardado. No vacía el documento hasta la confirmación del sistema; si llegaron ediciones posteriores, conserva ese contenido sin guardar y separa su vínculo con el archivo eliminado. Durante la operación no permite otra acción de archivo o cierre que pierda cambios. No existe fallback de borrado definitivo ni transporte remoto.

T084 completada. El E2E usó la papelera real de Windows con un archivo de ensayo generado para ese propósito. Cancelar conservó el archivo; confirmar retiró únicamente el editable y conservó un PDF vecino. El pequeño archivo de ensayo permanece recuperable en la papelera; no se vació la papelera del sistema ni se manipularon documentos del usuario.

Pruebas adicionales de IPC verifican fallo de papelera, archivo conservado, confirmación agotada y nueva confirmación necesaria. Pruebas unitarias cubren guardado cancelado/fallido y ediciones tardías. El contrato IPC se actualizó con esos campos técnicos, sin cambiar decisiones de producto.

## Resultado global

- **115/115**, 24 archivos: recuperación, guardado, papelera, acciones, fronteras IPC, preparaciones, rutas y perfil PNG; `PATRON_NATIVE_TEST=1`, 10,16 s.
- **3/3** de Electron/papelera IPC: papelera real, cierre con cambios e IPC de eliminación, 28,05 s.
- Preparaciones tras reiniciar y PNG: **4/4**, 27,12 s.
- TypeScript y build desktop correctos; advertencias de bundle/directiva preexistentes.
- Una ejecución inicial dentro del sandbox no permitió enlaces/renombrados temporales. Reejecutada con permisos de pruebas locales: 20/20. No se alteraron aserciones para ocultar los rechazos del entorno.

**63/98 tareas completadas; 35 pendientes.** T068 ya tiene manifiesto/iconos y caché pública probada previamente, pero sigue abierta por su integración con el seguimiento completo de US3; T065/T069 conservan aceptación física. No se marca esa integración completa por la existencia del service worker. T039 mantiene los ensayos físicos documentados al final de su evidencia.
