# Servidor de pruebas Ohio

Preparación autorizada por el usuario el 2026-11-16. Perfil CLI `patronaje`, cuenta `847205414980`, región `us-east-2`. No usar `default`: pertenece a otra cuenta. No cambiar a Paid plan.

## Recursos de esta preparación

- EC2 `i-071717e257efd8dcd`, nombre `patronaje-test-ohio`, `m7i-flex.large` (2 vCPU/8 GiB), cambio autorizado y confirmado el 2026-11-16. No usa el modo de créditos Standard de T3.
- AMI oficial Amazon Linux 2023 `ami-0df8a753693e6366d`, propietario Amazon `137112412989`.
- EBS `vol-031e625ea7b9878d8`, gp3 cifrado 30 GiB, 3000 IOPS/125 MiB/s base.
- Grupo `sg-0ace8eccebf9bd79c`, entradas TCP 80/443; VPC/subred predeterminadas ya existentes. Administración SSM, sin SSH ni claves personales. PostgreSQL y API solo en la red de contenedores.
- Rol/perfil `patronaje-test-ec2`, confianza EC2, política administrada `AmazonSSMManagedInstanceCore`. No contiene AdministratorAccess ni acceso a datos de otras aplicaciones.
- IMDSv2 obligatorio y hop limit 2 para futuros contenedores. Sin monitoreo detallado de pago.

La solicitud exacta con token idempotente se conserva en `.local/aws/test-server-launch.json`. `test-server-init.sh` solo instala Docker y prepara el directorio. No contiene secretos ni inicia la aplicación.

Elastic IP `77.113.63.190`, asignación `eipalloc-0893440f4a05e1fcb`, asociación `eipassoc-0d91a92060b46e90e`. DNS y HTTPS verificados: `https://patronaje.77-113-63-190.sslip.io/account`, certificado Let's Encrypt emitido y validado externamente sin omitir comprobaciones TLS.

Buckets privados Ohio: `patronaje-test-847205414980-files` y `patronaje-test-847205414980-backups`, ACL deshabilitadas, bloqueo público, denegación de HTTP y cifrado SSE-S3. Sin versionado ni lifecycle que retiren evidencia fuera del catálogo. `test-api-policy.json` limita el rol a archivos/copias, evidencia sin borrado directo y SES desde `patronaje277353@gmail.com`. SES está verificado y permanece en sandbox.

Presupuesto de seguimiento `patronaje-pilot-100usd`, 100 USD, 2026-11-14 a 2027-05-14, periodicidad ANNUALLY, sin descontar créditos/reembolsos. No es un corte automático ni un contador de créditos entre periodos. Consultar siempre `freetier get-account-plan-state`; no cambiar a Paid. Estimación: 15,3216 USD EC2/160h + 9,76384 USD auxiliares = 25,08544 USD/mes. La facturación puede tener demora.

## Historial de dimensionamiento

### Redimensionamiento solicitado el 2026-11-16

El usuario autorizó `t3.large` usando los créditos disponibles, sin cambiar a Paid ni superar 100 USD. La consulta de cuenta devolvió FREE/ACTIVE y 100 USD disponibles (dato de facturación sujeto a actualización). AWS rechazó `ModifyInstanceAttribute` con `FreeTierRestrictionError`: la operación requiere cambiar de plan. No se cambió el plan ni se inició la instancia; una consulta posterior confirmó `t3.small`, `stopped`.

El usuario posteriormente aprobó `m7i-flex.large` (2 vCPU, 8192 MiB), elegible. El cambio en la misma instancia tuvo éxito conservando FREE. Elegibilidad no implica consumo gratuito ni autorización para cambiar de plan.

## Operación actual y límites

Arranque independiente en `apps/api/src/runtime/main.ts`, sin fixtures. Claves persistentes generadas en el servidor, archivos root 0600; no imprimirlos ni regenerarlos en actualizaciones. Usuario SQL de API no superusuario; respaldo usa credencial separada. Imagen Linux construida localmente, PostgreSQL 18.7 persistente. Adaptadores S3/SES reales con rol EC2, journal externo con escritura condicional y copias remotas verificadas antes de aceptar tráfico.

`start-pilot.sh` es solo para la primera creación de contenedores. `resume-pilot.sh` reanuda los existentes. Antes de detener EC2, ejecutar por SSM `bash /opt/patronaje/prepare-stop.sh` y exigir éxito `BACKUP_VERIFIED_HOST_STOP_ALLOWED`; un fallo no autoriza detener EC2. El ciclo de parada/reanudación se probó con éxito. La tarea diaria se ejecuta mientras la API está encendida; limpia copias a siete días según catálogo, no por lifecycle independiente.

Pendientes de aceptación: recorrido del usuario con correo de verificación y CAD configurado con el nuevo origen, restauración aislada completa desde AWS, recuperación de secretos/configuración ante pérdida total del disco y medición PDF máxima en EC2. La restauración PostgreSQL local y el respaldo remoto no equivalen a una prueba de recuperación completa del servidor. Los registros de acceso S3, eventos de datos CloudTrail y métricas/alertas CloudWatch son recomendables; falta concretar sus costes antes de activarlos. No se han configurado avisos presupuestarios por correo ni un corte de gasto automático. 160 h/mes es ventana de uso prevista, no horario automático.

EBS conserva coste aun con EC2 detenido. No detener un servidor con datos sin cumplir la política de respaldo aprobada.

## Ventana de pruebas y reanudación

El usuario pidió apagar después de las comprobaciones del 2026-11-16. Respaldo final confirmado por SSM `740fa631-12f0-4bda-865b-d76e1bfa0291`, salida `BACKUP_VERIFIED_HOST_STOP_ALLOWED`. Para la siguiente ventana: comprobar saldo y presupuesto, iniciar la misma instancia, esperar SSM Online y ejecutar `bash /opt/patronaje/resume-pilot.sh`; comprobar HTTPS después. No generar otra instancia ni volver a ejecutar initialize-pilot.sh.

El saldo final informado subió a 120 USD; el límite autorizado sigue siendo 100 USD. No cambiar a Paid ni asumir autorización para consumir los créditos adicionales. EC2 detenido evita cómputo, pero IP reservada, EBS y S3 continúan consumiendo créditos.
