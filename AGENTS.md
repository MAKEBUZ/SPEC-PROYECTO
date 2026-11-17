# Instrucciones para Codex — PATRONAJE

- Lee `.specify/memory/constitution.md` y `specs/001-patronaje/spec.md` antes de continuar el trabajo de especificación.
- Fase actual: implementación local autorizada expresamente el 2026-11-14, empezando por preparación y fundamentos mediante speckit-implement. No desplegar ni generar gastos AWS.
- La primera entrega consolidada fue aprobada el 2026-11-14; la implementación local fue autorizada posteriormente el 2026-11-14. Los módulos aplazados no forman parte de la entrega aprobada.
- Rama de trabajo: `patronaje`. La funcionalidad existente se identifica como `001-patronaje`; no crear otra spec ni renombrar ramas para continuarla.
- Antes de ejecutar scripts de Spec Kit sobre esta funcionalidad, configurar en la misma sesión PowerShell:
  `$env:SPECIFY_FEATURE = '001-patronaje'`
  `$env:SPECIFY_FEATURE_DIRECTORY = Join-Path (Get-Location) 'specs/001-patronaje'`
- Las habilidades para Codex están en `.agents/skills/`. Leer el SKILL.md correspondiente antes de aplicar un flujo. Sus referencias `$speckit-*` son invocaciones de habilidades, no comandos de terminal. Si no aparecen en la sesión, leerlas por su ruta.
- `.dsh/skills/` se conserva como integración anterior; la integración predeterminada es Codex. `init-options.json` registra la inicialización original, no el agente activo.
- El plan técnico fue aprobado el 2026-11-14. Paso autorizado: ejecutar preparación y fundamentos de tasks.md; marcar solo tareas realmente validadas. La discrepancia de exportación inválida está resuelta: bloquear la exportación. No cambiar decisiones de producto sin consultar al usuario.
- Comunicar en español. Mantener separados requisitos funcionales y decisiones del futuro plan técnico.
