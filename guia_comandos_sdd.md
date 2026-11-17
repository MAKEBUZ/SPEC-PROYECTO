# Guía SDD — PATRONAJE con Codex

## Estado actual

Rama: `patronaje`. Constitución: `.specify/memory/constitution.md` (1.0.1).
Especificación: `specs/001-patronaje/spec.md` (Draft). No hay código de aplicación, plan ni tareas.

## Continuar aquí

Pedir a Codex: «Lee la constitución y aplica speckit-clarify a la especificación existente, sin empezar código».
Las habilidades están en `.agents/skills/` y pueden invocarse como `$speckit-clarify`, `$speckit-checklist` o `$speckit-plan` cuando estén disponibles en la sesión. Si no aparecen, Codex puede leer directamente el SKILL.md correspondiente. Una sesión nueva puede ser necesaria para descubrir habilidades añadidas.
No ejecutar specify/init ni speckit-specify para retomar este borrador: ya existe.

Antes de ejecutar scripts sobre la spec actual, usar en la misma sesión PowerShell:

```powershell
$env:SPECIFY_FEATURE = '001-patronaje'
$env:SPECIFY_FEATURE_DIRECTORY = Join-Path (Get-Location) 'specs/001-patronaje'
.specify/scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly
```

El flujo posterior es aclarar requisitos, revisar la spec y elaborar plan y tareas cuando corresponda. La implementación queda fuera del alcance actual.

## Migración del 2026-11-13

Adaptación local de las diez habilidades existentes de Spec Kit 1.2.3.dev0 a `.agents/skills/`, cambiando las referencias de invocación a `$speckit-*`. Codex es la integración predeterminada en `.specify/integration.json`; el manifiesto codex registra archivos y hashes. No se ejecutó el instalador ni se actualizó Spec Kit.
Se conserva la integración dsh anterior y `init-options.json` como registro histórico de inicialización. La constitución solo cambia de agente y registra la enmienda; la spec, las plantillas y los scripts se conservan.

Referencia de habilidades Codex: https://developers.openai.com/codex/skills
