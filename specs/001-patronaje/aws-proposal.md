# Propuesta AWS y consumo de créditos

## Actualización autorizada 2026-11-16

El usuario autorizó configurar el piloto AWS con créditos, sin pasar a Paid ni superar 100 USD. Se aprobó y aplicó `m7i-flex.large` (2 vCPU, 8 GiB) sobre la misma instancia de Ohio. Sustituye la elección histórica `t3.small` de las tablas siguientes. Tarifa Linux Shared OnDemand consultada mediante AWS Pricing: 0,09576 USD/h; 160 h = 15,3216 USD. Con los supuestos auxiliares históricos (9,76384 USD), total orientativo 25,08544 USD/mes; 100 USD equivalen aritméticamente a 3,986 meses. Se recomienda revisar antes de consumir 80 USD. No es límite técnico ni garantía de saldo. FREE/ACTIVE y 100 USD informados por la API antes del encendido; recursos y evidencia actual en `../../infra/aws/README.md`. Las prohibiciones de despliegue del texto de planificación siguiente describen la autorización histórica, posteriormente ampliada por el usuario.

Fecha: 2026-11-14. Estado: diseño de pruebas aprobado como parte del plan técnico el 2026-11-14; no autoriza despliegue ni gasto. Complementa plan.md; no modifica spec.md ni su aprobación.

**Elección aprobada por el usuario:** EC2 para pruebas, encendido aproximadamente 160 horas al mes. Se adopta el escenario de 13,09 USD/mes bajo las hipótesis de este documento, no como precio garantizado ni límite técnico automático. No se selecciona Lightsail ni servicio continuo. La aprobación no autoriza crear recursos, programar encendidos/apagados, gastar fuera de los créditos o implementar. Región de pruebas aprobada: us-east-2 (Ohio, Estados Unidos). Los detalles de operación pendientes permanecen abiertos; la política de respaldo de pruebas se registra a continuación.

## Base de la propuesta

El usuario confirma cuenta AWS nueva y 100 USD de créditos. No se ha accedido a su cuenta: saldo, vencimiento, servicios habilitados y aplicación de créditos deben verificarse antes de desplegar. Se estima en USD, sin impuestos, para us-east-2 (Ohio), región de pruebas aprobada explícitamente por el usuario. No se presuponen otros 100 USD promocionales ni antiguas 750 horas gratis adicionales.

Recomendación: EC2 t3.small Linux para un entorno inicial de pruebas controladas, con PostgreSQL en el mismo servidor, S3 privado y SES. Encender EC2 durante las ventanas de prueba cuando no se necesite acceso remoto continuo. El despliegue público y su capacidad requieren validación posterior. Esta recomendación preserva Next.js, NestJS y PostgreSQL exigidos por la constitución.

## Servicios y responsabilidades

| Servicio propuesto | Uso y condiciones |
|---|---|
| EC2 t3.small, Linux, 2 vCPU/2 GiB | Next.js/PWA, API NestJS y trabajador de tareas persistidas en PostgreSQL. Artefactos compilados fuera del servidor. Modo CPU Standard para evitar recargos de Unlimited, aceptando reducción de CPU al agotar créditos de ráfaga. |
| PostgreSQL autogestionado | Misma EC2, accesible solo localmente. Transacciones de versiones, resultados y cuotas. No añade coste de instancia, pero requiere mantenimiento, copias y pruebas de restauración. |
| EBS gp3, 30 GiB | Sistema, base y temporales, con cifrado desde la creación y rendimiento base. Los archivos publicados permanecen en S3. Este tamaño es capacidad inicial ampliable, no límite nuevo del producto. |
| Una IPv4 pública estable | Acceso HTTPS de CAD, web y PWA. Se incluye su coste incluso cuando la instancia esté detenida. |
| S3 Standard privado | Editables, vistas previas, PDF, staging y copias de respaldo. Claves inmutables por versión; publicación visible solo después del commit. Staging abandonado se limpia sin borrar publicaciones válidas. |
| SES Essentials | Correos de verificación y recuperación. Sin adjuntar patrones ni PDF, sin IP dedicada ni complementos de pago. El sandbox inicial limita los destinatarios; abrir el registro público exige aprobación de producción de SES e identidad remitente verificada. |
| IAM, Systems Manager y observabilidad | Rol de instancia con permisos mínimos; administración sin publicar PostgreSQL ni SSH. Métricas, registro de errores sin datos privados y seguimiento del consumo. |

La API autoriza cada descarga y transmite el objeto privado; no se dan enlaces permanentes ni URLs firmadas que permitan nuevos reintentos saltándose la revocación. El flujo usa streaming, no carga archivos completos de 100 MB en memoria. La publicación conserva staging, validación y commit definidos en contracts/api.md; S3 y PostgreSQL no se presentan como una única transacción.

El CAD y la generación local de PDF no consumen cómputo AWS. La verificación remota seleccionada en contracts/geometry-print.md usa un trabajador aislado en la misma EC2, con una tarea intensiva a la vez. Su capacidad debe medirse; si exige ampliar recursos, recalcular y consultar el cambio de coste antes de desplegar.

