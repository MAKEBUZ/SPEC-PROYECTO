# Rediseño del escritorio — 0.1.5

Solicitud autorizada el 2026-11-16: rehacer la presentación del CAD, aclarar las acciones y añadir modo oscuro. Se mantiene la funcionalidad aprobada. No se modifica ni despliega AWS.

## Presentación

- Navegación lateral: Editor CAD, Impresión, Publicación, Recuperación y Mi cuenta, con iconos y descripciones.
- Barra de archivos con Guardar, Guardar como, Abrir y estado de cambios. Guardar local y publicar siguen siendo acciones distintas.
- Tablero claro con herramientas agrupadas y explicaciones del efecto de cada formulario. Panel de herramientas desplazable en ventanas amplias y disposición apilada en ventanas estrechas.
- Modo claro/oscuro con preferencia local persistente. El tablero y la colocación de impresión permanecen claros.
- Guías de impresión y publicación, resumen explícito de preparación/papel/piezas que se exportarán y explicación de guardado previo.
- Recuperación con tarjetas, fechas, estados y explicación de recuperar/descartar sin sustituir el original.
- Estilos de cuenta, formularios, avisos y operaciones integrados en el tema del escritorio. No se cambia el portal desplegado.

## Verificación

Pruebas locales con perfiles de Electron aislados, sin credenciales del usuario. El host de pruebas muestra su ventana sin activarla para evitar que Electron suspenda los fotogramas y provoque falsos tiempos agotados en interacciones/capturas. Ese ajuste pertenece únicamente al host de pruebas, no al arranque de producción.

Las capturas se generan en `.local/design-preview/`. Se comprueban tema persistente, navegación, geometría editable, preparación seleccionada, anchura de 800 px sin desbordamiento horizontal y tablero claro en ambos temas. La aceptación manual del instalador queda pendiente del usuario. Los ensayos físicos y tareas de aceptación general anteriormente aplazadas permanecen pendientes.

La barra de archivos muestra «Guardando…» y desactiva sus acciones hasta terminar. La ventana inicial aprovecha el área disponible de la pantalla (máximo 1360 × 900), sin excederla. El arrastre automatizado desplaza primero el tablero a la vista; los formularios avanzados se abren desde sus encabezados reales.

Validación final: TypeScript y build correctos; 54/54 pruebas dirigidas en 10 archivos (CAD, arrastre, deshacer/rehacer, metadatos, preparaciones, guardado/reapertura, recuperación, PDF, mensajes y diseño). Se revisaron capturas reales del renderer en claro/oscuro y ventana de 800 px. Se corrigieron adaptaciones del controlador de pruebas para abrir grupos y desplazar el tablero a la vista, y esperar a que finalice Guardar antes del cierre. El empaquetado 0.1.5 está en curso.

Cierre de empaquetado: instalador 0.1.5 generado y verificado en perfil aislado (nombre PATRONAJE, versión, dos relanzamientos con instancia única, fuente, WASM y adaptador nativo). Copia de entrega: .local/releases/PATRONAJE-0.1.5-Setup.exe; 186627072 bytes; SHA-256 e6388395021d3e7c4746105c811403ecbc4ed79ae607ccfa97a9aa209b774228. Instalación del usuario no modificada automáticamente. Aceptación manual del diseño/instalador pendiente; sin cambios AWS.

## Mi cuenta y navegación del tablero — 0.1.6 (2026-11-16)

Solicitud del usuario: reorganizar Mi cuenta y corregir tablero no centrado y sin desplazamiento, ilustrado con captura. La cámara anterior tenía un origen fijo junto a la esquina y no ofrecía navegación del lienzo.

- Cuadrícula cubre todo el lienzo; vista inicial centrada en el origen si está vacío y encuadre de piezas al abrir/cambiar conjunto de piezas. Centrar piezas y controles de zoom disponibles.
- Arrastrar espacio vacío desplaza la vista; Mover vista permite arrastrar desde cualquier lugar y el botón central también desplaza. Editar puntos conserva el arrastre de vértices de la pieza seleccionada. Navegar no modifica geometría ni estado guardado.
- Coordenadas del puntero usan el centro y zoom actuales y el rectángulo real del canvas. Se verificó después de desplazar, ampliar y redimensionar a 800 px.
- Cambiar la vista conserva campos de propiedades aún no aplicados. La identificación del formulario depende de los datos de la pieza, no de cada actualización visual.
- Mi cuenta muestra acceso, registro, recuperación y verificación por opciones separadas; perfil y seguridad tras autenticarse. Seguimiento de eliminación, papelera y actividad quedan en paneles plegables, con seguimiento activo. Reglas de autenticación y autorizaciones se conservan.

