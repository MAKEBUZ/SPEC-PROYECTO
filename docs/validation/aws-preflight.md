# Acceso AWS y revisión previa

Perfil local: patronaje. Cuenta confirmada: 847205414980. El perfil default de otra cuenta se conservó sin sobrescribir. Autorización del usuario: conectar y revisar créditos/permisos antes de crear recursos en us-east-2.

AWS Free Tier devuelve plan FREE, ACTIVE, saldo 100 USD y vencimiento 2027-05-14T17:38:05.669Z. Es una lectura puntual, no un límite de gasto configurado.

Ohio: sin instancias EC2; VPC predeterminada disponible. Rol AccountFullAccessRole con AdministratorAccess. Simulación con aws:RequestedRegion=us-east-2 permite RunInstances, CreateSecurityGroup, AllocateAddress, CreateBucket y CreateEmailIdentity; también se comprobaron CreateRole/PassRole. La primera simulación sin región devolvió explicitDeny; no debe interpretarse como prohibición en Ohio. Una simulación no garantiza cuotas, elegibilidad de tipos ni éxito de un despliegue.

SES: HEALTHY, envío habilitado, sin acceso de producción; cuota 200 correos/24 h y 1/s, sin identidades verificadas. Debe prepararse remitente y destinatarios de prueba antes del registro/verificación de cuenta.

Solo consultas de identidad, plan, inventario y simulación. No se crearon recursos, no se cambió el plan ni se usó Cost Explorer. No se guardan credenciales en este informe.

## Dirección gratuita para el piloto

El usuario no dispone de dominio y permite una opción gratuita de pruebas. Se selecciona un hostname con la IPv4 pública del servidor bajo sslip.io (o nip.io, servicio equivalente del mismo operador) y HTTPS con certificado individual de Let's Encrypt. Evita comprar dominio o crear zona Route 53. No convierte EC2/EBS/IPv4/S3/SES en gratuitos: mantienen consumo del presupuesto AWS. Es una dirección de pruebas dependiente de DNS de terceros y de conservar la IP; no dominio propio para producción. Fuentes consultadas: https://sslip.io/ y https://letsencrypt.org/getting-started/.

Correo: SES admite verificar una dirección de correo individual sin dominio propio; en sandbox se verifican remitente y destinatarios. Pendiente que el usuario indique una dirección bajo su control para preparar la identidad y el envío de verificación; no se ha enviado correo ni creado la identidad. Fuente: https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html.

## SES — verificación solicitada (2026-11-16)

Por instrucción explícita del usuario, se creó la identidad de correo patronaje277353@gmail.com en us-east-2, cuenta 847205414980, para remitente y destinatario de pruebas. CreateEmailIdentity respondió EMAIL_ADDRESS y VerifiedForSendingStatus=false: solicitud de verificación aceptada, pendiente de abrir el enlace recibido por el usuario. No se enviaron mensajes adicionales de prueba ni se crearon recursos de cómputo. No se conserva el enlace de verificación en el repositorio.

## Servidor base preparado (2026-11-16)

SES consultado: VerifiedForSendingStatus=true, VerificationStatus=SUCCESS para el correo autorizado en Ohio.

Se crearon, bajo autorización de preparación AWS: rol/perfil patronaje-test-ec2 (solo AmazonSSMManagedInstanceCore), grupo sg-0ace8eccebf9bd79c sin reglas de entrada e instancia i-071717e257efd8dcd t3.small Standard, EBS gp3 cifrado 30 GiB vol-031e625ea7b9878d8. IMDSv2 requerido, hop 2. AMI Amazon Linux oficial ami-0df8a753693e6366d; se comprobó elegibilidad Free Tier del tipo y DryRunOperation de la solicitud antes del lanzamiento. FreeTierEligible no significa consumo nulo.

SSM Online. Comando 259b5b3b-82c7-4529-8cd3-8956cb75eed9 terminó Success: cloud-init done, marcador FOUNDATION presente, SSM y Docker active; docker --version devolvió 25.0.14. No se inició aplicación, PostgreSQL ni servicio público. No se reservaron IP estable ni buckets. Recursos y pendientes en `infra/aws/README.md`.

Se solicitó detener esta base vacía tras validarla para ahorrar cómputo. No hay datos de usuarios ni base que respaldar en esta preparación; la política de respaldo antes de apagado sigue obligatoria cuando se despliegue la aplicación. EBS mantiene consumo de créditos aun detenido. No se cambió a plan de pago.
El waiter EC2 instance-stopped finalizó correctamente: detención confirmada. La siguiente puesta en marcha debe reutilizar esta instancia, no crear otra.
