# T062 — estados y recuperación

Validación local en `patronaje`, 2026-11-16. Sin despliegues ni AWS. No sustituye los ensayos físicos pendientes.

## Resultado

- 512/512 pruebas unitarias, de recuperación y contratos, en 93 archivos.
- 29/29 pruebas de integración en PostgreSQL temporal local: operations, deletion-check, account-lifecycle y desktop-publication. Contenedor retirado.
- TypeScript: `tsc --noEmit`, correcto.
- Se añadieron siete casos: identidad/tipo de evidencia incorrectos (dos), consulta concurrente con pausa, respuesta posterior al cierre, dos dispositivos con respuesta perdida, secuencia completa de reintentos U2 y reapertura tras limpieza parcial.
- No se modificó código de producción ni decisiones aprobadas. La evidencia E2E de integración permanece en `operations-lifecycle-complete.md`; no se repitió en esta tarea de pruebas.

## Trazabilidad de transiciones

Cada fila indica la prueba ejecutada y la transición comprobada. Los nombres de archivo enlazados contienen los escenarios concretos. FR-230 (filtro de notificaciones) queda excluido expresamente de T062. Los módulos aplazados, incluida publicación automática y colaboración de producto, no se habilitan con esta validación; se comprueban las reglas de autorización histórica ya implementadas.

