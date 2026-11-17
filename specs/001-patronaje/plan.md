# Implementation Plan: PATRONAJE — primera entrega

> Estado vigente 2026-11-17: primera entrega aprobada, implementación local autorizada desde el 2026-11-14 y en validación. 90/98 tareas completas; aceptación integral pendiente. El piloto AWS tuvo autorización posterior independiente; esta revisión documental no realiza operaciones ni gastos AWS. Véase [informe consolidado](../../docs/validation/delivery-report.md).


**Rama:** patronaje. **Feature:** 001-patronaje. **Fecha:** 2026-11-14.
**Spec:** [spec.md](spec.md), aprobada. **Estado:** Approved — aprobado explícitamente por el usuario el 2026-11-14; la implementación local fue autorizada posteriormente. La autorización inicial para preparar tareas es un antecedente histórico, no una restricción vigente.

## Summary

CAD descargable Windows 11 de 64 bits (x64) para crear, guardar, recuperar y exportar patrones; portal Next.js y PWA Android/iPhone para cuenta propia, publicación, consulta y descarga. Se conservan todas las decisiones aprobadas y aplazamientos: variantes de talla, colaboración, notificaciones de colaboración, publicación automática, importaciones externas y otros sistemas de escritorio quedan fuera de esta entrega.

## Technical Context

- TypeScript estricto, npm workspaces y dependencias fijadas: [runtime-matrix.md](runtime-matrix.md). C++ únicamente para el adaptador Windows de persistencia; no sustituye el núcleo geométrico TS.
- CAD: Electron, React, Tailwind y Three.js. Renderer aislado, sandbox/contextIsolation, sin Node; preload mínimo y main valida origen, capacidades y rutas.
- Portal/PWA: Next.js y React compartidos en apps/web. Consulta y gestión, sin editor geométrico móvil.
- Backend: monolito modular NestJS, PostgreSQL y node-postgres; migraciones versionadas, SQL parametrizado, una conexión por transacción.
- Archivos: .patron JSON UTF-8 versionado, revisión canónica JCS/SHA-256, recuperación/journal independientes, almacenamiento remoto S3 privado. Documentos locales y USB; guardado directo en red y carpetas sincronizadas aplazado.
- Impresión: PDFKit vectorial, procesos separados, perfiles reproducibles y comprobación independiente. Contrato [geometry-print.md](contracts/geometry-print.md).
- Validación: existen ejecuciones unitarias, integración PostgreSQL, E2E, fallos de guardado y geometría/PDF. Teléfonos reales, USB, impresión y equipo de referencia conservan pendientes. Durante la fase histórica de planificación no se habían instalado dependencias ni ejecutado la aplicación.
- Objetivos aprobados: PDF completo <=60s; cancelación <=5s; recuperación local <=60s. Máximos de pieza 5m por eje, composición 10m más auxiliares, 100 piezas y 250 páginas; desviación PDF <=0,1mm. No se añaden mínimos positivos ni límites de complejidad geométrica.

## Decisiones aprobadas conservadas

- Unión de margen por esquina, redondeada o esquinada; esquinada inicialmente y elecciones existentes conservadas. Ancho uniforme por pieza. Puntas sin límite adicional ni recorte automático, sujetas a las validaciones existentes.
- Cambio externo del archivo abierto: bloquear sobrescritura y ofrecer guardar como otro archivo o cancelar, conservando memoria. No existe sobrescritura forzada.
- AWS de pruebas: EC2 unas 160 h/mes en us-east-2 (Ohio), cuenta nueva con 100 USD declarados. Referencia 13,09 USD/mes según [aws-proposal.md](aws-proposal.md), no garantía de consumo ni autorización de cargos.
- Respaldo PostgreSQL diario mientras esté encendido y antes del apagado planificado, conservación 7 días. Si falla, cancelar apagado, avisar y permitir reintento; horas adicionales consumen créditos. La política de producción no queda aprobada por esta decisión de pruebas.

## Diseño por fronteras

