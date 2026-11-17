# Guardado nativo Windows — 2026-11-15

## Instalación autorizada

El usuario autorizó expresamente instalar las herramientas. WinGet instaló Microsoft.VisualStudio.2022.BuildTools 17.14.45, carga VCTools y componentes recomendados, incluido Windows SDK 10.0.26100. El instalador terminó con código 0. Node-gyp detectó VS2022 17.14.37906.3; compilación Release x64 con Node 24.22.3 y Python 3.14.5 correcta. No se reinició el equipo. No se desplegaron recursos ni se utilizó AWS.

## Evidencia ejecutada

- `tools/validation/build-native.mjs`: generó `apps/desktop/native/build/Release/file_replace.node`. Advertencia MSVC D9025 por selección explícita de C++17 frente al valor predeterminado C++20; sin errores.
- `tools/validation/native-smoke.mjs`: creación exclusiva, rechazo de sobrescritura por creación, ReplaceFileW con respaldo, FlushFileBuffers y bytes comprobados. Rechazo de UNC, padre inexistente y junction. Ejecutado sobre disco local.
- `PATRON_NATIVE_TEST=1` y Vitest con document-save, document-handlers, leave-editor y document-actions: **18/18**, cuatro archivos, 1,48 s. Escritor y manejadores usan el binario real. Los escenarios de interrupción inyectan un error antes/después de llamar al reemplazo real; no simulan una desconexión física. Pruebas de guardia/acciones utilizan su transporte de ensayo habitual.
- Electron: native-document y unsaved-changes **2/2**, 29,63 s. Guardado real, apertura y guardado antes del cierre; cancelar y fallo de guardado conservan el documento.
- Ampliación final de native-document: **1/1**, 19,55 s. Formato futuro conserva documento; edición externa bloquea guardar; Guardar como conserva el archivo externo y crea documento independiente; editar y guardar al cerrar persiste en el nuevo destino. Solo se automatizan respuestas de diálogos; IPC, escritor, addon y archivos son reales.
- TypeScript y build desktop correctos. Avisos preexistentes del bundle/directiva conservados.

## Estado y límites

T042 y T043 completadas por la integración `document-handlers.ts`, `document-actions.ts`, controles de archivo y diálogo nativo compartido. El flujo se concentra ahí en lugar de crear un `save-dialog.tsx` adicional. No se cambia la decisión funcional ni se reparan documentos automáticamente.

T041 permanece abierta. El escritor verifica el destino después del reemplazo y conserva candidatos e intención, pero falta completar la reconciliación de candidatos tras reiniciar y la aceptación de rutas/sistemas de archivos. La protección actual rechaza UNC, reparse/offline y raíces OneDrive conocidas; no certifica todos los proveedores de sincronización. T039 conserva pendientes los escenarios físicos USB, disco lleno y fallos de dispositivo. No se atribuye resistencia a pérdida de alimentación ni soporte físico USB a estas pruebas del disco local. T093 conserva la validación del instalador/empaquetado.

Total: **59/98 completadas, 39 pendientes**. La autorización de instalación anterior queda resuelta.


Actualización: T041 completada como implementación; evidencia de reconciliación y validación en [save-reconciliation.md](save-reconciliation.md). Los ensayos físicos pendientes permanecen en T039 y la matriz de aceptación.
