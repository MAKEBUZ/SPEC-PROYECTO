# Generación y verificación PDF — 2026-11-16

Implementación local de T071/T076/T077/T080 y cierre de T049. No despliegue ni AWS.

El generador PDFKit 0.20.2 usa la fuente Noto fijada por hash, metadatos constantes y un perfil `patronaje-pdf-1`. Produce vectores a escala 1:1, contorno base discontinuo y margen continuo, leyenda, datos e hilo, cuadrado de 100 mm, mosaicos A4/Carta con solape de 10 mm y montaje, o página grande con UserUnit y banda auxiliar inferior.

PDF.js 6.5.438 decodifica operadores, matrices, UserUnit y recortes. Compara trayectorias completas mediante correspondencia paramétrica y la propiedad de envolvente convexa de Bézier: error de controles <=0,02 mm, más aproximación certificada de margen <=0,005 mm. Comprueba marcas y auxiliares, rechaza operadores no admitidos, acciones, adjuntos y anotaciones. No usa un manifiesto incrustado como prueba geométrica. La validación remota exige además regeneración y coincidencia exacta de bytes; procesa un PDF a la vez dentro del worker aislado y conserva el bloqueo global de trabajo intensivo.

Evidencia ejecutada:

- 9/9 geometría PDF: reproducibilidad, A4/Carta, escala, página de pieza de 5 m, 250 páginas inclusivas, pieza inválida no seleccionada, cubic rotada 90°, rechazo de alteración y truncado. PDF renderizado e inspeccionado en `.local/validation/print-preview.png`.
- 1/1 verificador remoto: revisión/preparación/perfil incorrectos y metadatos modificados rechazados.
- 17/17 integración con PostgreSQL efímero: publicación válida con PDF, conjunto alterado rechazado sin crear versión, regresión de transacciones y publicaciones PNG.
- 20/20 acciones de documento, IPC y preparaciones: guardar cancelado/fallido conserva cambios y no genera; bloqueo de edición/deshacer durante exportación.
- 100/100 geometría; 61/61 impresión y worker al ejecutar `tests/print` junto con la prueba de guardado. La prueba de guardado encontró EPERM del aislamiento en rename; repetida fuera del aislamiento: 1/1 correcta.
- Worker: snapshot copiado, generación y verificación separadas de main; cancelación de cálculo ocupado bajo el objetivo de 5 segundos.
- 1/1 E2E Electron de PDF: abrir documento, modificar preparación, pedir guardar, generar y verificar PDF real, recuperar edición. Necesita ejecución fuera del aislamiento de Windows. La prueba previa de preparaciones con reinicio agotó 60 s y no se cuenta como aprobada en esta pasada.
- TypeScript y build de escritorio correctos; advertencias existentes de tamaño de bundle/directivas de cliente.

T078 sigue abierta por aceptación de rendimiento del corpus. Exportación, diálogo de guardado, estados y cancelación conectados; cancelación real desde la interfaz <5 s, conservación del PDF anterior y recuperación de edición comprobadas. Una consulta de estado fallida conserva el bloqueo y reintenta solo la consulta. Se liberan las referencias a bytes/worker al terminar. T079/T052 siguen pendientes del registro/selección de PDF y enlace a publicación. No confundir exportación local con haber completado publicación opcional.

Repetición tras diagnóstico: 2/2 E2E Electron correctos (exportar/cancelar y preparaciones con cierre/reapertura), 40,23 s en conjunto. El cierre fallaba porque la limpieza de eventos recuperaba `window.webContents` después de destruir la ventana; ahora conserva la referencia original. Se mantuvo la protección de cambios sin guardar y se retiró el diagnóstico temporal. No se aumentó el timeout del ensayo. 22/22 pruebas dirigidas de acciones, worker y lifecycle; 1/1 catálogo persistido/reabierto con verificación PDF real en worker. Los procesos de prueba huérfanos de los intentos fallidos fueron identificados por su entrypoint/perfil temporal y retirados.

Una prueba exploratoria de Bézier rotada 37° tardó más de lo aceptable y fue interrumpida; la prueba funcional de 90° sí pasa. No se introduce un límite geométrico ni se declara logrado el objetivo de 60 segundos para todo el corpus. Investigar el coste algebraico en T078/T081. Pruebas físicas, matriz real de dispositivos y determinismo Windows/Linux del PDF siguen pendientes.

## Cierre posterior de T079 y T052

El catálogo queda conectado a la exportación y al selector de publicación. El proceso principal captura el documento guardado, verifica bytes en worker y registra metadatos inmutables; solo ofrece PDF de esa revisión y preparación. La selección acepta identidades hash, nunca rutas ni una afirmación de validez desde renderer. Cambiar la revisión reinicia la selección. Continuar una carga obtiene los archivos del manifiesto persistido original, incluso después de reiniciar el CAD. Cancelar el registro posterior a guardar conserva el PDF final y advierte que todavía no está registrado para publicación.

Validación final: 45/45 pruebas locales en nueve archivos; 5/5 E2E de publicación con Electron, API y PostgreSQL reales. El escenario PDF exporta, selecciona, prepara tres archivos, interrumpe una carga, reinicia el CAD, continúa con los PDF originales, confirma la versión y compara los bytes descargables del servidor con el PDF local. Otro reinicio conserva el catálogo. Regresiones de primera publicación y conflictos incluidas. TypeScript/build correctos y contenedor retirado. Esta evidencia sustituye el pendiente de integración T079/T052 señalado arriba, sin cerrar T078/T081 ni aceptación física.

## Optimización exacta de signos y regresión de rotación

Se añadió evaluación por intervalos exactos de Horner antes del GCD/Sturm en `RootField.sign`. Solo se retorna un signo si el intervalo completo excluye cero; igualdad o incertidumbre mantienen el procedimiento algebraico anterior. Se conserva la aritmética racional, incluidos valores separados por menos que la precisión de coma flotante. La escena reutiliza las cajas obtenidas por su propia validación; el verificador independiente vuelve a validar desde cero.

El caso de una cúbica sin margen rotada 37°, antes interrumpido al superar 60 s, generó y verificó el PDF en 34,8 s en el primer ensayo y 36,5 s en el posterior. La prueba permanente `rotated-export.spec.ts` usa explícitamente el worker compilado, exige estado `verified` y medición 1:1 y pasó en 36,85 s de ejecución total de la suite. No admite `null` como resultado ni toma la salida de un worker fallido como exportación válida.

Regresión geometría/impresión/polinomios: 171/171 en 16 archivos. El objetivo completo de T078/T081 sigue pendiente: estas mediciones no incluyen guardado final ni las diez repeticiones por carga de quickstart. No se añade timeout al producto; el watchdog pertenece exclusivamente al ensayo.
