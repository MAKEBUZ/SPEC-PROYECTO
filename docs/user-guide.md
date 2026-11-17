# Uso local de la primera entrega en desarrollo

Esta guía describe los recorridos implementados y probados localmente. Todavía no es una entrega instalada para usuarios: faltan tareas de integración y aceptación indicadas en `validation/current-status.md`. El entorno de ensayo y sus comandos están en `../specs/001-patronaje/quickstart.md`.

## Cuenta y documentos

Registra una cuenta, verifica su correo e inicia sesión con conexión antes de habilitar el CAD. Los ensayos capturan el correo localmente; no envían mensajes a destinatarios reales. Después de habilitar el trabajo local, cerrar o perder la sesión remota permite seguir editando, guardando y exportando. Publicar y consultar la cuenta exige conexión y una sesión válida.

Crea un documento local y guarda su archivo editable `.patron` en disco local o USB. No se admiten todavía carpetas de red o sincronizadas. El formato propio conserva piezas y preparaciones; un archivo inválido no sustituye el documento abierto. Ante cambios sin guardar, elige guardar, descartar o cancelar según el diálogo. Un fallo de guardado conserva los cambios y evita la operación que dependía de él.

La recuperación ofrece abrir o descartar una copia recuperable; no sobrescribe ni publica automáticamente. «Eliminar copia local» utiliza la papelera del sistema y conserva la copia de la cuenta. Si la papelera no está disponible, no se borra definitivamente el archivo.

## Piezas y preparación

Dibuja rectas y curvas con puntos y tiradores, cierra los contornos y utiliza los comandos de mover, duplicar, rotar y reflejar. Puedes deshacer y rehacer. Define nombre, talla, cantidad entera positiva y línea de hilo; el corte al doblez es opcional. El margen uniforme es no negativo y puede retirarse sin modificar el contorno base. Sus esquinas son esquinadas inicialmente y pueden configurarse individualmente como redondeadas.

En «Preparación de impresión», crea una preparación con nombre y selecciona las piezas. Moverlas o rotarlas aquí cambia únicamente la colocación de impresión. Guarda el documento para conservar todas las preparaciones. Puedes renombrarlas, duplicarlas y eliminarlas con confirmación; deshacer la eliminación funciona durante la sesión.

Una pieza seleccionada faltante, un contorno inválido, un margen inválido, solapamientos o una separación exterior menor de 2 mm bloquean el PDF. Se valida la selección y su preparación, con estructura válida del documento; una pieza inválida no seleccionada no bloquea por sí sola la exportación.

## Generar PDF

Elige gran formato o mosaico A4/Carta. El margen imprimible uniforme empieza en 10 mm. «Generar PDF» pide guardar cuando corresponde; si cancelas o falla el guardado, no genera el PDF. Durante la generación la preparación queda bloqueada y se muestra el estado. «Cancelar exportación» muestra «Cancelando»; se conserva la preparación y cualquier PDF anterior.

El archivo contiene contorno base y margen con estilos distintos, leyenda y control de 100 × 100 mm. El mosaico añade hoja de prueba, montaje, numeración y solape de 10 mm. Imprime a tamaño real, sin ajustar a página; mide ambos lados del cuadrado y acepta entre 99,5 y 100,5 mm. Esta comprobación física sigue pendiente de ensayo con tu impresora.

Límites: pieza de hasta 5 × 5 m con margen, composición hasta 10 × 10 m, 100 piezas seleccionadas y 250 páginas A4/Carta contando auxiliares. El objetivo de generación es 60 segundos y el de cancelación 5 segundos; falta validar el rendimiento de todas las cargas de aceptación.

## Publicar y consultar

Guardar modifica solo el archivo local. En «Publicación», guarda el documento, pulsa «Preparar editable y vista previa», elige o crea un proyecto activo y pulsa «Publicar versión». La nueva versión incluye el editable y la vista previa; la anterior permanece intacta.

Para añadir PDF, genéralos desde la revisión guardada, pulsa «Actualizar PDF disponibles», selecciónalos y vuelve a preparar el conjunto. Solo se admiten PDF verificados de esa revisión. La publicación del conjunto es completa o no se publica: no se muestra una versión parcial.

Si se interrumpe la carga, «Continuar carga» recupera el conjunto original. Si el resultado es incierto, usa «Comprobar ahora» o el seguimiento de operaciones; no inicies otra publicación para sustituir una cuyo resultado se desconoce. Ante un conflicto puedes conservar el trabajo como patrón independiente o cargar la versión remota con respaldo local previo.

En el portal, «Mis proyectos» permite consultar patrones, versiones, vista previa y descargas. Los PDF muestran escala y dimensiones verificadas. La PWA es instalable, pero la instalación física en Android e iPhone está pendiente de aceptación. No es un editor CAD móvil.

## Papelera y eliminación de cuenta

La eliminación remota es independiente del archivo local. En el portal abre «Proyectos y papelera» desde la biblioteca; en el CAD abre «Proyectos y papelera de la cuenta». Elige un proyecto o sus patrones y revisa el contenido antes de confirmar su envío a papelera.

«Ver papelera» muestra el vencimiento original y permite revisar una restauración o eliminación definitiva. La recuperación dura 30 días; los patrones eliminados por separado conservan su plazo. Un recurso dependiente o vencido puede impedir la operación. La eliminación definitiva exige reconocer expresamente la pérdida de recuperación.

Si el contenido cambió, vuelve a revisarlo antes de confirmar. Si la respuesta se pierde, consulta «Comprobar pendientes» o el historial: no repitas la operación para averiguar si terminó. El seguimiento persiste al reabrir. Las copias locales permanecen intactas.

Eliminar la cuenta exige contraseña y escribir «ELIMINAR MI CUENTA». Durante 30 días puede recuperarse desde el acceso limitado; recuperar exige confirmación y luego un nuevo inicio de sesión. El seguimiento limitado informa del resultado durante 90 días desde su confirmación. Un error o una cuenta ausente no se interpreta como eliminación confirmada. Los documentos locales se conservan.

## Alcance pendiente

No se entregan colaboración, notificaciones, importaciones externas, adjuntos arbitrarios ni módulos aplazados. La entrega actual tampoco habilita publicación automática ni escalado de tallas aplazados. Para aceptación faltan, entre otros, seguimiento transversal, respaldos/restauración, instalador, ensayos físicos y rendimiento completo. No se han desplegado servicios AWS.
