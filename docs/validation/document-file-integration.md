# T041–T043: integración de archivos y cierre

Avance local en patronaje, 2026-11-15. Sin despliegue ni AWS.

## Implementado

- Capacidades de documento emitidas por main, vinculadas a documento, revisión e identidad de archivo. El renderer no transmite rutas arbitrarias.
- Diálogos de abrir, guardar y guardar como; confirmación de reemplazo de destinos existentes. Abrir devuelve un candidato validado y solo lo aplica si el documento no cambió mientras llegaba.
- Escritor existente conectado a los manejadores. Guardar confirma el snapshot escrito y mantiene modificadas las ediciones posteriores. Cancelar o fallar no sustituye el documento.
- Comprobación de cambio externo también antes de Guardar como. No se permite eludirla seleccionando el mismo original ni otro enlace al mismo archivo. Un destino independiente conserva intacto el original modificado externamente.
- Control compartido para Nuevo, Abrir y cerrar la ventana: Guardar debe confirmarse y dejar el documento sin cambios pendientes antes de continuar. La aprobación del cierre utiliza un token del proceso principal y una comprobación final de versión; nuevas ediciones invalidan esa aprobación.
- Cargador del adaptador Windows sin fallback destructivo. Se añadieron comprobaciones nativas iniciales de unidad local/removible y atributos de rutas, y exclusión de raíces OneDrive conocidas. Falta comprobar su comportamiento real y completar la aceptación de rutas/sistemas de archivos admitidos.
- Scripts `tools/validation/build-native.mjs` y `tools/validation/native-smoke.mjs` preparados. El segundo exige un binario real y comprueba creación exclusiva, ReplaceFileW, respaldo, flush y rechazo UNC; no reemplaza ensayos físicos USB.

## Evidencia ejecutada

- 86/86 pruebas dirigidas de recuperación, comandos, acciones de archivo e IPC.
- Sobre la integración de cierre final: 5/5 (cuatro unitarias y un E2E Electron), 16,66 s. El E2E inyecta un fallo de diálogo para comprobar conservación; no acredita un guardado nativo exitoso.
- Tras reforzar la detección de enlaces al archivo en conflicto: 12/12 de manejadores, escritor y acciones; TypeScript correcto.
- Compilación desktop correcta con los avisos ya existentes de bundle/directiva.
- Las pruebas del escritor/manejadores usan archivos reales y un adaptador de ensayo explícito. No demuestran ReplaceFileW ni FlushFileBuffers reales.

## Bloqueo y estado

No se encontró `cl`, `clang++`, `g++` ni `vswhere.exe`. Se solicitó autorización para instalar Microsoft C++ Build Tools y Windows SDK porque modifica el sistema, requiere varios GB y puede necesitar administrador. Esa autorización seguía pendiente al registrar este avance; no se instaló nada.

T041, T042 y T043 permanecen abiertas: falta compilar y probar el adaptador nativo, completar la aceptación de rutas y ejecutar guardar→abrir→guardar antes de cerrar con el backend real. No se sustituyen esas verificaciones por dobles. El total permanece en 57/98 completadas, 41 pendientes.


Actualización: la instalación fue autorizada y completada; validación nativa y cierre de T042/T043 registrados en [native-document-windows.md](native-document-windows.md). El bloqueo de compilador descrito arriba es histórico. T041 sigue abierta por los pendientes indicados en esa evidencia.
