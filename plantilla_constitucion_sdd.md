# Plantilla de Constitución del Proyecto (SDD)

> **Propósito:** definir las reglas y restricciones que deben orientar todas las decisiones del proyecto y el trabajo del agente de IA. Completa los campos entre `[corchetes]`, reemplaza los ejemplos por decisiones de tu proyecto y elimina las instrucciones de apoyo antes de adoptar la constitución definitiva.
>
> **Importante:** la constitución establece reglas transversales; las características concretas del producto se detallan después en las especificaciones (`spec.md`). Si una regla cambia, actualiza primero la constitución y revisa las especificaciones afectadas.

# Constitución del Proyecto: [Nombre del proyecto]

## 1. Naturaleza del Proyecto

Este proyecto es una aplicación de tipo sistema CAD de patronaje digital con gestión de archivos, compuesta por un cliente de escritorio y un cliente web/móvil, destinada a patronistas, diseñadores de moda, talleres de confección, estudiantes y equipos de producción textil. Su propósito es permitir crear, editar, escalar y preparar patrones digitales para producción en el escritorio, y consultar, descargar y compartir esos patrones y archivos asociados desde cualquier dispositivo, sin depender de software propietario costoso ni de papel.

## 2. Stack Tecnológico (Reglas de Implementación)

- **Frontend / UI:** [Framework o tecnología y herramienta de estilos].
- **Backend:** [Lenguaje, entorno de ejecución y framework].
- **Base de Datos:** [Motor de base de datos, modo de almacenamiento y restricciones sobre ORM o acceso a datos].
- **Lenguaje:** [Lenguaje o lenguajes permitidos y dónde se usarán].
- **Motor Gráfico:**

## 3. Reglas de Dominio y Lógica de Negocio

**Instrucción:** registra las reglas que el sistema **siempre** debe cumplir. Prioriza restricciones del negocio y condiciones que evitan errores críticos. Redáctalas como obligaciones verificables; no como deseos generales.

Estas reglas son obligatorias. El agente de IA debe respetarlas estrictamente:

- **[Regla de dominio 1]:** [Qué se permite o prohíbe y bajo qué condiciones].
- **[Regla de dominio 2]:** [Restricción relacionada con estados, cantidades, fechas, roles, etc.].
- **[Regla crítica de integridad]:** [Qué validación debe cumplirse antes de guardar o modificar información].
- **[Regla de acceso]:** [Qué acciones requieren autenticación o autorización, si aplica].

## 4. Estructura y Estilo de Código

**Instrucción:** establece cómo se organizará y escribirá el código para mantener consistencia. Indica el nivel de complejidad adecuado al alcance del proyecto.

- **Estructura:** [Carpetas principales y organización esperada; por ejemplo, `/frontend`, `/backend` y `/db`].
- **Estilo:** [Preferencias sobre funciones, componentes, clases, separación de responsabilidades y simplicidad].
- **Nomenclatura:** [Convenciones para variables, funciones, componentes, interfaces, tipos y archivos].

## 5. Manejo de Errores y Validaciones

**Instrucción:** define cómo se validan los datos y cómo deben comunicarse los errores desde la interfaz y el backend. Evita exponer información técnica sensible al usuario final.

- **UI:** [Cómo presentar mensajes claros y útiles; qué detalles técnicos no se deben mostrar].
- **Backend:** [Cómo validar entradas, responder ante errores y utilizar códigos HTTP adecuados; por ejemplo, 400, 401, 403, 404 o 409 según corresponda].

## 6. Comportamiento del Agente de IA (Reglas SDD)

**Instrucción:** especifica los límites del agente para que implemente solamente lo acordado, detecte inconsistencias y no tome decisiones de alcance sin autorización.

- **Cero Código Sombra (Shadow Code):** Implementar únicamente lo definido en las especificaciones aprobadas (`spec.md`). No añadir funcionalidades, dependencias ni complejidad «por si acaso».
- **Fuente de la Verdad:** Si una solicitud contradice esta constitución o aparece una inconsistencia entre reglas y especificaciones, detener la implementación, explicar el conflicto y solicitar la actualización del documento correspondiente antes de modificar el código.

---

## Lista de verificación antes de aprobarla

- [ ] El propósito y los usuarios del proyecto están claros.
- [ ] El stack tecnológico está definido sin ambigüedades.
- [ ] Las reglas críticas de negocio son verificables.
- [ ] La estructura y las convenciones de código están especificadas.
- [ ] Se describe cómo validar datos y manejar errores.
- [ ] El agente de IA tiene límites claros y no puede ampliar el alcance sin autorización.
- [ ] Se eliminaron los textos de instrucción y los marcadores `[pendientes]` del documento final.

> **Uso con Spec Kit y Copilot:** utiliza la versión completada de esta plantilla como referencia al ejecutar `/speckit.constitution` en Copilot Chat. El comando gestiona la constitución del proyecto; revisa el resultado generado antes de aprobarlo. Esta plantilla es material didáctico, no reemplaza automáticamente el archivo de constitución creado por Spec Kit.
