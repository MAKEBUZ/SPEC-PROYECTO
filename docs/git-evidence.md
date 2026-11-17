# Evidencia Git

Revisión realizada el 2026-11-17 sobre `MAKEBUZ/SPEC-PROYECTO`.

| Rama / commit observado | Contenido |
|---|---|
| `patronaje` — `8a93c4ed6a1d021da2d98a33945fa2d4a1f3a898` | Subida consolidada de implementación, pruebas y documentación. No representa 98 commits independientes. |
| `constitucion` — `e0f3896637bf2503d7c3fa066b0bf61a9f98b94b` | Constitución y documentos SDD sin código. Es el destino de la revisión documental separada. |
| `main` — `52649a3` | Rama histórica; no se presenta como la entrega vigente. |

GitHub devolvió una lista vacía al consultar todos los PR del repositorio (`state=all`) antes de esta revisión. Por tanto, **no hay PR anteriores acreditados en ese corte**. El conector no tenía acceso al repositorio; se consultó la API con la autenticación Git existente, sin publicar credenciales.

El historial incluye commits de Diego Alejandro Ocampo Madroñero y MAKEBUZ; se conserva tal como existe. La integración anterior con DeepSeek y la asistencia posterior de Codex no se convierten retroactivamente en revisiones de terceros.

## División de esta entrega

El [PR #1](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/1) quedó cerrado sin fusionar. Lo sustituyen [PR #2: documentación](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/2) y [PR #3: README/demo/herramientas](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/3): documentación desde `codex/docs-constitucion` hacia `constitucion`, y README/demo/herramientas desde `codex/demo-patronaje` hacia `patronaje`. No se fusiona ninguno automáticamente. La rama constitucion conserva solo Markdown, informes de texto y JSON documental/de evidencias; no contiene código ejecutable.

El código probado sigue identificado por su commit en cada informe. Esta reorganización no añade ejecuciones ni convierte pendientes en aprobados.
