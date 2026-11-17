# Descarga privada — T064/T066

Validación local del 2026-11-15 en `patronaje`. No se han desplegado servicios ni usado AWS. T064 y T066 completas; no declara completadas US5, la impresión PDF ni la matriz física PWA.

## Implementación

La biblioteca conserva DTO, cursores firmados, autorización del propietario y comprobación final de cuenta/sesión y estado activo del patrón/proyecto. Las respuestas no contienen claves privadas de almacenamiento.

La descarga obtiene un stream del almacenamiento privado y escribe una copia temporal exclusiva. Verifica tamaño y SHA-256 del origen y vuelve a leer la copia para comprobar el hash antes de enviar cabeceras o contenido. Reautoriza después del almacenamiento. Sirve la misma copia mediante su descriptor abierto, con contrapresión del stream; no carga los 100 MB permitidos en un buffer completo. El tamaño temporal queda limitado al declarado y a la cuota por archivo publicada. El origen local entrega bloques de 64 KiB.

Mantiene `no-store`, `nosniff`, ETag de SHA-256, nombre saneado y disposición de descarga. Admite rangos simples, sufijos y rangos abiertos; `If-Range` distinto devuelve el archivo completo. Un rango fuera de límites devuelve 416. Cada solicitud nueva, reintento o reanudación vuelve a autorizarse. Una transferencia ya iniciada no vuelve a consultar sesión por cada bloque y puede terminar tras revocación.

El descriptor y el temporal se liberan tras éxito, rechazo de autorización, corrupción, error de origen o interrupción de consumo. Un fallo después de empezar la respuesta corta la conexión, sin añadir JSON a un archivo parcial. La interfaz existente verifica respuesta completa, tamaño y hash antes de ofrecer el archivo; E2E de biblioteca vuelto a ejecutar.

El almacén probado es local. No se configuró un adaptador AWS. Los temporales de un proceso terminado abruptamente requieren la política operativa de limpieza del servidor; esta validación cubre finalización y excepciones controladas, no una certificación de recuperación ante caída del sistema.

## Evidencia ejecutada

| Suite | Resultado |
|---|---|
| `tests/unit/verified-download.spec.ts` | 7/7: snapshot independiente, rangos, tamaño corto/largo, hash incorrecto, error de origen, cancelación e interrupción de consumo |
| `tests/integration/downloads.spec.ts` | 6/6 con API y PostgreSQL reales: versiones privadas, bytes exactos, rangos/If-Range, otros propietarios, papelera, corrupción, revocación antes de respuesta y durante transferencia |
| Regresión unitarias/contratos/recuperación/offset | 279/279, 46 archivos, 38,12 s |
| Integración completa | 117/117, 17 archivos, 9,34 s |
| `tests/e2e/account.spec.ts` | 7/7, 32,61 s; cuenta, biblioteca e IndexedDB con navegador/Electron |
| TypeScript | Sin errores |

En el escenario de revocación durante transferencia se verifica un editable de más de 1 MB: se revoca la sesión tras consumir el primer bloque y se confirma que los restantes completan los bytes originales. Las solicitudes HTTP posteriores completas y de rango reciben 401. La prueba evita fingir un archivo PDF: la preservación demostrada es de bytes, no una certificación geométrica pendiente de US6.

La regresión inicial reveló que `finishPublications()` del arnés asumía que un intento de dispatch completaba la cola, aunque otro esquema tuviera el bloqueo global. Ahora espera que desaparezcan las publicaciones `validating/validated`, con límite explícito de 20 segundos y propagación de errores. No modifica el worker, su exclusión global ni resultados esperados.

Comandos:

```powershell
.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts tests/recovery tests/geometry/offset.spec.ts
.local/toolchain/node.exe tools/validation/postgres.mjs
.local/toolchain/node.exe tools/validation/postgres.mjs --e2e tests/e2e/account.spec.ts
.local/toolchain/node.exe node_modules/typescript/bin/tsc --noEmit
```

PostgreSQL se creó exclusivamente en loopback y su contenedor se retiró al terminar. Las cuatro pruebas RED de separación asignadas a T074 no forman parte de la regresión local citada y siguen pendientes. T069 mantiene pruebas físicas Android/iPhone y matriz completa de navegadores; no se sustituyen por viewport emulado.