| Requisito | Suite | Transición/evidencia |
|---|---|---|
| FR-126 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Rechaza evidencia de otra identidad y conserva pendiente/bloqueos. |
| FR-127 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Reapertura, misma cuenta, sesión y pausa persistida. |
| FR-128 | [operations-lifecycle](../../tests/recovery/operations-lifecycle.spec.ts) | La reconciliación consulta; no repite mutaciones. Publicación automática aplazada. |
| FR-129 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Una consulta en curso y espera desde la respuesta; pausa concurrente. |
| FR-130 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Conflictos simétricos y operaciones independientes. |
| FR-131 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Pausa persistente y comprobación manual sin reanudar. |
| FR-132 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Sin permiso suspende automático, conserva bloqueo y permite manual. |
| FR-133 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Resultado no disponible conserva bloqueo y permite manual. |
| FR-134 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Evidencia de identidad/tipo incorrectos no resuelve; conciliación de publicación en integración desktop-publication. |
| FR-135 | [operation-history](../../tests/recovery/operation-history.spec.ts) | No se permite eliminar un pendiente. |
| FR-136 | [integration/operations](../../tests/integration/operations.spec.ts) | Evidencia mínima independiente del recurso y purga de la última identidad. |
| FR-137 | [integration/operations](../../tests/integration/operations.spec.ts) | Autorización histórica tras retirar el recurso; rechazo de otra cuenta. |
| FR-138 | [integration/operations](../../tests/integration/operations.spec.ts) | Anonimización de solicitante eliminado y ausencia de secretos. |
| FR-139 | [integration/operations](../../tests/integration/operations.spec.ts) | Purga atómica de la última identidad, incluida concurrencia. |
| FR-140 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Cierre solo con confirmación explícita de eliminación. |
| FR-141 | [operations-lifecycle](../../tests/recovery/operations-lifecycle.spec.ts) | Publicación independiente solo con prueba explícita; integración desktop-publication. |
| FR-217 | [operations-lifecycle](../../tests/recovery/operations-lifecycle.spec.ts) | Registro de mutaciones autenticadas con tipo e identidad sin secretos. |
| FR-218 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Resultado confirmado pasa al historial resuelto sin repetición. |
| FR-219 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Treinta días desde primera recepción, sin ampliación. |
| FR-220 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Vencimiento retira entrada resuelta; no retira pendientes. |
| FR-221 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Limpieza usa alcance confirmado y excluye resultados posteriores. |
| FR-222 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Logout oculta entradas y cantidades, conserva historial. |
| FR-223 | [operation-history](../../tests/recovery/operation-history.spec.ts) | Cuenta/sesión incorrectas impiden consultas, conservando pausa. |
| FR-224 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Resultado en vuelo tras logout se guarda oculto sin repetir. |
| FR-225 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Consulta local con sesión válida y sin conexión. |
| FR-226 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Limpieza local de resueltas sin conexión conserva pendientes. |
| FR-227 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Eliminación pendiente oculta historial y conserva pausas. |
| FR-228 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Confirmación de eliminación deja tombstones de resueltas. |
| FR-229 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Historial cerrado no aparece en la vista autorizada. |
| FR-231 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Respuesta vinculada al cerrado no reconstruye historial. |
| FR-232 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Frontera inclusiva de treinta días desde confirmación local. |
| FR-233 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Respuesta tardía no modifica vencimiento original. |
| FR-234 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Respuesta tardía no reconstruye entrada retirada. |
| FR-235 | [history-storage](../../tests/recovery/history-storage.spec.ts) | Reapertura de estado vencido retoma limpieza sin sesión ni conexión. |
| FR-236 | [operations-history-panel](../../tests/recovery/operations-history-panel.spec.ts) | Limpieza manual limitada a resueltas; cerradas no forman parte de la vista. |
| FR-237 | [history-maintenance](../../tests/recovery/history-maintenance.spec.ts) | Fallo de limpieza conserva estado vencido y reintenta. |
| FR-238 | [history-maintenance](../../tests/recovery/history-maintenance.spec.ts) | Aviso de mantenimiento y retiro tras completar limpieza. |
| FR-239 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Vencimiento irreversible y referencia temporal guardada. |
| FR-240 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Incertidumbre conserva oculto sin aceptar respuesta tardía. |
| FR-241 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Respuesta descartada no se recupera al resolver incertidumbre. |
| FR-242 | [time-check](../../tests/recovery/time-check.spec.ts) | Consulta solo con aplicación abierta y conexión, sin contexto de cuenta. |
| FR-243 | [time-check](../../tests/recovery/time-check.spec.ts) | Secuencia de fallos creciente y saturación. |
| FR-244 | [time-maintenance](../../tests/recovery/time-maintenance.spec.ts) | Estado de aviso durante mantenimiento y retiro al confirmar. |
| FR-245 | [time-check](../../tests/recovery/time-check.spec.ts) | Evidencia malformada y reloj inválido no producen vencimiento. |
| FR-246 | [closed-history](../../tests/recovery/closed-history.spec.ts) | Vigencia comprobada conserva vencimiento y solo admite nuevas pruebas válidas. |
| FR-247 | [time-check](../../tests/recovery/time-check.spec.ts) | Cierre voluntario conserva pendiente y espera. |
| FR-248 | [time-check](../../tests/recovery/time-check.spec.ts) | Respuesta de consulta interrumpida se descarta. |
| FR-249 | [time-storage](../../tests/recovery/time-storage.spec.ts) | Estado persistido se recupera al reabrir; time-maintenance conserva aviso. |
| FR-250 | [time-check](../../tests/recovery/time-check.spec.ts) | Espera conservada al reabrir. |
| FR-251 | [time-check](../../tests/recovery/time-check.spec.ts) | Una consulta sin encolar disparadores. |
| FR-252 | [time-cycle](../../tests/recovery/time-cycle.spec.ts) | Desconexión descarta respuesta y respeta espera restante. |
| FR-253 | [time-check](../../tests/recovery/time-check.spec.ts) | Frontera de 30000 ms y descarte de respuesta vencida. |
| FR-254 | [time-check](../../tests/recovery/time-check.spec.ts) | 5, 10, 20, 40, 80 y 120 segundos desde fin del intento. |
| FR-255 | [time-cycle](../../tests/recovery/time-cycle.spec.ts) | Desconexión persiste un solo fallo. |
| FR-256 | [time-check](../../tests/recovery/time-check.spec.ts) | Reinicio de secuencia solo tras confirmación persistida. |
| FR-257 | [time-check](../../tests/recovery/time-check.spec.ts) | Espera basada en continuidad temporal, no reloj civil. |
| FR-258 | [time-check](../../tests/recovery/time-check.spec.ts) | Tiempo suspendido cuenta en espera. |
| FR-259 | [time-check](../../tests/recovery/time-check.spec.ts) | Suspensión interrumpe y cuenta un fallo. |
| FR-260 | [time-check](../../tests/recovery/time-check.spec.ts) | Timeout usa tiempo transcurrido de consulta, no fecha civil. |
| FR-261 | [time-cycle](../../tests/recovery/time-cycle.spec.ts) | Continuidad incierta repite intervalo sin añadir fallo. |
| FR-262 | [time-storage](../../tests/recovery/time-storage.spec.ts) | Interrupción persistida cuenta una vez al reabrir. |
| FR-263 | [history-storage](../../tests/recovery/history-storage.spec.ts) | Vencimiento durable permite limpieza offline al reabrir. |
| FR-264 | [history-maintenance](../../tests/recovery/history-maintenance.spec.ts) | Interrupción en la segunda compactación: reapertura limpia los restantes y rechaza recrear ambos identificadores. |
| FR-265 | [time-check](../../tests/recovery/time-check.spec.ts) | Reapertura durante espera conserva nivel y tiempo o intervalo completo. |
| FR-266 | [time-check](../../tests/recovery/time-check.spec.ts) | Referencia guardada reutilizada únicamente con continuidad fiable. |
| FR-267 | [time-cycle](../../tests/recovery/time-cycle.spec.ts) | Fallo de escritura conserva evidencia en memoria sin declarar completado. |
| FR-268 | [time-maintenance](../../tests/recovery/time-maintenance.spec.ts) | Reintento de escritura offline sin nueva consulta. |
| FR-269 | [history-storage](../../tests/recovery/history-storage.spec.ts) | Recuperación exacta de copia válida y aislamiento de daño. |
| FR-270 | [operations-lifecycle](../../tests/recovery/operations-lifecycle.spec.ts) | Daño aislado sin identificadores, preservando otras cuentas. |
| FR-271 | [history-storage](../../tests/recovery/history-storage.spec.ts) | Vencimiento confirmado prevalece sobre snapshots antiguos. |
| FR-272 | [time-maintenance](../../tests/recovery/time-maintenance.spec.ts) | Aviso de guardado retirado solo al persistir correctamente. |
| FR-286 | [deletion-check](../../tests/recovery/deletion-check.spec.ts) | Error/credencial inválida no produce prueba de limpieza; integración verifica acceso limitado. |
| FR-287 | [deletion-check](../../tests/recovery/deletion-check.spec.ts) | Frontera exacta de 90 días; integración comprueba purga y no ampliación. |
| FR-288 | [deletion-check](../../tests/recovery/deletion-check.spec.ts) | Cancelled no se convierte en deleted ni crea sesión; integración conserva plazo. |
| FR-289 | [integration/deletion-check](../../tests/integration/deletion-check.spec.ts) | Segundo dispositivo recibe credencial propia ligada a la misma solicitud. |
| FR-290 | [integration/deletion-check](../../tests/integration/deletion-check.spec.ts) | Cookie limitada sobrevive logout sin sesión normal. |
| FR-291 | [unit/deletion-check-controller](../../tests/unit/deletion-check-controller.spec.ts) | Apertura/reconexión/manual comparten consulta; offline y cerrado no consultan. |
| FR-292 | [deletion-check](../../tests/recovery/deletion-check.spec.ts) | Dos dispositivos con respuesta perdida; esperas crecientes saturadas y reinicio tras éxito. |

U2: SC-277 corresponde a FR-286; SC-278 a FR-287; SC-279 a FR-288; SC-280 a FR-289; SC-281 a FR-290; SC-282 a FR-291; SC-283 a FR-292. La prueba de dos dispositivos del controlador complementa la emisión de dos credenciales reales comprobada en PostgreSQL; no representa dos teléfonos físicos.

## Comandos reproducibles

```powershell
.local/toolchain/node.exe node_modules/vitest/vitest.mjs run tests/unit tests/recovery tests/contracts --maxWorkers=2
.local/toolchain/node.exe node_modules/typescript/bin/tsc --noEmit
.local/toolchain/node.exe tools/validation/postgres.mjs tests/integration/operations.spec.ts tests/integration/deletion-check.spec.ts tests/integration/account-lifecycle.spec.ts tests/integration/desktop-publication.spec.ts
```

Los fallos y cierres se inyectan de forma controlada. No se ensayaron cortes físicos de energía, USB, impresión ni dispositivos móviles reales. Las tareas de aceptación física continúan pendientes.

