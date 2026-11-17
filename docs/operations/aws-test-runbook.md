# Operación del entorno de pruebas AWS — puerta de despliegue

Estado: procedimiento preparado para T096; **no ejecutado y sin autorización de despliegue**. La implementación y las pruebas actuales son locales. Este documento no crea recursos, no cambia el plan de cuenta y no autoriza gastos.

## Decisiones conservadas

| Aspecto | Decisión aprobada |
|---|---|
| Región | `us-east-2`, Ohio |
| Uso | EC2 unas 160 horas encendido por mes, para pruebas |
| Créditos declarados | 100 USD al planificar; saldo y vencimiento actuales sin verificar |
| Servicios propuestos | EC2 con web/API/PostgreSQL y worker aislado; EBS; almacenamiento privado S3; correo SES |
| Trabajo intensivo | Una verificación de artefactos a la vez; medir memoria y tiempo antes de aumentar capacidad |
| Respaldo | Diario mientras esté encendido y antes de cada apagado planificado; conservar 7 días |
| Fallo de respaldo previo | Cancelar el apagado, conservar la copia anterior y avisar; reintento explícito |
| Disponibilidad | El piloto apagado no ofrece funciones remotas; el CAD local ya habilitado sigue disponible |

La fuente de configuración y cálculo es [aws-proposal.md](../../specs/001-patronaje/aws-proposal.md). La estimación histórica del 2026-11-14 para 160 horas es **13,09 USD/mes**, condicionada a las hipótesis de esa propuesta; no es una cotización actual ni una garantía de cobertura por créditos. EBS, IPv4 reservada, S3 y otros recursos persistentes pueden consumir saldo aun con EC2 detenido. No se da por disponible el saldo original ni se cuenta desde el futuro despliegue el plazo de los créditos.

## Antes de pedir autorización de despliegue

Preparar un informe concreto con fecha, responsable, configuración exacta y evidencia de cada fila. No iniciar recursos para completar esta revisión. Si faltan datos de cuenta o decisiones, recogerlos como pendientes; nunca convertir su ausencia en autorización.

| Comprobación | Evidencia requerida | Estado actual |
|---|---|---|
| Cuenta y créditos | Tipo de plan, servicios elegibles, saldo disponible y fecha exacta de vencimiento; sin incluir secretos | Pendiente de acceso autorizado/información del propietario |
| Coste | Tarifas vigentes en Ohio, configuración, horas, almacenamiento, solicitudes, correo, IPv4, tráfico, logs, DNS, impuestos/exclusiones y consumo ya existente | Solo estimación histórica |
| Capacidad | Medición de web/API/PostgreSQL/worker concurrentes en la configuración propuesta; memoria, CPU, disco y tiempo | Pendiente; no ampliar instancia sin consultar coste |
| Dominio y HTTPS | Dominio/subdominio disponible, titularidad, certificado utilizable por el servidor, renovación y costes asociados | Pendiente; no comprar dominio ni asumir certificado instalable |
| Correo | Identidad remitente verificada, restricciones reales de SES y destinatarios/volumen de prueba autorizados | Pendiente; correo local capturado, sin envíos reales |
| Seguridad | Objetos privados, accesos mínimos, cifrado, secretos fuera del repositorio, HTTPS, logs sin credenciales y aislamiento entre propietarios | Revisar configuración final; no equivale a T094 aprobada |
| Restauración | Ensayo aislado T091/T092, hashes/manifiesto, roles, esquema, objetos y evidencia de supresión posterior | Validado localmente; pendiente ensayo del transporte y entorno autorizado |
| Funcionalidad | Evidencia de tareas y aceptación de la entrega; fallos y limitaciones expuestos | Implementación incompleta; consultar tasks.md |
| Operación | Horario concreto, responsable de encendido/apagado, respaldo, alertas y reacción a consumo inesperado | Pendiente; 160 horas es presupuesto de uso, no programación automática |

El informe debe distinguir costes persistentes, costes por uso y conceptos no cubiertos por créditos. Si difiere del alcance, capacidad o coste aprobado, presentar la diferencia antes de solicitar el despliegue. No pasar a servicio continuo, contratar firma Windows, soporte u otros servicios por inferencia.

