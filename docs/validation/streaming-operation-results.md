# Cargas y resultados históricos — 2026-11-15

Trabajo local en `patronaje`, con speckit-implement. No se desplegaron recursos ni se usó AWS.

## T047 — completada

El controlador recibe archivos como flujo, comprueba primero tamaño/hash contra el manifiesto y crea un temporal privado verificado. Al terminar la recepción vuelve a comprobar sesión, estado de publicación y propiedad antes de aceptar el archivo. El objeto se escribe por streaming, se verifica en disco y se relee por streaming antes de confirmar sus metadatos. Los temporales se retiran al terminar o fallar. Repetir la misma identidad no cambia los bytes existentes.

La validación del editable requiere materializar su JSON/modelo. Esta parte no se presenta como consumo constante de memoria; la prueba de capacidad completa sigue en T095. La comprobación semántica de PNG/PDF al confirmar la publicación sigue en T048/T049/T080: un PDF todavía no verificable no se publica.

Pruebas: quince de publicación HTTP/PostgreSQL; seis de almacenamiento por streaming, incluyendo un flujo real de exactamente 100000000 bytes con bloques reutilizados, rechazo de tamaño superior, contenido distinto, fuente interrumpida y limpieza de temporales. Se mantienen las pruebas de cuota de 2000000000 bytes, reservas concurrentes, versiones/papelera y abandono explícito. El ensayo de 100 MB valida el transporte de almacenamiento; no demuestra todavía rendimiento de un documento JSON de ese tamaño en el CAD/servidor.

## T051 — completada

La consulta conserva autorización histórica y anonimiza al solicitante eliminado. La nueva operación interna `purgeAccountResults` se ejecuta dentro de una transacción después de retirar la cuenta: elimina registros sin cuentas autorizadas restantes y reduce los conservados a códigos conocidos e identificadores válidos. No retiene credenciales, correos, archivos ni payloads de respuesta.

La confirmación de purga de cuenta permite registros mínimos autorizados para otra cuenta y los sanea antes de confirmar. Sigue bloqueada si queda una identidad, contenido o un registro sin cuenta autorizada pendiente de purgar. Esto no implementa la eliminación de blobs, el worker completo ni evidencia externa de T087/T088.

La prueba de concurrencia elimina ambas identidades en transacciones independientes. El bloqueo evita decidir sobre una cuenta superviviente desde un estado obsoleto; una transacción abortada por interbloqueo se revierte y se reintenta, sin dejar registros huérfanos. El futuro worker debe conservar ese tratamiento de reintentos; no se oculta un fallo de transacción como éxito.

## Validación

- Streaming y descarga: 13/13 pruebas.
- Regresión local (unitarias, contratos, recuperación y offsets): 323/323, 53 archivos, 91,59 s. No incluye las cuatro pruebas RED de separación pendientes de T074 ni acredita exportación PDF.
- Publicación HTTP/PostgreSQL: 15/15.
- Regresión completa PostgreSQL: 125/125, 17 archivos, 52,02 s.
- Tras la última protección de concurrencia: operaciones y comprobación de eliminación, 10/10, 7,61 s.
- TypeScript y `git diff --check`: correctos. Solo avisos existentes de normalización LF/CRLF.
- El primer intento de integración completa tuvo un timeout de inicio en autenticación: 103 pasadas y 22 omitidas. Se limitó el arnés de integración a dos trabajadores, sin ampliar timeouts ni cambiar aserciones, y la repetición completa pasó.
- Los contenedores PostgreSQL temporales fueron retirados. No se ejecutó una purga de producción ni una operación AWS.
