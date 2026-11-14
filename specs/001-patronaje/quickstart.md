# Guía de validación futura

Implementación local iniciada el 2026-11-14. Ya existen manifiestos, lockfile y pruebas de fundamentos. Disponibles: `npm ci --ignore-scripts`, `npm run check` y `npm run test:unit`. Véanse `../../tools/validation/commands.md` y `../../docs/validation/foundations.md`. No hay todavía una aplicación funcional ni despliegue AWS.

## Interfaz prevista de validación

La tabla describe el contrato completo de validación. Solo los comandos señalados arriba están operativos; las suites restantes fallan explícitamente si aún no existen y los comandos dev siguen pendientes. El gestor es npm con workspaces y lockfile versionado.

| Orden futuro | Propósito y resultado esperado |
|---|---|
| npm ci | Instalar exactamente el lockfile aprobado; falla ante divergencias |
| npm run check | Tipos y análisis estático en todas las aplicaciones/paquetes |
| npm run test:unit | Geometría, serialización, reglas de impresión y estados locales |
| npm run test:integration | PostgreSQL/almacenamiento de ensayo, publicación, cuotas, sesión y fallo en cada frontera |
| npm run test:e2e | Flujo CAD → publicación → portal/PWA, con cuentas y documentos sintéticos |
| npm run test:recovery | USB, disco lleno, cambio externo, interrupciones y reconstrucción de estados |
| npm run test:print | Medición independiente y fixtures de PDF grande/mosaicos |
| npm run test:performance | Registrar cada ejecución y sus recursos, objetivos 60s/5s y recuperación 60s |
| npm run dev:desktop / dev:web / dev:api | Arranque local de cada aplicación; no despliega AWS |

Prerequisitos futuros: runtime-matrix.md, herramientas Windows del adaptador, PostgreSQL de ensayo, almacenamiento privado de ensayo y correo capturado sin destinatarios reales. Configuración separada de pruebas, credenciales fuera del repositorio y ninguna dependencia de datos productivos. La preparación de base y fixtures será parte del arnés de integración, con protección explícita contra apuntar a una base ajena. No se promete que un comando compruebe impresión física o instalación PWA: esos ensayos requieren los dispositivos definidos.

## Referencia de rendimiento aprobada

Windows 11 x64 con 4 núcleos, 16 GB de RAM y SSD es el equipo de referencia para medir rendimiento, no un mínimo excluyente. El mínimo admitido se determinará mediante pruebas durante la implementación y antes de declarar compatibilidad de entrega; no se excluyen por ahora equipos inferiores. Las pruebas no autorizan reducir funciones ni cambiar costes sin consultar. Teléfonos físicos Android e iPhone según el soporte aprobado en runtime-matrix.md. Entorno PostgreSQL/blobs privados/correo de pruebas. Fijar versiones exactas antes de medir. Sin datos de usuarios reales.

## Recorridos verificables

1. Registrar/verificar: CAD bloqueado antes de verificar; después crear documento sin proyecto remoto y trabajar desconectado.
2. Dibujar rectas/Bézier, transformar, margen, datos y marcas; deshacer/rehacer y guardar/reabrir conservan información y medidas.
3. Documento nuevo: provocar cierre después de copia de recuperación; ofrecer recuperar/descartar sin sustituir archivo guardado ni publicar.
4. PDF con pieza abierta no seleccionada: permitido si selección/preparación válidas. Seleccionarla bloquea. Estructura inválida bloquea siempre; cancelar guardado no produce PDF.
5. PDF A4/Carta: solape 10mm, marcas, leyenda, fila/columna, control 100mm y montaje. Gran formato: 10m más franja y UserUnit.
6. Lectura independiente mide error bidireccional <=0,1mm. Prueba física cuadrado 100mm dentro de ±0,5mm; validación matemática no prueba impresora.
7. Publicar sin PDF; añadir PDF crea otra versión. Fallar cada archivo y commit nunca muestra parcial.
8. Concurrencia: versión esperada y cuota; 100000000 bytes por archivo y 2000000000 por cuenta inclusivos. Papelera consume cuota.
9. Perder respuesta commit: consultar resultado, no duplicar. Revocar sesión antes de confirmar: rechazar sin perder trabajo.
10. Instalar PWA física, abrir icono, consultar y descargar editable/PDF verificando hashes. Logout no deja caché privada accesible.
11. Papelera y eliminación/recuperación de cuenta respetan plazos, titularidad y documentos locales.
12. Reloj, suspensión, reinicio, journal dañado, respuestas tardías y fallo de escritura: consulta <=30s, persistencia aparte, no doble fallo por intento.

