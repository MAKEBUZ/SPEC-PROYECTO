# T061 — cierre de integración local

La integración de T061 se ejecuta en `patronaje`, sin despliegue, AWS ni ensayos físicos. Este informe sustituye los pendientes históricos de `operations-lifecycle.md`; T062 conserva la matriz exhaustiva de transiciones y T097 la aceptación individual de requisitos.

## Admisión y operaciones incluidas

El propietario del journal comprueba conflictos antes de crear una operación nueva. Las consultas y reconciliaciones conservan su identidad original; un registro dañado bloquea admisiones dependientes. Desktop serializa en main y web utiliza además un Web Lock compartido entre pestañas, de modo que dos lecturas concurrentes no admiten cambios incompatibles sobre claves distintas del journal.

Cuenta, creación de proyecto, comienzo/confirmación/abandono de publicación y papelera utilizan el journal. Logout y revocación mantienen su flujo protegido y no impiden cerrar acceso por una operación pendiente. Perfil tiene un alcance independiente de los patrones; una eliminación de cuenta sigue afectando al conjunto de la cuenta. No se guardan contraseñas, tokens, nombres de recursos ni cuerpos completos en el journal.

Para papelera, el cliente obtiene el alcance actual del servidor antes de admitir la mutación y exige que corresponda a la revisión confirmada por el usuario. Se registran el recurso raíz y sus hijos afectados; restauración valida la revisión del recurso, mientras envío a papelera/purga validan la revisión del conjunto. Un cambio de alcance exige nueva revisión y confirmación; no confirma automáticamente el conjunto nuevo. La autorización y validación definitiva siguen en el servidor.

Los rechazos conocidos de admisión y los fallos de preparación anteriores al envío no crean un pendiente ficticio. Si hay incertidumbre de persistencia o transporte, no se declara fracaso ni se retiran bloqueos. La publicación registra su admisión antes de persistir la correlación del intento, para no conservar un intento nuevo si una operación dependiente impide admitirlo.

Los nuevos seguimientos autenticados tienen una sola fuente durable: el journal del host. El registro antiguo se migra y verifica antes de retirarlo; las operaciones públicas sin identidad de cuenta mantienen el tratamiento anterior. «Comprobar pendientes» consulta el journal y solo comprueba resultados: no repite mutaciones. Se evita que una copia legacy adicional conserve indefinidamente los nuevos seguimientos de cuentas eliminadas.

## Eventos, limpieza y privacidad

Se mantienen los adaptadores de red, cierre, suspensión/reanudación, fallo del renderer y reapertura. Los cambios de continuidad usan las reglas de incertidumbre aprobadas, sin sustituirlas por el reloj civil. El descarte de respuestas interrumpidas y el contador de reintentos de consulta limitada siguen separados del mantenimiento temporal.

La propiedad web se transfiere mediante Web Locks al liberar la página; los bloqueos de operaciones sobreviven a la reapertura mediante IndexedDB. La prueba de dos pestañas verifica exclusión de admisión, transferencia después de pagehide y persistencia al recargar.

La correlación adicional de publicación se retira al vencer de forma durable la conservación del seguimiento cerrado por eliminación de cuenta. Se utiliza la misma vía de limpieza con reintentos: no requiere sesión ni conexión, no reinicia el plazo y un fallo muestra el aviso genérico. Se verifica la marca de retirada antes de eliminar generaciones y copias de recuperación. Esa marca impide recrear la correlación antigua. Los editables, PDF locales y registros de otras cuentas no se eliminan.

## Validación local

- 505/505 pruebas de unidades, recuperación y contratos en 93 archivos.
- 25/25 pruebas de integración PostgreSQL en publicación desktop, comprobación limitada y ciclo de vida de cuenta.
- TypeScript y builds de CAD/portal correctos; se conservan las advertencias existentes sobre tamaño del bundle y directivas `use client` del bundle desktop.
- Pruebas nuevas: admisión de recursos independientes/conflictivos sin crear registros rechazados; alcance revisado y revisión de restauración; diferencia entre rechazo local e incertidumbre de almacenamiento; retirada de correlación y copias; limpieza relacionada solo tras vencimiento persistido, con backoff; eventos desktop y retirada de listeners; ausencia de duplicación legacy; coordinación entre dos pestañas reales de Edge con IndexedDB/Web Locks.

Los eventos de suspensión del adaptador desktop se prueban con emisores controlados; no se afirma haber suspendido físicamente el equipo. Los E2E emplean Edge/Electron y API/PostgreSQL locales. Las pruebas físicas de USB, teléfonos, impresión y hardware de referencia permanecen aplazadas.

E2E final: **20/20** en `tests/e2e/account.spec.ts`, `tests/e2e/trash-lifecycle.spec.ts` y `tests/e2e/publication.spec.ts` (107,83 s). Incluye cuenta con respuestas perdidas, eliminación/recuperación, papelera y conservación de editables, publicación/PDF y reapertura del CAD, y dos pestañas. Contenedores de ensayo retirados. T061 marcada completa: **89/98 tareas completas, 9 pendientes**.
