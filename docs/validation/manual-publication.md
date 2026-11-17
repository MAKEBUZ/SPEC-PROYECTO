# T052 — publicación manual y reconciliación, 2026-11-16

## Estado actual

Conectados en el CAD: selección paginada de proyectos activos de la cuenta, creación de proyecto, preparación del editable guardado y PNG reproducible, publicación manual y recuperación persistente del resultado. Guardar sigue siendo exclusivamente local. No se admiten adjuntos externos ni se publica automáticamente al guardar.

La pantalla muestra por separado preparación local, destino vinculado, última versión confirmada, carga interrumpida y resultado pendiente. Un archivo con RemoteBinding usa el patrón vinculado, con autorización remota; no se redirige silenciosamente al proyecto seleccionado como si fuera un patrón nuevo. El vínculo no autoriza acceso. La versión anterior permanece intacta.

## Fronteras de seguridad y persistencia

- IPC por capacidad de documento, revisión y acciones tipadas; no rutas, credenciales ni cabeceras aportadas por el renderer. Main vuelve a comprobar la identidad del archivo guardado antes y después de preparar.
- AccountSession conserva la credencial protegida y exige cuenta/sesión normal coincidentes por solicitud. HttpsAccountRemote limita rutas, rechaza redirecciones y calcula tamaño/checksum de cargas binarias. El transporte de producción conserva HTTPS obligatorio.
- El manifiesto utiliza exactamente los bytes guardados del editable. PNG y hashes se calculan en main. Revisión falsa, UTF-8 inválido, cambio externo o edición durante preparación impiden usar el conjunto.
- PublicationStateStore persiste antes de enviar los identificadores y cuerpos de creación de proyecto, inicio, commit y abandono. Usa generaciones enlazadas por checksum y copias de la misma generación; daño sin copia válida bloquea, sin regresar a un estado anterior. No almacena credenciales ni duplica los bytes del documento.
- Las mutaciones se enlazan al journal de T061 con scopes de documento/patrón. Consultar resultados respeta pausa, indisponibilidad y esperas compartidas. El proceso principal comprueba al abrir/reconectar mediante su ciclo de mantenimiento y ofrece Comprobar ahora; no repite mutaciones inciertas.
- La API incluye la referencia autorizada de publicación en el resultado de beginPublication. Las referencias inequívocas de proyecto, patrón y versión permiten reconciliar sin inferir resultados por nombre, fecha o ausencia de respuesta.
- Tras una carga interrumpida, Continuar carga consulta los archivos recibidos y exige los mismos hashes/revisión. Una carga incompleta se puede descartar con confirmación; si se pierde esa respuesta, se consulta el abandono antes de permitir otro intento. No se abandona un commit incierto.
- RemoteBinding se persiste localmente antes de anunciar éxito; un fallo de esa escritura conserva el commit pendiente de reconciliación. Se aplica al documento correspondiente sin sustituir geometría ni alterar la revisión editable y se incorpora al archivo en su siguiente guardado. La persistencia independiente permite recuperarlo aunque el archivo aún no contenga esa actualización.
- Logout o cambio de cuenta ocultan estado y destinos; los resultados recibidos se vinculan a la cuenta original. Las operaciones independientes y el archivo local se conservan.

## Evidencia

- Regresión local con adaptador Windows: tests/recovery y suites de publicación, sesión, IPC y acciones de documento.
- Integración Nest/PostgreSQL: transporte de producción con puente de ensayo a loopback, archivos temporales y journal real. Cubre pérdida de respuestas de proyecto/begin/upload/commit/abandono, reapertura del almacén, fallo de escritura del binding, nueva versión sin sustituir la anterior y ocultación tras logout.
- E2E Electron: login, guardar, crear/seleccionar proyecto, preparar, publicar, reiniciar el CAD, abrir el archivo y recuperar el binding sin duplicar versiones; guardado posterior incluye el vínculo. Solo se sustituye el selector nativo de archivos y el destino HTTPS mediante un puente local de transporte. El escritor Windows, IPC, almacenamiento protegido, servicio y PostgreSQL son reales.
- TypeScript y build desktop correctos; persisten advertencias existentes de tamaño del bundle y directivas use client al empaquetar.
- La prueba inicial E2E detectó un nombre accesible ambiguo del selector; se añadió aria-label y el recorrido pasó. El antiguo timeout de foundation-smoke no se presenta como solucionado por este trabajo; este recorrido nativo específico sí está validado.

## Pendientes conservados

T052 sigue abierta por selección de PDF verificados de la misma revisión (T079 y verificaciones T049/T080). La continuación T053 conecta la interfaz de respaldo/carga remota, copia independiente y evidencia de eliminación confirmada; véase `publication-conflicts.md` para validación y límites. Los recursos en papelera siguen bloqueados hasta su restauración explícita.

T061 avanza con las mutaciones de publicación/proyecto/abandono. Sigue abierta por papelera T089 y la aceptación completa de lifecycle, incluida integración de limpieza por eliminación de cuenta de la correlación persistente adicional. La correlación de publicación permanece inaccesible sin sesión normal de la cuenta original; no se declara concluida su limpieza de ciclo de vida.

T063 no se marca: este E2E no sustituye mediciones de recuperación, PDF, determinismo Windows/Linux ni el recorrido completo portal/PWA. T039 físico continúa aplazado. No se desplegaron recursos ni se llamó a AWS.

Resultado final registrado: 155/155 pruebas locales en 35 archivos; 19/19 de integración en 2 archivos; 1/1 E2E de publicación en Electron (23,09 s). Tras el ajuste final de esperas compartidas se repitieron las 155 locales y las 19 de integración. TypeScript y build desktop correctos. Los contenedores PostgreSQL efímeros se retiraron al terminar; no se ejecutó toda la suite del producto.

Cierre posterior T061: admisión antes de persistir una correlación nueva y limpieza de correlaciones/copias tras vencimiento durable de la cuenta eliminada. Véase [operations-lifecycle-complete.md](operations-lifecycle-complete.md); no se borran los editables locales.