### Local y geometría

Modelo independiente de Three.js, líneas y Bézier cúbicas en mm; la escena no es fuente de verdad. Cierre por identidad/conectividad, no por tolerancia de exportación. Comandos reversibles y snapshots de revisión guardada. Guardar antes del PDF; fallo o cancelación no exporta.

Persistencia con escritor único, temporal verificado en mismo volumen, copia anterior independiente, intención persistida y reemplazo Windows; reconciliar candidatos por hash ante interrupción. Recuperación en disco local aunque el destino sea USB. No afirmar atomicidad entre varios archivos ni inmunidad a daño físico. Contrato completo: [local-document.md](contracts/local-document.md).

Márgenes mixtos se construyen por tramo/vértice sin reparación silenciosa ni MiterLimit que cambie la forma. Geometría, tolerancia y verificación de artefactos en [geometry-print.md](contracts/geometry-print.md). Las pruebas numéricas son una puerta de validación; no una pregunta pendiente de producto.

### Autenticación, publicación y recuperación remota

Sesiones opacas revocables, contraseñas Argon2id, cookie HttpOnly/Secure y CSRF para web, credenciales protegidas por Windows en CAD. Plazos y capacidades limitadas respetan la spec. [authentication.md](contracts/authentication.md).

Publicación con staging privado y cuota reservada; validar todos los componentes, revalidar sesión/propiedad/versión esperada y confirmar versión, archivos y resultado en la misma transacción PostgreSQL. Objetos durables antes del commit; no hay una transacción distribuida ficticia S3/DB. No reemplazar ni anexar archivos a versiones anteriores. Descargas mediadas y autorizadas por solicitud; reintentos/rangos revalidan.

DTO, errores y operaciones: [api.md](contracts/api.md). Entidades, estados y restauración: [data-model.md](data-model.md). No restaurar datos eliminados definitivamente ni inferir éxito/fracaso de una operación por ausencia de respuesta.

### Tiempo, journal y reintentos

Tiempo remoto HTTPS con nonce e intervalo recepción/envío; cliente conserva incertidumbre y continuidad monotónica. No usar el reloj civil como prueba suficiente tras reinicio. Consulta remota limitada a 30s; la persistencia posterior se reintenta separadamente y solo su éxito completa la comprobación.

Selección técnica de reintento local: 5, 10, 20, 40, 80 y luego 120 segundos; contador independiente, sin requerir conexión ni repetir consulta por error de escritura. Se concreta así la regla aprobada de esperas crecientes; no se atribuye al usuario una elección numérica. Escritura aún no persistida no habilita limpieza. Generaciones posteriores y evidencia de borrado prevalecen sobre copias antiguas.

## Constitution Check

| Regla | Resultado documental |
|---|---|
| Spec aprobada y límites preservados | Cumple; opción A de conflicto externo registrada |
| Stack obligatorio | TS, React/Three, Next, Nest y PostgreSQL; adaptador nativo justificado |
| Local sin backend | Archivos, papelera y recuperación local no requieren autorización remota |
| Geometría separada del renderizado | Modelo y algoritmos propios; no usar Three.js como CAD |
| Publicación íntegra y permisos | Staging, verificación y commit transaccional con revalidación |
| Implementación autorizada | Código y pruebas locales conforme a tasks.md; no incorporar módulos aplazados. En la evaluación histórica de planificación solo existía documentación. |

## Estructura prevista

apps/desktop (main/preload/renderer y adaptador Windows), apps/web (portal/PWA), apps/api; packages/geometry, packages/document, packages/print y packages/contracts; tests de fixtures, integración, E2E y rendimiento. No se crean estas carpetas de producto ahora.

Documentos: spec.md, plan.md, research.md, runtime-matrix.md, aws-proposal.md, data-model.md, contracts/ y quickstart.md. La aprobación posterior autoriza generar tasks.md como documentación de trabajo futuro, sin ejecutar sus tareas.

## Secuencia futura de trabajo

