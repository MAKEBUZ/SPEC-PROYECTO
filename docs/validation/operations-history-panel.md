# T056 — Pendientes y Resueltas

Rama patronaje, 2026-11-16. Implementación local sin despliegues ni servicios AWS.

## Comportamiento

- Pantalla compartida en cuenta CAD y portal/PWA, con entradas identificadas por operación, tipo y estado. Declara expresamente que el historial es de esta cuenta en este dispositivo.
- Pendientes: comprobación manual, pausa/reanudación persistente y estados sin conexión, sin permiso o resultado no disponible. Las comprobaciones solo consultan; nunca reenvían la mutación original.
- Resueltas: éxito, fallo y finalización sin cambios confirmados. Se presentan como resultados históricos, sin fingir una consulta del recurso actual ni mantener bloqueos por un fallo de esa consulta.
- Retención de 30 días desde receivedAt original, sin ampliarla al consultar o recibir duplicados. La caducidad retira también la posibilidad de reintentar el intento. La limpieza conserva huellas de supresión para impedir que la migración reconstruya entradas eliminadas.
- Limpieza individual o conjunta con alcance local congelado, confirmación y advertencia de pérdida de reintentos. Cancelar no elimina. Los resultados que lleguen después de abrir la confirmación quedan fuera del alcance. Sesión/cuenta se vuelven a comprobar al confirmar, también sin conexión.
- Reintento manual para las acciones de cuenta disponibles: prepara el formulario o acción correspondiente, exige volver a confirmar datos/alcance actuales y crea otra identidad con retryOf. No conserva ni reutiliza contraseñas o tokens. Antes del envío vuelve a comprobar que el fallo original sigue vigente, pertenece a la cuenta y no fue limpiado. Logout y revocación CAD admiten esa vinculación sin modificar el comportamiento de los registros protegidos anteriores.
- Al salir, invalidarse/vencer la sesión o pasar a acceso limitado, se ocultan entradas y cantidades. Los resultados válidos en curso pueden conservarse internamente para la cuenta original sin reactivar sesión ni reintentar. Los cambios de cuenta entre pestañas invalidan la vista local anterior; mensajes de la propia pestaña no invalidan su login recién confirmado.
- Migración conservadora de identificadores del registro anterior: solo cuenta actual, identidad estable, sin recrear tombstones ni inventar resultados. Creación y migración concurrentes convergen en la misma entrada del journal. La limpieza del registro anterior conserva entradas ajenas al alcance.

## Avance de T061

El propietario de lifecycle comprueba pendientes aun fuera del panel, con una sola ronda en curso, pausa/backoff y sesión vigente. Al cerrar o suspender no comienza nuevas consultas; una respuesta confirmada ya iniciada conserva las reglas de recepción interna. La limpieza de resueltas también se ejecuta sin mostrar el historial y depura copias en snapshots de cuentas activas o pendientes de eliminación según la evidencia de supresión.

T061 permanece abierta por el enlace de las mutaciones de publicación/proyectos y papelera a sus flujos aún pendientes (T052/T089), y la evidencia específica de lifecycle completo. Las acciones de esos módulos deberán incorporar sus reintentos específicos al panel cuando se implementen. T056 no implementa esos módulos ni declara que ya estén disponibles.

## Verificación

- Pruebas de dominio: ocultación, frontera de 30 días, alcance congelado, conservación de pendientes, migración sin resurrección, respuesta tras logout, reintento manual con nueva identidad y pausa de consultas.
- E2E con Nest/PostgreSQL efímero, Edge y Electron: historial real tras editar perfil, consulta y limpieza sin conexión, cancelación, conservación del recurso remoto, logout y cambio de cuenta entre pestañas.
- Builds de escritorio y portal con TypeScript estricto; el portal usa su configuración webpack existente. Persisten avisos de tamaño del bundle desktop y directivas use client durante el empaquetado de Electron.
- No se ejecutan ensayos físicos T039. Los contenedores PostgreSQL de ensayo se retiran al terminar.

Resultado final — 2026-11-16: 147/147 pruebas en 34 archivos (tests/recovery y suites de cuenta, IPC, sesión, observadores de eliminación, reintentos e historial); TypeScript sin errores. E2E de cuenta: 9/9 en 42,05 s; contenedor efímero retirado. No equivale a ejecutar toda la suite del producto. T056 marcada completa; T061 permanece pendiente en el alcance indicado arriba.
