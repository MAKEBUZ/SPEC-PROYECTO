# PATRONAJE

PATRONAJE es un sistema de patronaje digital dirigido a patronistas, diseñadores de moda, talleres de confección y estudiantes.

Permite crear y editar patrones, guardarlos como documentos editables, preparar su impresión a escala real y publicar versiones para consultarlas y descargarlas desde otros dispositivos.

## Organización del repositorio

La rama `main` sirve como presentación general del proyecto. El código y la documentación se mantienen separados:

| Rama | Contenido |
|---|---|
| [`patronaje`](https://github.com/MAKEBUZ/SPEC-PROYECTO/tree/patronaje) | Código fuente, pruebas y herramientas de ejecución. |
| [`constitucion`](https://github.com/MAKEBUZ/SPEC-PROYECTO/tree/constitucion) | Constitución, especificaciones, planificación y documentación del proyecto. |
| `main` | Contexto general y enlaces a las ramas principales. |

Las ramas `codex/*` son ramas temporales de revisión. Sus cambios se incorporan mediante pull requests; no sustituyen las ramas principales.

## Aplicaciones

### CAD de escritorio

Aplicación descargable para Windows 11 de 64 bits, arquitectura x64.

Incluye:

- Creación de contornos mediante puntos, líneas y curvas Bézier.
- Edición de piezas, medidas numéricas y transformaciones.
- Deshacer y rehacer.
- Márgenes de costura y marcas de las piezas.
- Guardado, apertura y recuperación de documentos `.patron`.
- Preparaciones de impresión independientes del dibujo original.
- Exportación PDF en A4, Carta y gran formato.
- Publicación manual de versiones en la cuenta.

### Portal web

Permite gestionar la cuenta y consultar los recursos publicados:

- Registro, verificación de correo e inicio de sesión.
- Recuperación de contraseña y opciones de seguridad.
- Consulta de proyectos, patrones, versiones y vistas previas.
- Descarga de documentos editables y PDF.
- Gestión de recursos propios y papelera.
- Interfaz adaptable y modo claro u oscuro.

### Aplicación móvil

Se plantea como una PWA instalable para Android y iPhone, sin distribución inicial en tiendas.

Comparte las funciones de consulta y gestión del portal. La edición geométrica pertenece al CAD de escritorio.

La instalación y aceptación en teléfonos físicos siguen pendientes de validación.

## Flujo principal

**Crear patrón → guardar → preparar impresión → generar PDF → publicar → consultar y descargar.**

Guardar un documento en el equipo no lo publica automáticamente.

La exportación para producción exige que las piezas seleccionadas y su preparación cumplan las validaciones. Un borrador con errores puede conservarse para corregirlo después.

## Alcance y módulos aplazados

La primera entrega se centra en el trabajo individual y la gestión de recursos propios.

Quedan aplazados:

- Escalado y gestión de variantes de talla.
- Colaboración, invitaciones y permisos compartidos.
- Publicación automática.
- Notificaciones de colaboración.
- Importación de formatos externos.
- Aplicaciones de escritorio para macOS y Linux.

Las decisiones documentadas para esos módulos se conservan, pero no forman parte de la entrega actual.

## Tecnologías

| Tecnología | Función |
|---|---|
| TypeScript | Código de aplicación, contratos y núcleo geométrico. |
| Electron | Aplicación de escritorio. |
| React | Interfaces de usuario. |
| Three.js | Representación e interacción con el tablero CAD. |
| Next.js | Portal web y PWA. |
| NestJS | API compartida. |
| PostgreSQL | Persistencia de cuentas, proyectos, versiones y operaciones. |
| C++ | Adaptador nativo de persistencia para Windows. |
| AWS | Alojamiento del piloto de pruebas, archivos y correo. |

El modelo geométrico está separado de su representación gráfica: Three.js no es la fuente de verdad del documento.

## Estructura del código

La rama `patronaje` organiza el proyecto en:

- `apps/desktop`: aplicación CAD.
- `apps/web`: portal y PWA.
- `apps/api`: API compartida.
- `packages`: componentes, contratos y motores compartidos.
- `tests`: pruebas automatizadas.
- `tools`: preparación de recursos y herramientas de validación.
- `infra`: configuración operativa del piloto.

## Estado del proyecto

Corte de referencia: **17 de noviembre de 2026**.

- Versión del CAD registrada: **0.1.7**.
- **90 de 98 tareas** marcadas como completas.
- Implementación disponible y en validación.
- La entrega todavía no tiene aceptación integral.

Existen ejecuciones aprobadas de TypeScript, pruebas unitarias, geometría, recuperación, impresión, integración PostgreSQL y recorridos E2E.

Entre las ejecuciones documentadas figuran:

- 700 pruebas locales, incluidas 342 unitarias.
- 162 pruebas de integración PostgreSQL.
- 15 pruebas E2E en la revisión del portal.

Estos resultados corresponden a ejecuciones con alcances diferentes y no deben sumarse como una única suite ni interpretarse como aceptación de todos los requisitos.

### Validaciones pendientes

- Instalación y uso de la PWA en teléfonos reales.
- Guardado y recuperación con USB y fallos físicos del medio.
- Impresión y medición física de los PDF.
- Instalación y desinstalación en un equipo limpio.
- Matriz completa de navegadores.
- Rendimiento en el equipo de referencia y equipos inferiores.
- Acreditación final de cada requisito incluido.

También se registró un bloqueo por timeout al descargar Electron durante una comprobación de instalación limpia. No se presenta esa instalación como completada.

## Cómo ejecutar el proyecto

La rama `main` no contiene la entrega ejecutable.

Para obtener el código, consultar la rama:

➡️ [Código de PATRONAJE](https://github.com/MAKEBUZ/SPEC-PROYECTO/tree/patronaje)

Las instrucciones de instalación y demo están preparadas en el [PR #3](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/3). Mientras no esté fusionado, deben consultarse en su rama de revisión.

La demo local utiliza PostgreSQL efímero y correo capturado. No requiere utilizar AWS ni enviar correos reales.

## Documentación y metodología

El desarrollo utiliza Specification-Driven Development —SDD— con Spec Kit.

Los documentos principales son:

- [Constitución](https://github.com/MAKEBUZ/SPEC-PROYECTO/blob/constitucion/.specify/memory/constitution.md).
- [Especificación](https://github.com/MAKEBUZ/SPEC-PROYECTO/blob/constitucion/specs/001-patronaje/spec.md).
- [Plan técnico](https://github.com/MAKEBUZ/SPEC-PROYECTO/blob/constitucion/specs/001-patronaje/plan.md).
- [Tareas](https://github.com/MAKEBUZ/SPEC-PROYECTO/blob/constitucion/specs/001-patronaje/tasks.md).

La consolidación de informes y matriz de aceptación se encuentra en el [PR #2](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/2), dirigido a `constitucion`.

Una especificación aprobada define el alcance acordado; no significa que el software haya superado todas sus comprobaciones de aceptación.

## Revisiones de referencia

| PR | Destino | Contenido |
|---|---|---|
| [#2](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/2) | `constitucion` | Documentación y evidencias, sin código ejecutable. |
| [#3](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/3) | `patronaje` | README, guías y herramientas de demo local. |
| [#4](https://github.com/MAKEBUZ/SPEC-PROYECTO/pull/4) | `patronaje` | Rediseño de la cuenta del portal y modo oscuro. |

El PR #1 fue cerrado sin fusionar y sustituido por revisiones separadas.

El estado actualizado de cada revisión debe consultarse directamente en GitHub. Que un cambio esté publicado en el piloto no implica que su PR esté fusionado.

## Autoría

**Diego Alejandro Ocampo Madroñero / MAKEBUZ**

Responsable del proyecto, las decisiones de producto y las comprobaciones manuales comunicadas durante el desarrollo.

El proyecto contó inicialmente con asistencia de DeepSeek y posteriormente con Codex para implementación, pruebas y documentación. El historial y los informes distinguen la asistencia automatizada de las verificaciones realizadas por el usuario.