Seguridad propuesta: HTTPS, S3 Block Public Access y ACL desactivadas, SSE-S3, EBS cifrado, permisos IAM restringidos y condiciones de origen/cuenta cuando correspondan a integraciones de servicios. Recomendar logs de acceso S3, eventos de datos CloudTrail acotados al bucket y métricas CloudWatch; cifrar destinos de logs, usando KMS donde corresponda, y medir su coste. No son recursos creados. No incluir NAT Gateway, balanceador, Kubernetes ni caché dedicada en este piloto.

## Hipótesis de uso mensual

Una sola instancia y región; 730 horas para servicio continuo o 160 horas para pruebas programadas. Hasta 10 GiB medios de archivos y staging más 10 GiB medios de copias; 10.000 PUT/LIST y 100.000 GET; 1.000 correos de 32 KB. Tráfico total a Internet de la cuenta inferior a 100 GB/mes, sin transferencias entre regiones. Son escenarios de estimación, no cuotas de usuarios ni garantía de capacidad. La cuota funcional de 2 GB por cuenta sigue siendo decimal y no se confunde con GiB facturables.

**Política de respaldo de PostgreSQL para pruebas aprobada por el usuario:** copia diaria mientras EC2 esté encendido y antes de cada apagado planificado; conservar las copias durante 7 días. Se recupera hasta la última copia completada correctamente; no se garantiza un punto de recuperación si fallan los respaldos. Los 10 GiB siguen siendo una hipótesis de volumen facturado que debe comprobarse con esta política, no un límite de copias. Si falla la copia previa, cancelar el apagado, avisar y permitir reintentar; EC2 sigue encendido y consumiendo créditos. El tiempo objetivo de restauración sigue por concretar. Esta política no equivale a la papelera de 30 días ni cambia la recuperación local del CAD; tampoco aprueba la política de producción. La restauración debe respetar eliminaciones definitivas y no reactivar cuentas ni versiones borradas.

## Estimación desglosada

Tarifas de referencia oficiales consultadas el 2026-11-14. Cálculos realizados con JavaScript, sin crear scripts del producto. Créditos se aplican después al consumo elegible; los importes no significan cargos autorizados a tarjeta.

| Concepto | Cálculo mensual | Continuo | Pruebas 160 h |
|---|---|---:|---:|
| EC2 | 0,0208 USD/h × horas encendidas | 15,184 | 3,328 |
| EBS gp3 | 30 × 0,08 USD/GiB-mes | 2,400 | 2,400 |
| IPv4 reservada | 730 × 0,005 USD/h | 3,650 | 3,650 |
| S3, archivos y copias | 20 × 0,023 USD/GiB-mes | 0,460 | 0,460 |
| S3 solicitudes | 10.000/1.000 × 0,005 + 100.000/1.000 × 0,0004 | 0,090 | 0,090 |
| SES Essentials y datos | 1.000/1.000 × 0,16 + 1.000 × 0,000032 × 0,12 | 0,16384 | 0,16384 |
| Transferencia Internet | Dentro de 100 GB gratuitos agregados, si disponibles en la cuenta | 0 | 0 |
| Reserva operativa | Margen estimado para logs, métricas, solicitudes KMS, DNS y variaciones pequeñas; no tarifa fija de AWS | 3,000 | 3,000 |
| **Total orientativo, USD/mes** | Redondeado al final | **24,95** | **13,09** |

La reserva operativa no garantiza cubrir cualquier configuración: hay que concretar volumen de logs, claves, alarmas y DNS antes de desplegar. No descontamos promociones adicionales de cada servicio. Tráfico superior, otras cargas en la misma cuenta, pruebas repetidas, snapshots adicionales y aumento de almacenamiento cambian el cálculo. Dominios, firma del instalador Windows, impuestos, soporte de pago y trabajo operativo no están incluidos; no se presupone que los créditos los cubran. El certificado HTTPS y el dominio o subdominio disponible deben concretarse antes de la PWA pública; no se asume que un certificado ACM no exportable pueda instalarse en EC2.

| Escenario | Consumo mensual | Duración aritmética de 100 USD | Consumo durante 6 meses |
|---|---:|---:|---:|
| EC2 continuo | 24,95 USD | 4,01 meses | 149,69 USD |
| EC2, 160 h/mes | 13,09 USD | 7,64 meses, limitado por vencimiento real | 78,55 USD |
| Lightsail 2 GiB continuo, alternativa condicionada | 15,71 USD | 6,36 meses, limitado por vencimiento real | 94,28 USD |

Las duraciones se calculan con valores sin redondear y suponen saldo intacto y consumo estable. El Free plan vence hasta seis meses desde el alta o al consumir créditos, lo que ocurra primero: no son seis meses desde el futuro despliegue. Conservar 20 USD sin comprometer deja un presupuesto operativo de 80 USD: aproximadamente 3,21 meses continuos EC2 o 6,11 meses de pruebas, siempre sujetos al vencimiento. Esta reserva es propuesta, no cambio del plan de cuenta.

