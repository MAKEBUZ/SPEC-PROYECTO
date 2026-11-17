# Comprobación temporal y conflictos — 2026-11-15

Implementación local en `patronaje`, sin AWS, despliegue, commit ni push.

## T059: ciclo persistido

El núcleo `time-check.ts` se coordina mediante `time-cycle.ts`. Los puertos de reloj monotónico, consulta pública y almacenamiento mantienen el componente independiente de sesión y de mutaciones remotas. El host debe alimentar ticks y eventos reales; esa conexión sigue pendiente en T061.

Antes de consultar se guarda el marcador de intento. Se conserva una única consulta, se descartan respuestas interrumpidas por identidad/generación y se valida el límite de 30000 ms. Cierre voluntario, caída detectada al reabrir, desconexión y suspensión conservan sus transiciones distintas. Las esperas siguen 5/10/20/40/80/120 segundos; incertidumbre de continuidad reinicia solo el intervalo del nivel vigente. Recibir evidencia no reinicia el contador: debe guardarse correctamente.

Un fallo al guardar el marcador impide emitir la consulta. Recuperar esa escritura no inventa un fallo remoto: vuelve a pendiente antes de iniciar un intento nuevo. Un resultado válido cuyo guardado falla queda en memoria con su espera de escritura independiente; se puede persistir sin conexión, sin repetir la consulta. La consulta no se mantiene artificialmente activa durante ese guardado.

`TimeCheckStorage` guarda generaciones exclusivas con secuencia, hash previo y checksum, usando flush y relectura. Una generación dañada o faltante impide continuar; nunca se recupera silenciosamente una generación anterior que pudiera reactivar un intento. `save_pending` no se acepta como resultado durable completo. El almacenamiento es de un único propietario en main y debe usar almacenamiento local de aplicación. T060/T061 deberán conectar limpieza, aislamiento/avisos completos y adaptación de los clientes; no se declara el flujo de usuario terminado.

Pruebas:

- `time-check.spec.ts`: 9 transiciones y fronteras de tiempo.
- `time-cycle.spec.ts`: 5 pruebas de coordinación, persistencia antes de consulta, fallos de escritura, respuestas tardías y continuidad incierta.
- `time-storage.spec.ts`: 3 pruebas con archivos reales, reapertura, interrupción contada una vez, corrupción y generaciones faltantes.
- `time-maintenance.spec.ts`: 3 pruebas existentes de reintento de escritura, aislamiento del temporizador remoto y aviso genérico.

## T053: núcleo implementado, integración pendiente

`main/publication/conflicts.ts` construye un patrón independiente con identidad local nueva, geometría y preparaciones conservadas y sin vínculo remoto. No publica automáticamente ni altera el original. El consumidor debe abrirlo como documento nuevo sin ruta guardada; la pantalla de publicación todavía no lo integra.

Cargar una versión exige confirmación, vínculo de cuenta/patrón coincidente, metadatos de versión autorizada, tamaño/hash, UTF-8 estricto, estructura y revisión canónica correctos. El respaldo conserva el trabajo actual en un archivo nuevo exclusivo y verifica sus bytes y contenido antes de intentar sustituir memoria. Un reemplazo atómico comprueba que no haya cambios locales posteriores. El archivo original no se sobrescribe y no se invoca ninguna mutación remota.

Papelera permite conservar trabajo o restaurar explícitamente; estado desconocido solo conserva trabajo. Una falta de acceso o un fallo de red no prueba eliminación. Las opciones de publicar nuevo por eliminación requieren evidencia confirmada del proceso principal; su adquisición y conexión con publicación aún están pendientes. Por ello **T053 permanece abierta**.

Siete pruebas de conflictos cubren independencia, política conservadora, respaldo real, cancelación, fallo de respaldo, bytes/vínculo inválidos, cambios concurrentes, comparación final y exclusión de resoluciones simultáneas.

## Validación ejecutada

```powershell
.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/contracts tests/recovery tests/geometry/offset.spec.ts
.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/recovery/publication-conflicts.spec.ts
.local/toolchain/node.exe node_modules/typescript/bin/tsc --noEmit
```

Regresión: **292/292, 49 archivos, 42,19 s**. Después se añadieron dos escenarios de conflicto y se ejecutó su archivo completo: **7/7**. TypeScript sin errores. La regresión citada no incluye las cuatro pruebas RED de separación asignadas a T074. No se repitieron PostgreSQL/E2E: no cambian los servicios remotos ni las pantallas; sus evidencias anteriores no certifican estos nuevos flujos sin integrar.
