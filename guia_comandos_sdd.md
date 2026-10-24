# Guía de comandos — Spec-Driven Development (SDD)

**Proyecto de clase:** PATRONAJE (`patronaje`)

> Esta guía se actualizará clase a clase con los comandos que vayamos utilizando.
>
> **Agente de IA:** DeepSeek (DeepSeek Harness) actúa como el agente encargado de crear el proyecto y sus especificaciones, en reemplazo de GitHub Copilot.

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

```bash
specify init patronaje
```

> El agente de IA que crea el proyecto, la constitución y las especificaciones es **DeepSeek**, no GitHub Copilot. No se usa la integración `--integration copilot`.

### 5. Ingresar al directorio del proyecto

```bash
cd patronaje
```

Abrir esta carpeta en **Visual Studio Code** y trabajar con **DeepSeek** como agente para los siguientes pasos.

### 6. Crear la constitución del proyecto

**Instrucción al agente DeepSeek:**

```text
Crea la constitución del proyecto PATRONAJE siguiendo la plantilla.
Define las reglas generales, las tecnologías, las restricciones y los
principios que deben respetarse durante el desarrollo.
```

### 7. Crear la especificación funcional

**Instrucción al agente DeepSeek:**

```text
Crea la especificación funcional (spec.md) del proyecto PATRONAJE.
Describe qué debe hacer el sistema: funcionalidades, reglas de negocio
y límites del alcance.
```

---

## Próximas clases

*Espacio reservado para agregar nuevos comandos y actividades.*
