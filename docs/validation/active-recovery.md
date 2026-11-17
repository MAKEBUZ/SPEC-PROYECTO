# Captura del documento activo e interfaz — T044

Implementación local en patronaje, 2026-11-15, sin AWS ni despliegue.

El Workspace captura el documento activo al habilitarse el CAD y cada 60 segundos. Incluye documentos nuevos y preparaciones; cambiar de pestaña no detiene la captura. Solo mantiene una solicitud en curso, informa fallos y reintenta en el siguiente intervalo. La captura pasa por validación IPC y RecoveryStore en el directorio local del usuario, independiente del destino del archivo original.

La sección «Recuperación local» permite consultar copias, actualizar, recuperar y descartar con confirmación explícita. Restaurar valida el documento y lo abre como cambios sin guardar, incluso si está vacío. No modifica el archivo original ni publica. Si hay cambios actuales o el documento cambia mientras llega la respuesta, no se reemplaza. El recorrido completo de guardar/descartar/cancelar al abandonar documentos sigue en T043; esta protección no lo sustituye.

## Pruebas ejecutadas

- 71/71: recuperación, comandos del editor, captura activa e IPC.
- E2E Electron de captura/reinicio/recuperación: 1/1, 66,95 s, usando el intervalo real de 60 segundos. Comprueba contenido editado después de reabrir y bloqueo de reemplazo del documento recuperado sin guardar.
- E2E Electron de descarte: 1/1, 7,94 s; cancelar conserva la copia, confirmar la retira. Se ejecutó por filtro; el otro escenario se validó por separado.
- TypeScript, compilación desktop y `git diff --check`: correctos. Continúan avisos existentes de bundle y `use client`.

Los intentos iniciales del E2E fallaron por el arnés: recarga de ventana bloqueada por navegación protegida y búsqueda por un documentId ausente del snapshot de ensayo. Se corrigieron sin retirar protecciones del CAD. El último ensayo usa tiempo real, no un reloj simulado.

T044 se marca completada para captura e interfaz local. Este ensayo no acredita recuperación ante pérdida física de disco, aceptación USB, rendimiento de todas las cargas de quickstart ni el cierre completo de T039/T041/T043/T063/T095.
