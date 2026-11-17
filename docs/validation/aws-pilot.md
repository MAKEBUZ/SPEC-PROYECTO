# Piloto Ohio — evidencia 2026-11-16

Autorizado por el usuario con créditos, FREE, sin pasar a Paid ni superar 100 USD. Cuenta 847205414980, perfil patronaje, región us-east-2. El perfil default es ajeno y no se utiliza.

## Resultado ejecutado

- Misma EC2 i-071717e257efd8dcd: m7i-flex.large, 2 vCPU/8 GiB, EBS cifrado 30 GiB. Sin ALB, NAT Gateway, RDS ni servicios adicionales de cómputo.
- IP 77.113.63.190; HTTPS `https://patronaje.77-113-63-190.sslip.io/account`. Let's Encrypt validado externamente; portal 200 y `/v1/time` 200, nonce conservado y Cache-Control no-store.
- Navegador Edge con perfil aislado: formularios de cuenta visibles, cero errores JavaScript. Captura `.local/aws/https-account.png`.
- API y web Linux compiladas fuera de EC2. Argon2 ejecutado dentro de la imagen. PostgreSQL persistente, rol SQL de aplicación sin superusuario, secretos separados y persistentes generados en servidor.
- S3 privado, SSE-S3, bloqueo público, ACL deshabilitadas, HTTP denegado. Escritura/lectura/borrado mediante S3BlobStore y rol EC2 reales: S3_BLOB_VERIFIED.
- SES: identidad patronaje277353@gmail.com SUCCESS; sandbox conservado. Un correo técnico al mismo correo fue aceptado por SES desde el transporte de aplicación. La aceptación del proveedor no confirma entrega en bandeja.
- Primer backup real: 59748e55-cc06-4246-a898-799a91d414d2, dump 61925 bytes, manifest 1315, roles 948, verificados por lectura posterior. Copias privadas y evidencia de supresión fuera de EC2.
- Preapagado y reanudación reales de servicios: BACKUP_VERIFIED_HOST_STOP_ALLOWED y PILOT_RESUMED. No se detuvo EC2 durante este ensayo. Se generan copias adicionales al reanudar antes de aceptar tráfico.
- Medición inicial sin carga PDF: memoria disponible del host 6931 MiB; API 84,58 MiB, web 40,65 MiB, PostgreSQL 35,84 MiB, proxy 13,48 MiB. No demuestra capacidad para la carga máxima.

## Validación local

TypeScript sin errores; 528 pruebas unitarias/recuperación/contratos pasaron. La primera ejecución tuvo seis fallos de permisos del sandbox en tres suites; repetidas con permisos de loopback/navegador: 7/7 de esas suites. Adaptadores/configuración nuevos: 11/11. Respaldo/restauración PostgreSQL efímero: 3/3 en backup-schedule y backup-restore.

Las pruebas incluyen reintento de S3 sin sobrescribir contenido distinto, hash incorrecto antes de cargar, clave con ruta inválida, fallo de SES, respaldo remoto y borrado, journal ausente que bloquea en lugar de asumir ausencia de eliminaciones, persistencia del journal y rechazo de conflicto de escritura condicional.

## Incidencias corregidas y trazabilidad

PostgreSQL falló inicialmente por permiso 0700 del padre del volumen antes de cambiar al usuario postgres. Se corrigió solo el recorrido del padre a 0755; PGDATA conserva su protección. Sin borrar datos ni recrear secretos.

Comandos SSM: preparación 6a386fc6-defa-46e8-90b1-9250d7db52c6; primer arranque 2f0b7e48-efb3-49f2-9cf6-0a447253a2d8 (falló por permisos); arranque corregido 792279a4-dec8-4332-9de8-edb1bdda95b6; prueba S3/SES fb007bf3-b3d5-4323-ade9-88c1074040c4; parada/reanudación e4a39094-e66b-4409-9188-b222a9892b90.

El analizador IAM aislado no pudo descargarse de PyPI; se consultó la referencia oficial de autorizaciones y se aplicó `infra/aws/test-api-policy.json` con recursos concretos. Una ejecución inicial con código montado y red fue rechazada por revisión automática; no se ejecutó. La preparación posterior de la herramienta no montó código ni credenciales.

## Costes y pendientes

FREE/ACTIVE y 100 USD informados antes del encendido; los datos no son instantáneos. Precio m7i-flex.large Ohio Linux: 0,09576 USD/h; escenario 160h + auxiliares: aproximadamente 25,09 USD/mes. Presupuesto de seguimiento de 100 USD creado, no corte automático; no se cambió a Paid.

No dar por completos: restauración de todo el servidor desde AWS con custodia de secretos, aceptación física, PDF máximo medido en EC2, registro/verificación/login del usuario y nuevo origen del CAD instalado. Detenerlo solo tras respaldo confirmado; 160 horas mensuales no son una automatización configurada.

Consulta final de cuenta: FREE/ACTIVE, 120 USD disponibles; AWS incrementó el saldo observado. El usuario no amplió el límite autorizado: sigue siendo 100 USD. Indicó apagar al terminar las comprobaciones y volver a encender cuando vaya a probar. La IP y el almacenamiento persistentes siguen consumiendo créditos con EC2 detenido.

Apagado completado: respaldo final y drenaje SSM 740fa631-12f0-4bda-865b-d76e1bfa0291 confirmados; `StopInstances`, waiter y consulta posterior verificaron `m7i-flex.large / stopped`. El portal no estará disponible hasta reanudar la instancia y sus servicios.

Nueva ventana autorizada el 2026-11-16 para registro, verificación y CAD paso a paso. Se conservó FREE/ACTIVE (saldo informado 120 USD, límite autorizado 100 USD), se encendió la misma instancia y SSM 3ac5c457-9fe2-478c-a226-b166b5b95d1f confirmó PILOT_RESUMED. Registro y verificación del usuario todavía pendientes; no se solicitan ni registran contraseñas en el chat.

Continuación: el usuario confirmó registro, verificación del correo e inicio de sesión web satisfactorios. Para CAD, se guardó PATRON_API_ORIGIN=https://patronaje.77-113-63-190.sslip.io en el entorno del usuario Windows y se notificó el cambio. La aplicación estaba abierta al intentar lanzarla; no se cerró ni se repitió el registro. Falta reiniciarla normalmente y verificar el acceso con la cuenta existente. No se borraron pendientes ni documentos locales.

Confirmación posterior del usuario: inicio de sesión CAD satisfactorio, editor accesible y patrón nuevo creado. Guardado local y reapertura sin errores, conservando forma y posición, documentados en `windows.md`. Queda comprobado por el usuario el acceso desde web y CAD; aún no se ha comprobado la publicación de ese documento ni su descarga desde la cuenta. No se cambiaron recursos ni presupuesto en esta ronda manual.
