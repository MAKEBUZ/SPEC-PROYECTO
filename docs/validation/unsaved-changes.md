# T043 — protección de cambios sin guardar

Avance local en patronaje, 2026-11-15. No despliegue ni AWS.

## Conectado

- «Nuevo documento» usa LeaveGuard y un diálogo nativo con Guardar, Descartar cambios y Cancelar. Cancelar conserva el documento; descartar permite crearlo de nuevo. Las solicitudes simultáneas no abren otra decisión.
- El Workspace protege `beforeunload` usando el estado actual del documento, incluso desde Cuenta, preparación o recuperación. Electron permite continuar el cierre impedido únicamente cuando se elige explícitamente descartar. La opción predeterminada y Escape son Cancelar.
- La opción Guardar conserva el documento e informa de que el guardado local aún no está disponible. No declara éxito ni confunde la captura de recuperación con un guardado.
- La prueba usa Electron y sustituye únicamente la respuesta del diálogo nativo para ejercitar cada decisión. Verifica conservación del contenido, creación tras descarte, cierre desde Cuenta y cierre final confirmado.

## Validación y límites

11/11 pruebas de cierre, guardia, IPC y preparación pasan. TypeScript y compilación desktop correctos, con los avisos de bundle/directiva ya existentes. Los primeros ensayos detectaron errores en su limpieza: consultar el proceso después de cerrarlo y cerrar la preparación sin responder al nuevo diálogo. Se corrigió el arnés para elegir descarte explícito al retirar fixtures; no se deshabilitó la protección de producción. El proceso de ensayo bloqueado se identificó por su directorio temporal y se retiró.

T043 **permanece abierta**. Faltan guardar correctamente mediante el adaptador Windows de T041 y comprobar la sustitución al abrir otro archivo mediante T042. Las pruebas del núcleo cubren el fallo/cancelación del guardado y las ediciones durante un guardado; eso no equivale a validar el guardado real desde la interfaz. No se marca completa por implementar solo cancelar/descartar y el bloqueo seguro del guardado no disponible.

## Regresión amplia del editor

La primera ejecución del editor agotó el límite predeterminado de cinco segundos en 23 escenarios (otros cuatro pasaron); los dos archivos unitarios ejecutados junto a ella pasaron. Un escenario aislado repitió el timeout; la prueba diagnóstica con mayor presupuesto completó sus aserciones. Se fijó un presupuesto explícito de 30 segundos por escenario en `cad-edit.spec.ts`, conservando las aserciones y los objetivos del producto. La hipótesis de ralentización por ventana oculta no resolvió el problema y su cambio temporal se retiró. No se modificó la política de ventanas de producción.

Resultado de la repetición completa: **27/27 E2E del editor**, 306,41 s, con todas las aserciones conservadas. Las 11 pruebas específicas de cierre/guardia/IPC/preparación también pasaron; los dos archivos unitarios de comandos y herramientas pasaron durante la ejecución inicial (18 pruebas). No se presenta este presupuesto E2E como objetivo de rendimiento del producto.