Detener EC2 ahorra cómputo, pero siguen EBS, IPv4, S3 y otros recursos persistentes. Mientras esté detenido no funcionan web, publicación, consultas ni correos; la edición local ya habilitada permanece disponible. El horario de pruebas no se propone como disponibilidad del producto final. No apagar ni borrar automáticamente recursos del usuario sin una política acordada.

## Alternativas y límites

Lightsail Linux con IPv4 ofrece 2 GiB, 60 GB SSD y transferencia incluida por 12 USD/mes. Sumando el mismo almacenamiento externo, correo y reserva, la referencia es 15,71 USD/mes. La nueva experiencia de alta de AWS lista Lightsail entre sus servicios gratuitos admitidos, pero hay que comprobar el acceso concreto de la cuenta sin cambio de plan. No se descuenta una prueba promocional adicional. Detener Lightsail no elimina el coste del paquete. Se mantiene como alternativa: hay que cerrar credenciales de acceso a S3/SES y validar capacidad, respaldos y operación antes de seleccionarlo.

RDS PostgreSQL es la alternativa administrada para separar la base y reducir carga de mantenimiento. No se incluye en este presupuesto; añade cómputo y almacenamiento propios. Antes de una entrega pública continua conviene cotizarlo con clase, almacenamiento, versión y backups definidos. No se adopta otro motor por una promoción.

La instancia de 2 GiB es una hipótesis mínima para pruebas de baja concurrencia, no una capacidad demostrada. Web, API y PostgreSQL compiten por memoria; una avería afecta todo el servicio. Si los ensayos muestran falta de memoria, latencia o presión de CPU, debe redimensionarse y recalcularse el gasto. No se promete producción con alta disponibilidad ni se recortan los límites funcionales para hacerla caber.

## Control de créditos y cierre pendiente

Antes del despliegue: comprobar saldo, fecha de vencimiento, modalidad y servicios permitidos; verificar disponibilidad regional en Ohio y concretar dominio, SES, ejecución de la política de copias y observabilidad; contrastar en AWS Pricing Calculator. Proponer avisos de consumo al alcanzar 50, 75 y 90 USD y revisión antes del vencimiento. Los avisos no son un límite duro ni sustituyen el control del saldo. Ningún cambio a Paid plan está autorizado.

R-01 a R-05 quedan seleccionados documentalmente en research.md y sus contratos. Se conserva EC2 160 h/mes, Ohio y respaldos de pruebas diarios/preapagado durante 7 días; S3 privado y SES completan la propuesta de pruebas. Verificar créditos, acceso real, capacidad y preparación operativa antes de desplegar; la política de producción permanece fuera de esta aprobación. No se generan tareas ni se autoriza implementación o gasto.

## Fuentes oficiales

- [Catálogo oficial EC2/EBS de Ohio](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-2/index.csv): SKU BQPEB7HYTVEZPKJW, Linux t3.small Shared OnDemand a 0,0208 USD/h; SKU M6UGCCQ3CDJQAA37, gp3 a 0,08 USD/GiB-mes. Tarifas efectivas 2026-11-01, consultadas 2026-11-14. Se filtraron las tarifas OnDemand, excluyendo Reserved.
- [Catálogo oficial S3 de Ohio](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-east-2/index.json): USE2-TimedStorage-ByteHrs 0,023 USD/GiB-mes primer tramo; USE2-Requests-Tier1 0,000005 USD/solicitud y Tier2 0,0000004 USD/solicitud.
- [Elegibilidad EC2 y duración para cuentas nuevas](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html).
- [EBS gp3](https://aws.amazon.com/ebs/general-purpose/) y [IPv4 VPC](https://aws.amazon.com/vpc/pricing/).
- [S3 precios y unidades](https://aws.amazon.com/s3/pricing/); [ejemplo AWS actualizado de almacenamiento y PUT](https://aws.amazon.com/blogs/database/automate-postgresql-audit-log-extraction-and-analysis-with-amazon-s3/).
- [SES tarifas y modalidad Essentials para cuentas nuevas](https://aws.amazon.com/ses/pricing/); [restricciones sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
- [Transferencia Internet agregada](https://aws.amazon.com/ec2/pricing/on-demand/).
- [Paquetes Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html); [servicios de la nueva experiencia AWS](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html).
- [Seguridad S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html), [seguridad EBS](https://docs.aws.amazon.com/ebs/latest/userguide/security.html) y [AWS Pricing Calculator](https://calculator.aws/).

Actualización regional: Ohio sustituye N. Virginia para las pruebas. Se verificaron los catálogos públicos EC2/EBS y S3 de Ohio y las tarifas publicadas de IPv4 y SES. El escenario elegido baja de 13,11 a 13,09 USD/mes; mantiene todos los supuestos y exclusiones. Lightsail conserva solo carácter de alternativa histórica no seleccionada. No se accedió a la cuenta ni se crearon recursos.

**Confirmación del usuario sobre apagado:** se adopta la opción A recomendada: respaldo fallido cancela el apagado planificado, genera aviso y permite reintento; no se fuerza la detención ni se elimina la última copia válida. Las horas adicionales consumen créditos y las 160 h/mes son una estimación, no un apagado obligatorio.
