# T039 — pruebas de persistencia y fallos

Fecha: 2026-11-16. Rama patronaje. Sin despliegue, AWS ni cambios de alcance.

## Ejecutado en este avance

Se añadieron 15 escenarios que usan archivos temporales independientes y el adaptador Windows compilado:

| Escenarios | Evidencia | Tipo de fallo |
|---|---|---|
| Escritura parcial del temporal, copia nueva, respaldo anterior, intención y confirmación | 5 casos conservan memoria y rechazan el guardado; antes del reemplazo el destino queda intacto; después se verifica el respaldo independiente | ENOSPC inyectado después de escribir algunos bytes; no disco realmente lleno |
| Fallo de flush de esos cinco archivos | 5 casos rechazan el guardado sin confundir una escritura íntegra con un registro corrupto | EIO inyectado en FileHandle.sync |
| Permiso denegado al crear temporal | 1 caso conserva el archivo anterior y el snapshot | EACCES inyectado |
| Salida del proceso antes/después de ReplaceFileW y antes del flush final | 3 procesos hijos terminan con código 73; una instancia nueva reconcilia ambas copias por hash sin sobrescribir | Salida real del proceso de ensayo, sin ejecutar cleanup; no equivale a un corte eléctrico |
| Archivo ocupado por otro proceso | 1 proceso PowerShell abre un archivo de ensayo con FileShare.Read, impidiendo el reemplazo; se conserva el destino y quedan candidatas verificadas | Restricción real de compartición de Windows |

Archivos de prueba: `tests/recovery/document-storage-faults.spec.ts`, `tests/recovery/native-process-failures.spec.ts`; auxiliares de ensayo `tests/desktop/save-crash-host.ts` y `tests/support/hold-document.ps1`. Los auxiliares no se incorporan al flujo de producción.

### Resultados

- Nuevos escenarios: **15/15**, 2,01 s.
- Regresión con `PATRON_NATIVE_TEST=1`: **99/99**, 20 archivos, 8,16 s. Comando: Vitest sobre `tests/recovery`, `tests/unit/windows-paths.spec.ts` y `tests/unit/document-actions.spec.ts`, `--maxWorkers=2`.
- TypeScript y build desktop correctos; avisos existentes de bundle/directiva. No fue necesario modificar la implementación para hacer pasar los escenarios nuevos.
- Primer ensayo: 9/11 pruebas de errores inyectados pasaron. Dos expectativas suponían que un flush fallido siempre corrompía los bytes; se corrigió la expectativa, manteniendo el rechazo del guardado y las comprobaciones de conservación. Las repeticiones completas pasaron.
- Consulta de unidades solo de lectura: el equipo expone **C: fijo NTFS**; no hay volumen USB disponible en esa consulta. No se montaron, formatearon ni llenaron volúmenes.

La cobertura previa de rechazo de formatos, cambios externos, memoria sin guardar, recuperación explícita, objetivo de 60 segundos y archivos locales grandes permanece en las suites existentes. Los tres E2E de archivos/reinicio/cierre pasaron en el avance de T041; no se presentan como reejecutados en este avance sin cambios de UI.

## Pendiente al final: requiere intervención o medio físico

T039 **permanece abierta**. No sustituir los siguientes ensayos por las inyecciones anteriores:

| Ensayo | Preparación necesaria | Criterio de aprobación |
|---|---|---|
| Guardar, reemplazar y reabrir en USB NTFS | Unidad de pruebas identificada por el usuario y carpeta exclusiva, sin datos importantes | Revisión y bytes verificados; respaldo local independiente |
| Mismo ciclo en USB exFAT | Unidad exFAT ya preparada o autorización específica antes de cualquier formato | Mismos criterios, sin asumir idéntica semántica a NTFS |
| Desconexión durante escritura, flush y reemplazo | Dispositivo de ensayo y retirada física coordinada en cada frontera | No anunciar éxito incierto; conservar memoria y recuperar al menos una candidata íntegra; no reintentar contra otra unidad |
| Reconexión con letra distinta y reutilización de la letra original | Unidad de ensayo y coordinación de reconexión | No confundir volúmenes; recuperación local disponible; no sobrescribir la unidad distinta |
| Espacio realmente agotado | Volumen de ensayo aislado con capacidad acotada, preparado expresamente; nunca llenar C: | Guardado rechazado sin perder memoria ni último contenido válido recuperable |

Para cada ensayo registrar Windows, sistema de archivos, identificación no sensible de la unidad, fase exacta de retirada/fallo, hashes anterior/nuevo, mensaje mostrado, candidatas disponibles y resultado de recuperación. Conservar los archivos de evidencia hasta revisar el resultado. No usar patrones reales como datos de ensayo.

No se solicita conectar ni formatear nada durante este avance: estos puntos quedan al final conforme a la instrucción del usuario. T093/T097 conservan empaquetado y aceptación transversal. Total: **60/98 completadas, 38 pendientes**.
