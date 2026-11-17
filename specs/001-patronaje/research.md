# Investigación y decisiones técnicas consolidadas

Fecha: 2026-11-14. Primera entrega de 001-patronaje, rama patronaje. Este documento consolida la investigación anterior y sustituye sus inventarios de pendientes desactualizados. No cambia aprobaciones de spec.md ni convierte decisiones técnicas en funcionalidades implementadas.

## Estado de las decisiones R-01 a R-05

| ID | Decisión de diseño | Verificación posterior |
|---|---|---|
| R-01 | Núcleo TS de líneas/Bézier, offset por tramo y unión por vértice; precisión acotada y cálculo exacto cuando los predicados filtrados no bastan. Sin Clipper global como generador canónico. | Exactitud, degeneraciones, detalles positivos y rendimiento en contratos geométricos. |
| R-02 | Perfil de exportación reproducible; servidor regenera y compara los bytes cargados; PDF.js contrasta geometría independientemente. PNG mediante el mismo resvg WASM y fuentes. | Determinismo Windows/Linux, archivos manipulados, tamaños máximos y recursos EC2. |
| R-03 | Escritor único, temporal/copia anterior verificados, intención, adaptador Windows de reemplazo y reconciliación por hashes. Documento y journal no son una transacción conjunta ficticia. | Fallos en cada frontera sobre discos locales y USB; comportamiento real del sistema de archivos. |
| R-04 | EC2 de pruebas 160 h/mes en Ohio, S3 privado y SES como diseño auxiliar; respaldo diario y preapagado de 7 días; fallo cancela apagado. | Saldo/vigencia y permisos reales, dominio/HTTPS/SES y ensayos de recuperación antes de desplegar. Producción requiere presupuesto y operación específicos. |
| R-05 | Matriz de versiones documentada, Argon2id, sesiones opacas, CSRF, protección de credenciales y política de validación local de contraseñas. | Compatibilidad real, dependencias transitivas, rendimiento, corpus y pruebas de autenticación. |

Las estrategias de diseño están concretadas en los documentos enlazados. Las verificaciones futuras no se presentan como realizadas ni se convierten en preguntas funcionales al usuario. Si una prueba demuestra que se necesita cambiar alcance o capacidad/coste, debe informarse antes de aplicar ese cambio. No se presupone despliegue ni contratación.

## Decisión, motivo y alternativas

| Decisión | Motivo | Alternativa considerada |
|---|---|---|
| Electron y adaptador Windows mínimo | Mantener TS/Node, aislamiento de procesos y semántica nativa de archivos | Tauri añade toolchain Rust/WebView2; navegador solo no cubre integración local |
| Next.js portal/PWA compartidos | Consulta y gestión comunes sin duplicar edición CAD | Apps nativas de tienda, aplazadas |
| Offset por tramo con joins propios | Uniones mixtas y puntas sin recorte automático aprobadas | ClipperOffset con tipo por recorrido y normalización requiere cambios que no equivalen al contrato |
| PDFKit y perfil determinista | Vector, escala y páginas grandes; verificación de origen reproducible | Captura canvas/impresión HTML no controla igual la geometría; confiar solo en hashes declarados no prueba origen |
| resvg WASM para PNG | Compartir rasterizador y fuentes entre Windows y servidor | Captura del renderer depende de GPU/navegador/fuentes instaladas |
| node-postgres y SQL explícito | Control de transacciones, cuota y revocación | ORM no sustituye esas invariantes y añade otra capa innecesaria inicialmente |
| JSON JCS y hashes separados | Identidad de revisión y detección de cambios de bytes sin confundirlas | ZIP/base embebida añade complejidad al editable inicial |
| Sesiones opacas revocables | Revocación efectiva y vencimiento absoluto de 7 días | JWT autocontenido como única autorización no satisface revocación inmediata |
| EC2 de pruebas con PostgreSQL local | Preserva stack y usa el presupuesto aprobado | Lightsail no seleccionado; RDS queda como alternativa de operación continua, no coste autorizado |
| Reloj monotónico + evidencia temporal | Cambios civiles no alteran plazos | Reloj del dispositivo como única autoridad contradice la spec |

## Aprobaciones preservadas

La spec conserva las aclaraciones del usuario y sus identificadores: por esquina, default esquinado, conservar puntas válidas, guardado local/USB y conflicto externo sin sobrescritura forzada. No volver a consultar estos puntos. Mantener ancho uniforme y bloqueos geométricos existentes. AWS: Ohio y 160 h/mes, no 24/7 ni Lightsail. El gasto de referencia sigue en aws-proposal.md y no se interpreta como coste garantizado.

## Referencias de diseño

- [Geometría y publicación verificable](contracts/geometry-print.md): algoritmos, fuentes primarias, tolerancias, perfiles y riesgos.
- [Persistencia y documento](contracts/local-document.md): IPC, JCS, conflicto externo, recuperación, fuentes Windows/Node.
- [Autenticación](contracts/authentication.md): parámetros, transporte, Unicode, corpus y fuentes de seguridad.
- [Matriz de runtime](runtime-matrix.md): versiones verificadas con fuentes de mantenedores; no instaladas.
- [API](contracts/api.md) y [modelo](data-model.md): DTO, errores, transacciones y estados.
- [AWS](aws-proposal.md): fuentes regionales oficiales y supuestos de consumo.
- [Guía futura de validación](quickstart.md): escenarios, interfaz de comandos prevista y criterios de evidencia.

## Resultado y límites

Se abandona el flujo de preguntas sobre detalles de ingeniería: se seleccionan y justifican aquí. La planificación no prueba que una biblioteca o un algoritmo cumpla los objetivos. La secuencia de guardado local 5/10/20/40/80/120 segundos concreta técnicamente las esperas crecientes aprobadas y conserva un contador separado del remoto; no cambia los plazos funcionales.

No hay cambios de coste aprobados ni recursos creados. Región, copias y reglas de márgenes no son pendientes. Vencimiento real de créditos, dominio, firma de distribución, acceso SES y política de servicio público son puertas antes de despliegue/liberación; no hace falta resolverlas mediante nuevas preguntas para documentar la implementación local y el entorno de pruebas. No se autoriza iniciar código o tasks de ejecución por haber consolidado este diseño.
