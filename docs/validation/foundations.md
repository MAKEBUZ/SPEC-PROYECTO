# Fundamentos — cierre T001–T015

Fecha: 2026-11-14. Rama: patronaje. Sin despliegues, recursos AWS ni correo real.

## Resultado

Las quince tareas de preparación y fundamentos están completadas. No están implementadas las historias US1 y siguientes; el shell no ofrece todavía edición, guardado ni exportación. Los servicios y validadores base se integrarán con los controladores y casos de negocio de esas historias.

## Evidencia ejecutada

Toolchain aislado: Node 24.22.3 / npm 12.2.2, sin cambiar las instalaciones globales. Node verificado contra SHASUMS256 oficial: 86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6. Ejecutar comandos mediante tools/validation/toolchain.ps1 o un entorno con esas versiones.

- check: TypeScript estricto correcto.
- test:unit: 28 casos en 6 archivos; revisión JCS/SHA-256, hash de bytes, borradores, capacidades IPC, transacciones simuladas, correo capturado, almacenamiento privado y errores sin secretos.
- test:contracts: 13 casos en 3 archivos; DTO estrictos, confirmaciones, publicación estructural, acceso por clase/capacidad, OpenAPI coherente, servidor HTTP real en 127.0.0.1, JSON duplicado/UTF-8 inválido, rechazo 413 temprano, límite de bytes real y Cache-Control no-store.
- test:integration:local: 10 casos en 2 archivos contra PostgreSQL 18.7 real. Migraciones repetidas y alteradas, rollback, solicitudes concurrentes idempotentes, restricciones de sesión/cuota, nueva identidad tras borrar cuenta de ensayo, tokens reemplazados/consumidos concurrentemente y rollback del consumo junto al efecto.
- assets:verify: los cinco activos y licencias coinciden con tamaño y SHA-256. Corpus completo: 5.189.454 entradas, 48.312.893 bytes. Noto Sans Regular TTF y resvg WASM fijados.
- contracts:check: docs/api/openapi.json coincide con el generador; 37 rutas documentadas, sin módulos aplazados.
- test:desktop:foundation: PASS con Electron 45.3.2 / Node 24.22.2, ventana oculta. Renderer sin require/process y bridge comprobado. Compilación main ESM/preload CommonJS correcta.
- git diff --check: sin errores; solo avisos de conversión LF/CRLF en documentos previos.

PostgreSQL se ejecutó en contenedores efímeros, con puerto aleatorio publicado solo en 127.0.0.1 y contraseña sintética. Contenedores retirados al terminar; comprobación final sin contenedores de ensayo restantes. El motor Docker local y su caché de imagen permanecen disponibles.

## Fallos detectados antes de completar

Las pruebas nuevas fallaron antes de implementar los DTO, la autorización y las primitivas de identidad. Las pruebas HTTP reales detectaron JSON duplicado clasificado como 403 y espera indebida ante Content-Length excesivo: el parser JSON estricto rechaza ambos correctamente. Las restricciones del sandbox de loopback se resolvieron ejecutando las pruebas locales fuera de él, sin cambiar destinos.

En el incremento anterior se corrigieron la conversión errónea de 400/404/413 a 500, la repetición de pruebas compiladas desde dist y el bloqueo de arranque ESM de Electron. El ejecutor Electron exige binario presente/versionado y no descarga implícitamente.

## Límites de esta validación

OpenAPI describe los contratos previstos, no afirma que los endpoints de negocio estén publicados. El resolver de credenciales y la revalidación final de sesión/propiedad se conectarán con los servicios US1/US3/US8; por defecto se deniega acceso. Los handlers de carga deben usar FileSizeLimit antes de confirmar staging. No se han implementado registro de cuentas de usuario, correo real, CSRF de clientes ni flujo de publicación.

La comprobación de identidad usa UUID generado internamente y unicidad de correo normalizado, sin identidad elegida por el cliente ni historial transferido por correo. Los tokens almacenan solo hash y serializan reemplazo/consumo bajo bloqueo de cuenta; las reglas de ciclo de cuenta y envío pertenecen a US1.

La matriz completa de entrega (Linux/Argon2 nativo, instalador Windows, adaptador de archivos, PDF determinista, impresión física, PWA y móviles reales) se valida en sus tareas posteriores. La presencia de una dependencia o un activo no equivale a haber probado esas funciones. El índice de contraseñas corresponde a T018; fuentes y WASM deben incorporarse al futuro perfil PDF.

Siguiente fase: US1, empezando por pruebas T016/T017, sin despliegues AWS.