1. Contratos, serialización, núcleo geométrico y fixtures de precisión.
2. CAD, comandos reversibles, persistencia Windows/USB y recuperación.
3. Preparaciones/PDF, verificador independiente y perfil reproducible.
4. Cuenta, transacciones, publicaciones, cuota y seguimiento de operaciones.
5. Portal/PWA y flujos reales de consulta/descarga.
6. Instalador, restauración, rendimiento y evaluación del entorno AWS de pruebas.

Cada etapa deberá superar sus criterios pertinentes; la secuencia no autoriza ejecutarlas.

## Puertas de verificación y despliegue

- Probar geometría degenerada, tangencias, uniones mixtas y puntas largas, sin introducir mínimos nuevos; discrepancia bloquea entrega, no cambia spec.
- Probar PDF de 10m más auxiliares, escala 1:1, tolerancia, mosaicos y cuadrado físico; validar Windows/Linux para el perfil compartido.
- Inyectar fallos de disco/USB y carreras de cambios externos en cada frontera de persistencia; medir memoria y cancelación.
- Ensayar matriz de runtime, PWA instalada en teléfonos, recuperación de cuenta y restauración de copias.
- Antes de desplegar: verificar créditos/vencimiento, permisos reales AWS, dominio y HTTPS, SES, copias y medidas operativas. No contratar firma Windows ni ampliar capacidad sin evaluar coste y consultar si cambia el presupuesto.
- Antes de servicio público continuo: presupuesto, disponibilidad y retención de producción requieren decisión específica. El entorno de pruebas no garantiza esas condiciones.

## Resultado de planificación

Setup conserva los documentos existentes. Git permanece en patronaje; SPECIFY_FEATURE=001-patronaje identifica la funcionalidad. Sin extensions.yml, no hay hooks configurados. El cierre documental y sus reservas se mantienen en research.md; las comprobaciones de implementación no se presentan como realizadas. La spec continúa aprobada. El usuario aprobó el plan técnico el 2026-11-14 y solicitó preparar las tareas con speckit-tasks. Se registra esa aprobación sin cambiar decisiones técnicas ni alcance; no autoriza código ni despliegue.

## Cierre documental U1/U2 — 2026-11-14

U1 resuelto: CAD Windows 11 x64; Android 12+ con Chrome; iPhone iOS 17+ con Safari incluida PWA instalada; portal Chrome/Edge estable actual y anterior. Equipo de referencia: 4 núcleos, 16 GB RAM y SSD, sin excluir equipos inferiores; mínimo se determinará por pruebas antes de validar entrega.

U2 resuelto conforme FR-286–292 y SC-277–283: credencial protegida limitada a una solicitud, emisión autenticada también en otros dispositivos durante recuperación, conservación tras logout, comprobación al abrir/reconectar y manual, reintentos automáticos crecientes con aplicación abierta y conexión sin sesión normal. Consulta disponible 90 días desde eliminación definitiva confirmada o recuperación confirmada (resultado cancelado), sin renovar por consultas. Solo eliminación explícitamente confirmada activa las transiciones locales existentes. No conserva contenido de cuenta ni OperationResult por esta excepción. No autoriza código, instalación ni despliegue; las pruebas permanecen pendientes.

Implementación técnica de la comprobación limitada: contracts/api.md y contracts/authentication.md; datos en data-model.md; tareas T023–T025, T061–T062 y T088. La matriz coverage.md conserva evidencia pendiente.


### Actualización técnica — redondeo de pieza (2026-11-17)

Comando reversible `roundPieceCorner`, radio nominal en milímetros y selección por clic en el tablero. Recorta dos rectas y las conecta con una Bézier cúbica tangente, conservando el formato editable existente. Es una aproximación del redondeo circular, no una herramienta de arcos exactos. Los tiradores se calculan directamente con las direcciones de las rectas; una curva por esquina evita uniones internas innecesarias. Se mantienen las validaciones de producción y la independencia del margen. Sin servicios nuevos ni cambios en AWS.
