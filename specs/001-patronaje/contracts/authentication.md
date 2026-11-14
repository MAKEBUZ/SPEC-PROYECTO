# Diseño de autenticación — primera entrega

Decisiones técnicas de planificación, no implementación. Conservan la política de contraseñas, verificación, recuperación y sesiones aprobada en spec.md. El diseño de R-05 queda definido junto con runtime-matrix.md; su validación ejecutada corresponde a la implementación futura.

## Contraseñas

Seleccionar Argon2id con sal aleatoria individual, parámetros incluidos en el hash codificado y configuración inicial m=19456 KiB, t=2, p=1. Es un punto de partida para medir en la EC2 de pruebas, no rendimiento validado; limitar concurrencia del cálculo para no agotar memoria. No disminuir su coste automáticamente ante carga ni truncar contraseñas. Seleccionar argon2 0.45.2 solo en el backend Node 24.22.3; no distribuirlo en Electron. La matriz documenta las restricciones publicadas y la futura prueba del binario Linux x64.

Se conserva la regla funcional de 12–128 caracteres y composición aprobada. Contar puntos de código Unicode, no bytes UTF-8 ni unidades UTF-16; rechazar secuencias Unicode inválidas. Mayúscula/minúscula/número/símbolo se reconocen por las categorías Unicode Lu/Ll/Nd y P o S, respectivamente. Los espacios no son símbolos. No recortar, normalizar, cambiar mayúsculas ni truncar la entrada: la contraseña íntegra introducida debe verificar de igual forma en todos los clientes. No guardar texto claro, contraseñas reversibles ni datos introducidos en logs.

### Lista local de contraseñas conocidas