## Rendimiento

Fixtures propuestos: pequeño 10 piezas/20 segmentos; medio 50/100; grande 100/500 con rectas y curvas, margen y marcas. Caso tiled hasta 250 páginas contando auxiliares y otro gran formato al máximo dimensional. Son cargas de ensayo, no máximos adicionales del producto.
Casos negativos separados: cruces/contactos, tangencias, margen inválido y separación 2mm. Medir 10 ejecuciones por carga y registrar cada tiempo/equipo/versiones: PDF<=60s, cancelación<=5s, recuperación<=60s. No usar promedios para ocultar incumplimientos ni declarar probado sin ejecutar.

## Fallos y operación

### Validación documental del respaldo y apagado de pruebas

Política aprobada: Ohio, EC2 unas 160 h/mes; respaldo PostgreSQL diario mientras esté encendido y antes del apagado planificado; conservación 7 días. Un fallo de respaldo cancela el apagado, avisa y deja disponible el reintento. No ejecutar este procedimiento en esta fase.

Diseño propuesto: copia lógica consistente de PostgreSQL con pg_dump en formato de archivo, acompañada de versión de esquema y manifiesto de objetos S3 referenciados. Los roles y permisos del clúster requieren recuperación explícita porque no forman parte de la copia de una sola base. Guardar la copia fuera de EC2 y comprobar transferencia, integridad y lectura antes de registrarla como completada. Una comprobación de checksum no sustituye una prueba de restauración. Fuente: [PostgreSQL: SQL Dump](https://www.postgresql.org/docs/current/backup-dump.html).

Antes del apagado, suspender nuevas mutaciones y drenar operaciones en curso para evitar escrituras posteriores al punto respaldado. Si falla el respaldo, cancelar el apagado y salir de ese estado de mantenimiento; conservar el trabajo confirmado y la copia anterior. Este procedimiento no concede autorización para automatizar apagados ni afecta las operaciones locales del CAD.

Casos futuros de aceptación:

- Fallar la generación, carga o verificación de la copia: no emitir éxito ni detener EC2; aviso y reintento disponibles.
- Completar la copia previa al apagado: registrar referencia y resultado antes de continuar con el apagado solicitado.
- Restaurar en un entorno aislado: comprobar esquema, restricciones, relaciones de versiones y hashes de objetos antes de habilitar acceso; no enviar correos ni ejecutar trabajos pendientes durante el ensayo.
- Restaurar un respaldo anterior a una eliminación definitiva: impedir reactivación de cuentas/recursos y no reabrir el servicio si no puede reconciliarse con evidencia posterior fiable. Aplicar el registro S3 de supresión y el watermark del BackupManifest definidos en data-model.md; pg_dump no sustituye esa evidencia.
- Comprobar que la limpieza de copias a los 7 días no cambia la papelera del producto ni elimina archivos activos. Validar antes de desplegar la coordinación diseñada entre copias de base, objetos S3 y eliminaciones definitivas.

Red interrumpida en carga/commit/descarga; disco lleno, archivo ocupado y permisos denegados; terminar procesos en fronteras de persistencia; publicaciones concurrentes. Restaurar backup en entorno aislado y aplicar tombstones antes de servir datos.

## Puerta a implementación

Revisar plan, contratos y pendientes operacionales; obtener autorización expresa antes de código. Probar viabilidad geométrica/PDF/PWA será trabajo de implementación futura, no ejecutado aquí. Esta guía no autoriza contratar ni desplegar servicios.
