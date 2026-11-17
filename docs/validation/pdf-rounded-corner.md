# PDF de esquina redondeada oblicua — corrección 0.1.9

Fecha: 2026-11-17. Código: 9b03ada. Sin cambios en AWS.

## Incidencia y causa

El usuario informó de una espera de 20 minutos al exportar una pieza con esquina redondeada oblicua, otra curva y margen de 10 mm. El aviso de cambio de geometría era informativo. Se reprodujo la demora en la validación exacta del margen y en las conversiones de sus coordenadas algebraicas. La prueba rectangular anterior no cubría este caso.

## Corrección

- Certificado exacto de separación entre la envolvente de control y una recta de soporte, evitando resolver intersecciones innecesarias.
- Cotas racionales de radicales y de sus expresiones; solo deciden signos cuando el intervalo lo prueba. Los casos inciertos conservan la resolución exacta.
- Conversiones numéricas verificadas mediante cotas; la paginación conserva las decisiones exactas y la escala 1:1.
- Las aristas puntuales de una aproximación conservan su procedencia y error; se omiten únicamente de la comprobación topológica del polígono derivado. Las distancias incluyen esos puntos. No se eliminan segmentos del documento ni se relajan las validaciones de producción.
- Intersecciones conocidas en extremos compartidos evitan divisiones algebraicas redundantes; los solapes se siguen comprobando.
- Aviso de geometría aclarado, tiempo transcurrido visible y aviso después de 60 s. Cancelación manual; no se impone cancelación automática.

## Evidencia

- TypeScript y build correctos.
- 535/535 pruebas en tests/unit, tests/geometry y tests/print, incluidos el nuevo caso oblicuo y el PDF verificado.
- 22/22 comprobaciones adicionales después de optimizar los extremos compartidos. Los recuentos se solapan.
- Electron: exportación, indicador de tiempo, rechazo de datos inválidos y cancelación con recuperación de edición correctos.
- Paquete 0.1.9: arranque, nombre, instancia única y dependencias comprobados. Instalación manual de esta actualización por el usuario pendiente.
- Archivo afectado: generación y verificación independientes completas en **132.45 s**, PDF de 40738 bytes. La medición se realizó con otras validaciones/empaquetado locales y no certifica rendimiento en otros equipos. La fixture del repositorio conserva solo geometría, sin nombres, rutas personales ni datos de cuenta.

## Límite pendiente

El objetivo aprobado de 60 segundos **sigue incumplido para este caso complejo**. No se cambia ese objetivo ni se acredita cumplimiento integral. La corrección permite completar este caso; no garantiza un tiempo máximo para todas las geometrías. Siguen pendientes las pruebas físicas anteriores.

## Instalador

PATRONAJE-0.1.9-Setup.exe, 186637824 bytes. SHA-256: 882332e71a6dd205f9e8c8e279fa265a3da60ec666e9171e44f5d360bc8ecaa5. Artefacto local, no incluido en Git.