Validación: TypeScript, build de escritorio y build web local con Webpack correctos. 32/32 pruebas de CAD/diseño y 11/11 de cuenta con API/PostgreSQL efímero local; contenedor de prueba retirado. Capturas reales en .local/design-preview/viewport-v016.png y account-v016.png revisadas. Instalador 0.1.6 en empaquetado. Sin operaciones AWS ni modificación de documentos personales. Pendiente comprobación manual del usuario.

Entrega 0.1.6: instalador generado en .local/releases/PATRONAJE-0.1.6-Setup.exe; 186628608 bytes; SHA-256 3d063c367248fa878d73884e3ad4c4fa2723d83834953b70c385684387d0769b. Paquete verificado: PATRONAJE, versión 0.1.6, instancia única/restauración en dos relanzamientos y recursos nativos disponibles. Instalación personal no modificada; aceptación manual pendiente. Sin AWS.

## Dibujo directo, atajos y curvas — 0.1.7 (2026-11-17)

Solicitud expresa: sustituir el flujo principal de creación por texto por puntos individuales en el tablero; añadir clic derecho/atajo, Ctrl+Z, rueda y edición más clara de curvas y esquinas.

- Nuevo contorno / P activa colocación con clics. Cada punto y su tramo constituyen un único cambio reversible, y quedan en el documento editable desde el primer clic (sin borrador oculto al guardado/recuperación). Clic en el primer punto cierra por identidad; Esc termina abierto conservando lo dibujado.
- Clic derecho: Añadir punto aquí, Insertar punto en el tramo y Centrar piezas. Las coordenadas avanzadas quedan como opción secundaria plegada; puntos numerados y edición X/Y individual en el panel.
- Ctrl+Z deshace, Ctrl+Y/Ctrl+Shift+Z rehacen fuera de campos de entrada. La edición de texto conserva el comportamiento nativo. Se evita que un acelerador del menú de Electron capture estos atajos antes del renderer.
- Rueda acerca/aleja alrededor del cursor, sin desplazar la página ni modificar el documento; se conserva el desplazamiento del lienzo.
- Próximo tramo Recto/Curvo durante dibujo, incluido el cierre. Curvar tramo convierte una recta con una acción reversible. Tiradores naranjas arrastrables con vista transitoria; solo se confirma al soltar, Esc cancela el gesto.
- Redondear esquina permite pulsar directamente el vértice del margen; ancho accesible junto a la herramienta y explicación de que afecta al margen de costura, no al contorno base. Se conservan los controles numéricos de esquina.
- Aviso de herramientas con altura estable para evitar desplazamientos del tablero al pulsar Esc. Geometría de producción, formato editable, guardado y reglas de exportación conservados.

Validación: TypeScript/build correctos; regresión de 55 pruebas en 11 archivos aprobada (edición, historial, dibujo, preparaciones, PDF y recuperación). Tras añadir una prueba de cierre curvo y ajustar Esc, repetición dirigida de 4 pruebas aprobada: 56 escenarios distintos cubiertos en total. El escenario gráfico verifica clics, menú, insertar, deshacer/rehacer, preservación de texto, acelerador nativo, rueda anclada al cursor, gesto de tiradores/cancelación, margen y guardado/reapertura. Captura real revisada: .local/design-preview/graphical-v017.png. Instalador en empaquetado; aceptación manual del usuario pendiente. Sin AWS ni modificación de archivos personales.

Entrega 0.1.7: instalador .local/releases/PATRONAJE-0.1.7-Setup.exe; 186631168 bytes; SHA-256 9f2c7ebd3ff19d780da2f022eb17a29c8617ff4f5017fb03acfbfd1311ea88df. Paquete comprobado: versión/nombre, instancia única con dos relanzamientos, recursos y adaptador nativo. Instalación personal no modificada; comprobación manual pendiente. Sin AWS.
