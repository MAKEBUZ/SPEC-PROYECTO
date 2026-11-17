# T053 — conflictos de publicación, 2026-11-16

## Comportamiento implementado

El CAD permite revisar el estado remoto desde Publicación. Ante otra versión, ofrece conservar el trabajo como patrón independiente o cargar el editable remoto con respaldo local verificado. Ambas opciones requieren confirmación; conservar sin cambios no modifica el documento ni la cuenta.

La copia independiente recibe una identidad local nueva y pierde el vínculo remoto. Cargar remoto comprueba sesión, versión seleccionada, autorización del archivo, tamaño, SHA-256, estructura y revisión. Antes de sustituir el documento activo, escribe un respaldo exclusivo con las ediciones locales actuales y verifica su relectura. Un fallo de respaldo, descarga inválida o edición concurrente impide reemplazar el trabajo. La ruta del respaldo se muestra al completar la carga y cuando una edición tardía impide aplicarla.

La versión descargada se abre como copia de trabajo local nueva, sin sobrescribir el archivo original ni su correlación persistente, manteniendo el vínculo al patrón y versión remotos. Queda sin guardar; el siguiente guardado elige destino explícitamente. Crear una copia independiente tampoco publica: requiere guardar, seleccionar proyecto activo y publicar manualmente. No se heredan historial ni accesos en una publicación nueva.

Los identificadores de resolución los emite main y se consumen una vez. El renderer no selecciona metadatos remotos ni rutas de descarga. Las consultas periódicas y las acciones de publicación se ordenan para evitar que compitan por el bloqueo de archivo. El reemplazo exige que el documento activo conserve la versión capturada.

## Evidencia de estado remoto

GET `/patterns/{id}/publication-status` exige sesión normal y propiedad. Devuelve activo, papelera (también si el proyecto está en papelera) o eliminación confirmada. Esta última exige un registro de purga completada del propietario que identifique inequívocamente el patrón; ausencia, falta de permiso y purga incompleta no la acreditan. La sesión se verifica nuevamente antes de responder.

La papelera bloquea y pide restaurar el recurso. Una eliminación confirmada permite preparar un patrón nuevo expresamente. Para una cuenta anterior eliminada se usa únicamente la confirmación local conservada por el ciclo de vida, nunca la ausencia de sesión o historial. No se reabren seguimientos cerrados ni se consulta la cuenta eliminada.

## Validación y límites

- Regresión local: 171/171 pruebas, 38 archivos; respaldo fallido, descarga corrupta, cambios concurrentes, confirmación, identidad independiente, evidencia de eliminación de cuenta y coordinación de consultas incluidos.
- Integración: 7/7 pruebas en `publication-conflict-status.spec.ts` y `desktop-publication.spec.ts`, con API/PostgreSQL, transporte y almacenamiento persistente. Incluye autorización, ausencia, papelera, purga incompleta/completa, descarga de otra versión, conservación del vínculo anterior y evidencia local de cuenta eliminada sin consultas a esa cuenta.
- Electron: 4/4 pruebas (64,53 s): publicación/reinicio, copia independiente, carga remota con respaldo y patrón nuevo tras evidencia de eliminación. Se guardan las copias resultantes con el escritor nativo y se verifican identidad, preparaciones y vínculo; el archivo original queda intacto y no se crean versiones remotas adicionales. Las primeras ejecuciones detectaron un fallo intermitente; se añadió coordinación de solicitudes y la ejecución final completa pasó.
- TypeScript, OpenAPI y build desktop correctos; el build conserva las advertencias de tamaño del bundle y directivas `use client`.

Los datos de purga completa se preparan como fixtures autorizados en PostgreSQL: estas pruebas validan su consumo, no completan ni certifican el worker de purga T087. T052 conserva el pendiente de PDF opcionales verificados de la misma revisión; T061 conserva los pendientes de ciclo de vida y papelera. T063 no se cierra con estas pruebas parciales. T039 físico sigue aplazado. Sin despliegues ni llamadas a AWS.