## Encendido y uso, después de autorización específica

1. Verificar que la autorización corresponde a esta cuenta, región, configuración y periodo. Registrar el saldo y el consumo previo disponibles.
2. Revisar espacio libre y estado de respaldos/evidencia de supresión antes de habilitar tráfico. No exponer PostgreSQL ni objetos privados al público.
3. Arrancar con la configuración revisada; verificar salud, esquema y secretos sin imprimirlos en logs. Una migración fallida impide habilitar el servicio.
4. Registrar inicio de la ventana de pruebas. Medir consumo y recursos conforme al informe aprobado; las alarmas de presupuesto no se consideran un mecanismo de corte garantizado.
5. Usar cuentas y documentos de ensayo. No introducir datos de terceros ni ejecutar correo real fuera del alcance autorizado.
6. Si se necesita más capacidad, almacenamiento o tiempo encendido, documentar impacto y pedir decisión antes de introducir un cambio de coste. Mantener separados los objetivos funcionales y la estimación de AWS.

No se incluyen comandos de despliegue porque el empaquetado, la restauración y la aceptación aún tienen tareas pendientes. Los comandos locales de validación no aprovisionan este entorno.

## Respaldo y apagado planificado

T091 tiene implementación y validación local de programación, drenaje y limpieza; véase `../validation/backups.md`. La operación AWS, el transporte fuera de EC2 y el apagado real siguen pendientes de autorización y ensayo. La barrera actual exige un único monolito con Pool compartido; no lanzar escritores independientes sin coordinar su drenaje.

1. Suspender nuevas mutaciones y drenar las ya aceptadas. No confirmar operaciones pendientes como si hubieran terminado.
2. Generar copia consistente de PostgreSQL y datos de roles necesarios, con versión de esquema, manifiesto de archivos, hashes y watermark de supresiones.
3. Conservarla fuera de EC2 y comprobar transferencia, integridad y lectura. Mantener la última copia válida hasta confirmar la nueva. Un checksum no sustituye el ensayo de restauración.
4. Si falla cualquier paso, **no apagar**. Registrar fallo, salir del mantenimiento de forma segura y ofrecer reintento. Advertir que el cómputo continúa consumiendo mientras permanezca encendido.
5. Si se confirma el respaldo, registrar su referencia y finalizar únicamente el apagado previamente autorizado. Registrar horas consumidas. No eliminar volúmenes ni archivos como parte implícita del apagado.
6. Aplicar los 7 días de conservación a respaldos, sin cambiar la papelera funcional de 30 días. Conservar la evidencia de supresión mientras exista un respaldo recuperable anterior que la necesite.

## Restauración aislada y supresiones

T092 demostró este recorrido con PostgreSQL local. Debe repetirse con el transporte y entorno de despliegue autorizados antes de habilitar tráfico:

- Mantener red de usuarios, correo y jobs normales deshabilitados durante la recuperación.
- Verificar el manifiesto, hashes, esquema, roles y objetos privados antes de servir tráfico.
- Reconciliar el watermark del respaldo con las supresiones durables posteriores. No revivir cuentas, patrones, versiones ni archivos eliminados definitivamente.
- Una intención de purga sin resultado reconciliado o evidencia incompleta mantiene el entorno aislado. No inventar éxito por ausencia de archivos ni por falta de respuesta.
- Habilitar tráfico solo tras validar integridad, restricciones y autorizaciones. Registrar el punto realmente recuperado y las operaciones pendientes, sin prometer recuperación hasta el último cambio.

## Informe que se someterá a aprobación

Debe identificar configuración y recursos exactos, coste actualizado con hipótesis, saldo/vigencia comprobados, limitaciones funcionales, evidencia de restauración, responsables, ventana de pruebas y plan de retirada. La aprobación de este documento o del código **no sustituye la autorización explícita para desplegar y generar consumo**.

Referencias: [plan técnico](../../specs/001-patronaje/plan.md), [tareas y estado real](../../specs/001-patronaje/tasks.md), [protocolo de recuperación](../../specs/001-patronaje/quickstart.md), [evidencia local](../validation/autonomous-progress.md).
