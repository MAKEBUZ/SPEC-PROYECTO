# Guía de comandos — Spec-Driven Development (SDD)

**Proyecto de clase:** Gestión Documental (`document-management`)

> Esta guía se actualizará clase a clase con los comandos que vayamos utilizando.

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

### 4. Crear el proyecto con GitHub Copilot

```bash
specify init document-management --integration copilot
```

### 5. Ingresar al directorio del proyecto

```bash
cd document-management
```

Abrir esta carpeta en **Visual Studio Code** y utilizar **GitHub Copilot Chat (modo Agent)** para los siguientes comandos.

### 6. Crear la constitución del proyecto

**En Copilot Chat:**

```text
/speckit.constitution
```

Define las reglas generales, las tecnologías, las restricciones y los principios que deben respetarse durante el desarrollo.

### 7. Crear la especificación funcional

**En Copilot Chat:**

```text
/speckit.specify
```

Describe qué debe hacer el sistema: funcionalidades, reglas de negocio y límites del alcance.

---

## Próximas clases

*Espacio reservado para agregar nuevos comandos y actividades.*