Usar el corpus completo `Passwords/Common-Credentials/xato-net-10-million-passwords.txt` de SecLists, fijado inicialmente al commit `51aa7644c96b3fb6db8de9ecf55aa91195209c80`. El README de origen declara 5.189.454 contraseñas únicas procedentes de combinaciones filtradas y ordenadas por frecuencia; los metadatos del archivo declaran 48.312.893 bytes. Cubre contraseñas comunes y comprometidas incluidas en ese corpus, no todos los incidentes ni una comprobación universal o en tiempo real. Conservar procedencia, licencia MIT y versión de corpus en el artefacto de despliegue. Fuentes: [corpus fijado](https://github.com/danielmiessler/SecLists/blob/51aa7644c96b3fb6db8de9ecf55aa91195209c80/Passwords/Common-Credentials/xato-net-10-million-passwords.txt), [README](https://github.com/danielmiessler/SecLists/blob/51aa7644c96b3fb6db8de9ecf55aa91195209c80/Passwords/Common-Credentials/README.md), [licencia](https://github.com/danielmiessler/SecLists/blob/51aa7644c96b3fb6db8de9ecf55aa91195209c80/LICENSE).

En la construcción futura del artefacto, producir un índice ordenado de hashes SHA-256 de las entradas completas, con búsqueda en disco y coincidencia exacta; no cargar millones de cadenas en la memoria de la EC2. Los hashes fijos ocupan aproximadamente 166 MB decimales, más metadatos. Este hash solo indexa una lista pública: las contraseñas de cuentas siguen almacenadas mediante Argon2id. Validar formato, número de entradas y checksum del artefacto; fijar el checksum calculado durante esa construcción, sin inventarlo ahora. La consulta se ejecuta en el servidor, sin enviar contraseñas ni prefijos a terceros y sin otro servicio de pago. El almacenamiento cabe en el disco de pruebas presupuestado.

Revisar mensualmente nuevas revisiones de la fuente y antes de cada entrega; incorporar una revisión solo después de comprobar procedencia/licencia, integridad y pruebas de coincidencia. Actualizar el índice atómicamente, conservando el último válido si falla la actualización. La revisión mensual no obliga a cambiar periódicamente las contraseñas. Si no existe un índice válido, no completar registros ni cambios/restablecimientos de contraseña: informar de indisponibilidad de validación, sin consumir el enlace ni modificar la contraseña. El inicio de sesión con credenciales ya establecidas no depende del corpus. La política se aplica a toda contraseña nueva aunque cumpla longitud y composición.

Alternativas: bcrypt no seleccionado por su límite habitual de bytes; SHA-256 no sirve como hash de contraseña. Argon2id permite conservar la entrada completa y parametrizar memoria/coste. Fuente: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Sesiones revocables

Usar identificador opaco más secreto independiente de 32 bytes aleatorios criptográficos. PostgreSQL conserva solo SHA-256 del secreto, accountId, createdAt, expiresAt absoluto, revokedAt y clase de acceso. Comparar el verificador en tiempo constante. El identificador solo nunca autentica. No registrar el secreto ni incluirlo en enlaces, archivos .patron, respuestas de operaciones o backups de sesiones en claro.

expiresAt se fija al iniciar sesión, con máximo de 7 días; consultar o renovar transporte no lo desplaza. Las sesiones de verificación y recuperación de cuenta tienen capacidades limitadas por el estado de cuenta. Verificar cuenta activa/sesión/permisos en cada acceso remoto y otra vez en la frontera de confirmación de mutaciones. No añadir un cierre por inactividad no acordado.

Revocación y confirmación de mutaciones usan el mismo orden de bloqueo: cuenta, sesión, recurso afectado. Restablecer contraseña y revocar sesiones se confirma en una sola transacción. Si la revocación se confirma primero, una publicación posterior se rechaza. Expiración se vuelve a comprobar con tiempo actual del servidor en la sección final de la transacción. Pruebas futuras deben cubrir ambas carreras.

Alternativa descartada: JWT autocontenido como única autorización, porque no satisface por sí solo la revocación inmediata acordada. Fuente: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Transporte y almacenamiento cliente

Web/PWA y API bajo el mismo origen HTTPS. Cookie de sesión __Host-patron-session, Secure, HttpOnly, SameSite=Lax, Path=/ y sin Domain. La cookie no sustituye la validación backend. No guardar el secreto en localStorage ni en caché del service worker.

Para mutaciones con cookie: token CSRF vinculado a la sesión y cabecera explícita, comprobación de Origin y rechazo de orígenes no autorizados. Incluir login y logout en la protección pertinente. GET no cambia estado. No usar SameSite como única defensa. Fuente: [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

CAD: el proceso principal envía Authorization Bearer por HTTPS y mantiene el secreto fuera del renderer. Al persistirlo, usar safeStorage de Electron sobre protección Windows y permisos del archivo del usuario. Si el cifrado no está disponible, no degradar a texto claro. Esto no protege frente a todo proceso malicioso ejecutado por el mismo usuario Windows. Fuente: [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

La habilitación local tras el primer acceso verificado es un estado separado de la credencial remota: logout, expiración y revocación no bloquean editar/guardar/exportar localmente. Para logout sin conexión, conservar únicamente la capacidad protegida necesaria para revocar esa sesión al reconectar; no reutilizarla para otras solicitudes. El servicio debe permitir invalidar de forma idempotente la propia sesión identificada, aunque ya haya expirado, sin conceder acceso a recursos.

## Enlaces de un uso

Secretos aleatorios de 32 bytes, solo hash en base, vinculados a cuenta, propósito, emisión, expiración y consumo. Verificación: 2 horas. Recuperación: 30 minutos. Reenvío invalida el token anterior del mismo propósito al confirmar la emisión del nuevo. Confirmación valida y consume dentro de la transacción; dos confirmaciones concurrentes no producen dos efectos. Abrir un enlace GET no consume el token ni cambia contraseña: se requiere la confirmación correspondiente. Las respuestas y logs no exponen el secreto.

## Verificaciones futuras

Comprobar cookie/CSRF, secretos ausentes del renderer y logs, expiración absoluta, revocación concurrente, token de un uso consumido una sola vez, logout offline y conservación del CAD local. Medir coste Argon2id y memoria bajo concurrencia en el entorno seleccionado. No se han ejecutado estas pruebas.

## Credencial de comprobación U2

Separada de sesiones, enlaces de reset y capacidades de revocación de logout. Secreto aleatorio de 32 bytes, verificador hash en servidor, vinculado a requestId y credentialId; comprobación de propósito y vencimiento en cada solicitud. Nunca permite recuperar cuenta ni acceder a contenido. El logout de sesión normal no lo borra ni lo usa para otros endpoints.

CAD: secreto solo en main, safeStorage y permisos del usuario Windows, nunca renderer. Web/PWA: cookie HttpOnly/Secure/SameSite=Strict sin Domain y con Path restringido a la ruta de comprobación de esa solicitud; nombre __Secure-deletion-status. No localStorage ni caché del service worker. Emisión con cookie de acceso limitado requiere protección CSRF/Origin. La ruta de consulta solo lee estado y no devuelve secretos. Cookie existente después del vencimiento no autoriza nada: manda el plazo del servidor; retirar cookie al comprobar caducidad. La persistencia del navegador puede perderse si el usuario borra sus datos; no reconstruir una credencial a partir de correo ni declarar eliminación por esa pérdida.

Conservar evidencia mínima 90 días desde el resultado terminal según FR-287/288, sin ampliación. Autenticación normal o recuperación no se obtienen con esta capacidad. Reintentos y efectos locales: contracts/api.md. U2 cerrado documentalmente, pruebas pendientes.
