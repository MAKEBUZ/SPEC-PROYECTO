# T018 — política de contraseñas e índice del corpus

Validado el 2026-11-14, rama patronaje. Sin cambios de requisitos, servicios de pago, correo real ni despliegues AWS.

## Implementación

PasswordService aplica 12–128 puntos de código Unicode, Lu/Ll/Nd y P/S. Rechaza Unicode mal formado; no recorta, normaliza ni trunca. Expone razones seguras en español y fieldErrors, sin devolver la contraseña. Los controladores de T019 deberán traducir esos errores de dominio a la respuesta HTTP aprobada.

Toda contraseña nueva pasa por el corpus y Argon2id m=19456 KiB, t=2, p=1, sal aleatoria individual de 16 bytes y hash de 32 bytes. Una sola operación Argon2 por proceso, compartida por hash y verificación; un fallo libera la cola, sin reducir parámetros. Verificar una contraseña ya establecida no consulta el corpus ni revalida su composición. No se impone caducidad de contraseñas.

PasswordCorpus puede construirse sin índice. En ese estado impide generar hashes nuevos y permite que PasswordService siga verificando hashes establecidos. La recarga valida la nueva generación antes de sustituir la activa; el fallo de lectura/validación conserva la anterior. La cola del proveedor evita cerrar un archivo mientras una búsqueda está activa. No existe descarga ni actualización automática durante una solicitud de contraseña.

## Corpus e índice

- Fuente: SecLists, revisión 51aa7644c96b3fb6db8de9ecf55aa91195209c80; licencia MIT copiada dentro de la generación.
- Fuente completa: 5.189.454 entradas, 48.312.893 bytes. SHA-256 c95989fecfae9c91aa9f5c730344d5cabd6335bb094c9c60aba16bf1742a72fe.
- Índice: 166.062.528 bytes; un SHA-256 binario de 32 bytes por entrada, orden lexicográfico, sin eliminar entradas ni duplicados del origen.
- SHA-256 del índice: 82feaaea1b39b6323e73f4046c6eb2ebd1a619688185a5a4f33438b6e17516b5.
- Descriptor aprobado y versionado: tools/assets/password-index.json. Generaciones locales ignoradas por Git: .local/password-index.

El constructor procesa líneas por bytes (LF separa entradas; no elimina espacios ni CR del contenido), verifica hash/tamaño/contador de la fuente y reparte hashes en 256 particiones en disco. Usa 8 MiB de buffers de partición; ordena una partición cada vez. No carga millones de contraseñas en memoria. La ejecución local completa tardó 58,79 s y registró 303.468 KiB de RSS máximo del constructor; no es una medición de capacidad de EC2.

Antes de publicar se verifica desde disco el checksum, contador, tamaño y orden. Cada generación es independiente; un cambio atómico de current.json la activa, manteniendo las anteriores. Una reconstrucción debe coincidir con el descriptor aprobado antes de activar. Las búsquedas hacen búsqueda binaria en disco (unos 23 accesos para este corpus), con una huella de archivo comprobada antes y después para detectar cambios. Ausencia, corrupción o cambio detectado produce indisponibilidad, no una respuesta falsa de «contraseña ausente».

La atomicidad de publicación no promete supervivencia absoluta frente a fallos físicos del disco. No se eliminan automáticamente generaciones anteriores ni se acepta un checksum nuevo sin revisión.

## Pruebas ejecutadas

- TypeScript estricto: correcto.
- 13 pruebas específicas T018: límites 12/128/129 contando caracteres astrales; categorías Unicode; espacios y normalización; errores sin secretos; corpus positivo/no disponible; Argon2 nativo y sales distintas; login independiente del corpus; cola global y liberación tras fallo; coincidencia exacta en índice; reproducibilidad; reconstrucción fallida; lectores antiguos; corrupción antes/después de abrir; orden incorrecto aun con checksum consistente; rechazo de rutas fuera del índice y recarga fallida.
- Regresión: 41 pruebas unitarias y 13 de contratos HTTP aprobadas (las 13 específicas forman parte de las 41; no se suman dos veces).
- Corpus completo: lectura de las 5.189.454 entradas, validación íntegra del índice, seis muestras positivas distribuidas por el origen y ocho negativas contrastadas con él; rechazo de una entrada real que cumple composición/longitud; hash/verificación y rechazo de versiones recortadas o normalizadas; login tras cerrar el proveedor.
- Esa prueba de corpus/Argon2 pasó en Windows x64 y Linux x64, ambos Node 24.22.3. Linux se ejecutó con node:24.22.3-bookworm-slim, digest sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54, límite 512 MiB, sin red y con montaje de solo lectura; contenedor retirado automáticamente.

Las pruebas se escribieron antes del servicio/índice y fallaron por su ausencia. La prueba adicional de proveedor falló antes de incorporarlo. El sandbox bloqueaba rename de directorios temporales con EPERM; esos ensayos se ejecutaron fuera de él, sin ampliar rutas ni destinos.

## Reproducción e integración pendiente

Con Node 24.22.3/npm 12.2.2 (tools/validation/toolchain.ps1 en este equipo):

1. npm run assets:prepare
2. npm run password-index:build
3. npm run test:passwords
4. npm run test:password-corpus (compila antes de probar)

Revisar la fuente mensualmente y antes de cada entrega, como establece el plan; no se creó ninguna automatización. Una actualización requiere revisar procedencia/licencia, fijar revisión/hash/contador y actualizar conscientemente el descriptor, ejecutar las pruebas y conservar el último artefacto válido. No usar datos de usuarios ni llamar a servicios externos de comprobación.

T019–T021 deben conectar el proveedor real, PasswordService, transacciones y transporte. Un fallo de validación no debe consumir tokens ni modificar la cuenta; PasswordService no tiene efectos sobre PostgreSQL. Las suites HTTP US1 siguen dependiendo de esos controladores y trabajadores; T018 no convierte en verdes sus escenarios previamente en rojo. T018 no implementa pantallas ni mide rendimiento en AWS.
