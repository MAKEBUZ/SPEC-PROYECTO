# T079 — persistencia y selección interna de artefactos, 2026-11-16

Estado: parcial. No se ha habilitado exportación ni selección de PDF en la interfaz.

`packages/document/src/pdf-artifact.ts` define el registro de origen: identidad de documento, revisión guardada, identidad y hash canónico de preparación, SHA-256 y longitud de bytes, perfil, dimensiones de cada página en milímetros y escala 1:1. La identidad del registro deriva de esos datos; no depende del reloj o nombre de archivo. El objeto devuelto queda congelado, incluidas las páginas. El registro se guarda fuera del editable y no altera su revisión ni versiones anteriores.

`PdfArtifactStore` en main conserva bytes y registro por identidad, con escritura exclusiva y verificación de relectura. Publica el registro después de los bytes; un binario sin registro no aparece en el catálogo. Repetir el mismo artefacto compara el contenido existente sin sobrescribirlo. Una escritura incompleta o corrupción no se repara automáticamente ni permite usar el artefacto. La reapertura verifica tamaño, hash y registro antes de devolverlo.

El catálogo filtra por documento y revisión; la selección comprueba también la preparación y rechaza duplicados. Solo acepta identificadores de artefacto, no rutas suministradas por la interfaz. Cada selección vuelve a llamar al verificador e impide cambiar escala, dimensiones o perfil respecto del registro original.

El constructor de conjuntos de publicación admite una selección explícita procedente del almacén. Añade sus bytes y metadatos al nuevo manifiesto; no modifica conjuntos anteriores ni admite adjuntos arbitrarios. La publicación habitual sin PDF conserva su comportamiento.

## Evidencia

- 178/178 pruebas locales en 40 archivos: regresión de recuperación, publicación, sesiones, IPC y contratos. Incluye 7 nuevas pruebas sobre artefactos, corrupción, reapertura, revisión incorrecta, duplicación, ausencia/fallo del verificador y manifiestos con selección explícita.
- 21/21 pruebas de integración en `desktop-publication.spec.ts` y `publication.spec.ts`, con PostgreSQL efímero local retirado al terminar. Conserva publicación atómica y rechazo remoto de PDF no verificables.
- TypeScript y build desktop correctos. Persisten las advertencias existentes de tamaño del bundle y directivas `use client`.

Los PDF usados en las pruebas del almacén son bytes de ensayo con un verificador controlado. Estas pruebas acreditan persistencia, origen y ensamblado; **no acreditan geometría, seguridad ni exactitud de un PDF real**. El almacén deniega persistir/seleccionar sin verificador y no se instancia desde el runtime de producción todavía. No se añadió un perfil PDF de producción ni se cambió el rechazo remoto existente.

## Dependencias para cerrar T079 y avanzar T052

Completar T071/T074/T076/T077/T078: validación de producción, generación, verificación independiente y exportación local. Conectar la salida final verificada al almacén y añadir catálogo/selección mediante capacidades IPC en Publicación. Completar T080/T049 para regeneración y verificación remota antes de habilitar publicación de PDF, según geometry-print.md. Ejecutar los recorridos reales y las verificaciones pertinentes de T081.

T079 y T052 permanecen sin marcar. Estado del proyecto: 67/98 completas, 31 pendientes. T039 físico aplazado. Sin despliegues, llamadas ni gastos AWS.
