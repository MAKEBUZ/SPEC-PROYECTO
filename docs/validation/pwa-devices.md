# Protocolo de aceptación de PWA

Estado: pendiente de dispositivos físicos. La prueba automatizada de Edge en localhost valida manifiesto, iconos, service worker y caché pública; no acredita instalación en Android/iPhone.

Registrar por ejecución: fecha, dispositivo, RAM, versión exacta de SO y navegador, URL HTTPS de ensayo, revisión de código, resultado y evidencia. No usar cuentas ni patrones de producción.

1. Android 12 o posterior con Chrome: abrir el portal, instalar desde el navegador y abrir desde su icono. Verificar nombre, icono, modo independiente y legibilidad en orientación vertical/horizontal.
2. iPhone con iOS 17 o posterior y Safari: añadir a pantalla de inicio y repetir desde el icono, además de Safari normal. No equivale a distribución en tiendas.
3. Registrarse, verificar correo, iniciar sesión y consultar el mismo proyecto publicado desde CAD. Comprobar historial, vista previa privada y distinción entre PNG y PDF de producción.
4. Descargar editable y PDF real cuando US6 esté disponible; comparar tamaño y SHA-256 contra FileView. Interrumpir red y comprobar que una descarga incompleta no se ofrece como archivo válido. Reintentos y rangos deben autorizarse nuevamente.
5. Cerrar sesión y volver atrás, cambiar de cuenta, cerrar/reabrir y quitar la conexión. No deben aparecer respuestas privadas en CacheStorage ni proyectos de otra cuenta. Sin conexión, la navegación muestra únicamente la página neutral.
6. Revocar sesión durante transferencia: permitir terminar la iniciada; rechazar una nueva descarga o reanudación. Restablecer acceso mediante inicio de sesión nuevo.
7. Repetir consulta/descarga en Chrome y Edge de Windows, estable actual y anterior según runtime-matrix.md. Registrar los números de versión probados.

Pendientes: teléfonos reales, instalación desde icono, descargas PDF de US6 y validación de consumo/rendimiento. No desplegar un servidor ni contratar servicios como parte de este protocolo sin autorización.

## Verificación local 2026-11-16

T068 completada como implementación. Build Next de producción correcto; 2/2 E2E Edge local en 2,52 s. Comprueba recursos instalables, caché exclusiva de página neutral/iconos, navegación offline y layouts de 320×640 y 844×390. No prueba instalación desde icono en teléfonos ni versiones anteriores de navegadores. T065/T069 permanecen pendientes de esa matriz; véase `intervention-queue.md`.
