# Guía de comandos — Spec-Driven Development (SDD)

**Proyecto de clase:** PATRONAJE (`patronaje`)

> Esta guía se actualizará clase a clase con los comandos que vayamos utilizando.
>
> **Agente de IA:** DeepSeek Harness (integración `dsh`) actúa como el agente encargado de crear el proyecto y sus especificaciones, en reemplazo de GitHub Copilot.

## Clase 1. Instalación, inicialización y especificaciones

### 1. Instalar o actualizar Spec Kit

Ejecutar en la **terminal**:

```bash
uv tool install specify-cli --force --from git+https://github.com/github/spec-kit.git
```

### 2. Verificar la versión instalada

```bash
specify version
```

### 3. Consultar las opciones de inicialización

```bash
specify init --help
```

### 4. Crear el proyecto con DeepSeek como agente

Sobre la rama `patronaje`, en la raíz del repositorio:

```bash
specify init --here --integration dsh --ignore-agent-tools --non-interactive --force
```

- `--integration dsh` selecciona **DeepSeek Harness** (no Copilot).
- `--ignore-agent-tools` omite la verificación del ejecutable `dsh` en el PATH; ya trabajamos dentro de DeepSeek Harness.
- `--here` inicializa en la raíz actual en lugar de crear una subcarpeta.

> Alternativa interactiva: `specify init patronaje` y elegir `dsh (DeepSeek Harness)` en el menú.

### 5. Estructura resultante

```
.specify/                  Configuración de Spec Kit
  memory/constitution.md   Constitución del proyecto
  templates/               Plantillas de spec, plan, tasks
  scripts/powershell/      Scripts de apoyo
  workflows/               Flujo speckit
.dsh/skills/speckit-*/SKILL.md   Comandos disponibles en DeepSeek Harness
specs/001-patronaje/spec.md      Especificación funcional
```

### 6. Crear la constitución del proyecto

**En DeepSeek Harness:**

```text
/speckit-constitution
```

Define las reglas generales, las tecnologías, las restricciones y los principios que deben respetarse durante el desarrollo.

### 7. Crear la especificación funcional

**En DeepSeek Harness:**

```text
/speckit-specify
```

Describe qué debe hacer el sistema: funcionalidades, reglas de negocio y límites del alcance.

---

## Próximas clases

*Espacio reservado para agregar nuevos comandos y actividades.*
