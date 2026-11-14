<!-- Sync Impact Report: 1.0.1 -> 1.0.2. Aclaración del principio Eliminación: separar validación local y autorización remota conforme a decisión del usuario. Sin secciones añadidas o eliminadas; sin nuevos placeholders pendientes. Sincronizar FR-017 y aceptación en spec.md. Retirar este comentario antes de commit. -->
# Constitución del Proyecto: PATRONAJE

**Estado:** adoptada.
**Agente de IA encargado:** Codex.

> Esta constitución establece las reglas transversales que orientan todas las decisiones del proyecto y el trabajo del agente de IA. Las características concretas del producto se detallan en las especificaciones (`specs/*/spec.md`). Si una regla cambia, se actualiza primero esta constitución y luego se revisan las especificaciones afectadas.

## 1. Naturaleza del Proyecto

PATRONAJE es un sistema CAD de patronaje digital con gestión de archivos, destinado a patronistas, diseñadores de moda, talleres de confección, estudiantes y equipos de producción textil. Su propósito es permitir crear, editar, escalar y preparar patrones digitales para producción, y consultar, descargar y compartir los patrones y sus archivos asociados desde otros dispositivos, sin depender de software propietario costoso ni de papel.

El producto se organiza en tres aplicaciones con responsabilidades definidas:

- **Aplicación de escritorio — CAD:** crear, abrir, editar, escalar y preparar patrones digitales para producción; generar los archivos de salida y de impresión. Es el entorno de trabajo de patronaje.
- **Aplicación web:** revisar los archivos disponibles en la cuenta, consultar sus vistas previas y versiones, gestionar la cuenta y descargar archivos para impresión u otros usos autorizados.
- **Aplicación móvil:** revisar archivos, gestionar la cuenta y descargar archivos desde el teléfono. Comparte el alcance funcional de consulta y gestión de la web, adaptado a la interacción móvil.

La edición de geometría y las herramientas de patronaje pertenecen al CAD de escritorio. La web y la móvil permiten consultar y gestionar los archivos, sin modificar la geometría del patrón. La gestión de cuenta incluye perfil, acceso y seguridad; las funciones adicionales deberán describirse en sus especificaciones.

El flujo principal consiste en trabajar un patrón en el CAD, guardar o publicar una versión en la cuenta y acceder a esa versión y sus archivos de impresión desde la web o la móvil. Guardar en el equipo y publicar en la cuenta son estados distintos que deben comunicarse claramente. El mecanismo de transferencia, el almacenamiento local y el alcance del trabajo sin conexión se definirán en el plan técnico.

## 2. Stack Tecnológico (Reglas de Implementación)

- **Aplicación web / UI:** Next.js con React y Tailwind CSS para la consulta de archivos y la gestión de cuenta. La interfaz debe adaptarse al tamaño de pantalla.
- **Aplicación de escritorio / UI:** interfaz del CAD basada en React y Tailwind CSS, con Three.js para la representación gráfica. El runtime y el empaquetado de escritorio se elegirán en el plan técnico; Next.js queda asignado a la aplicación web y no determina cómo se ejecutará el CAD.
- **Aplicación móvil / UI:** tecnología pendiente de definición. Se debe decidir si se distribuirá como aplicación nativa, multiplataforma o PWA antes de implementarla. Una web adaptable no se considera por sí sola la entrega de la aplicación móvil.
- **Backend compartido:** NestJS sobre Node.js. El backend centraliza cuentas, autenticación, autorización, proyectos, versiones y archivos mediante una API HTTP consumida por las tres aplicaciones. Las operaciones geométricas interactivas corresponden al núcleo del CAD.
- **Base de datos:** PostgreSQL para usuarios, permisos, proyectos, metadatos y versiones de patrones. Los cambios que afecten varias entidades relacionadas deben ejecutarse mediante transacciones. Todo cambio de esquema requiere una migración versionada. La biblioteca de acceso a datos se elegirá en el plan técnico, antes de implementar la persistencia.
- **Almacenamiento de archivos:** los archivos y exportaciones se guardan en almacenamiento de archivos; PostgreSQL conserva sus referencias y metadatos. El proveedor se definirá en el plan técnico. Los archivos privados no deben exponerse mediante rutas públicas permanentes.
- **Lenguaje:** TypeScript con comprobación estricta en el código de React, Next.js, NestJS y el núcleo geométrico. Los contratos de datos deben estar tipados y las entradas externas deben validarse en ejecución. Cualquier lenguaje adicional necesario para el runtime de escritorio o la aplicación móvil deberá documentarse al elegir esas tecnologías.
- **Motor gráfico:** Three.js para visualizar e interactuar con la geometría dentro del CAD de escritorio. El modelo geométrico del patrón debe mantenerse separado de la escena y de los objetos de renderizado; la escena no es la fuente de verdad del documento. El uso de Three.js no implica incluir simulación de telas o diseño 3D en el alcance inicial. Las vistas previas de web y móvil no deben requerir cargar el editor CAD completo.
- **Integración de escritorio:** especificar acceso a archivos locales, exportación, impresión e intercambio de archivos con la cuenta antes de implementar esas operaciones. Definir los sistemas operativos admitidos y el comportamiento ante pérdida de conexión en el plan técnico.
- **Dependencias:** incorporar únicamente dependencias necesarias para una especificación aprobada, con versiones registradas en el archivo de bloqueo del gestor de paquetes. No introducir otro framework, motor gráfico o base de datos sin actualizar esta constitución.

## 3. Principios y Reglas de Dominio

Estas reglas son obligatorias:

- **Unidades y escala:** almacenar la geometría del patrón en milímetros. Cambiar la unidad de visualización no debe modificar las dimensiones reales. El zoom y el tamaño de pantalla no deben alterar las medidas del patrón.
- **Integridad geométrica:** rechazar coordenadas no finitas y medidas que incumplan las restricciones de la operación. Las piezas destinadas a producción deben tener un contorno cerrado y válido antes de exportarse; la edición puede conservar contornos abiertos como borradores. Las tolerancias geométricas y los criterios de validez deben fijarse en cada especificación antes de implementar operaciones o exportaciones.
- **Escalado de tallas:** aplicar únicamente reglas de escalado definidas para el patrón y la talla solicitada. Una operación de escalado no puede sobrescribir silenciosamente el patrón base.
- **Márgenes de costura:** distinguir el contorno base del margen de costura. El margen debe ser no negativo, expresarse en la unidad interna y conservarse como información explícita cuando la funcionalidad esté incluida en la especificación.
- **Guardado y versiones:** validar la estructura del documento antes de guardar. Un guardado fallido debe conservar la última versión válida y permitir recuperar los cambios locales aún no guardados. Cada versión debe identificar autor y fecha; las operaciones de versionado deben ser atómicas.
- **Propiedad y permisos:** cada proyecto y archivo almacenado en la cuenta debe tener un propietario. Toda lectura, modificación, descarga o eliminación de recursos privados del servidor requiere autenticación y autorización verificadas en el backend. Ocultar controles en la interfaz no sustituye esta validación. El acceso a documentos locales del CAD se definirá por separado y no debe confundirse con el acceso a recursos del servidor.
- **Cuenta común:** las tres aplicaciones utilizan la misma identidad de usuario y las mismas reglas de permisos para acceder a los recursos de la cuenta. Los cambios de perfil y seguridad deben reflejarse de forma coherente en los clientes. Las acciones sensibles requieren las verificaciones definidas en la especificación de cuenta.
- **Separación entre edición y consulta:** la web y la móvil pueden gestionar metadatos y archivos según los permisos, pero no ofrecen operaciones de edición geométrica. Las modificaciones del patrón se realizan desde el CAD y generan la versión correspondiente.
- **Disponibilidad entre dispositivos:** un archivo solo se presenta como disponible en la cuenta cuando su transferencia y registro se han completado. Un fallo de publicación no debe eliminar el documento local ni sustituir la última versión remota válida. Identificar la versión consultada o descargada para evitar confundirla con cambios locales aún no publicados.
- **Compartición:** solo el propietario o un usuario expresamente autorizado puede compartir recursos o cambiar sus permisos. Compartir no debe conceder edición por defecto. Los mecanismos concretos de compartición se definen en las especificaciones.
- **Archivos:** validar tamaño, formato admitido y contenido antes de aceptar una carga. Los formatos y límites se fijarán en la especificación correspondiente. No confiar únicamente en la extensión o el tipo declarado por el cliente.
- **Exportación para producción:** indicar unidad y escala de salida. No presentar una exportación como apta para producción si existen errores geométricos que impiden obtener medidas correctas. Los formatos de intercambio e impresión se incorporan únicamente cuando estén especificados.
- **Descargas e impresión:** distinguir el archivo editable del patrón, la vista previa y el archivo preparado para impresión. Cada archivo de impresión debe estar asociado a la versión del patrón que lo originó e indicar escala y dimensiones de salida. Descargarlo desde la web o la móvil debe conservar su contenido y medidas. Las instrucciones de impresión deben indicar cómo conservar la escala prevista; la vista previa no garantiza una impresión a tamaño real. La impresión directa desde cada aplicación solo se implementará si queda especificada.
- **Conflictos de edición:** no sobrescribir cambios de otro usuario sin advertencia. Una actualización debe verificar la versión que se está modificando y rechazar conflictos para que el usuario pueda resolverlos. La edición colaborativa en tiempo real requiere una especificación propia.
- **Eliminación:** las acciones destructivas requieren una confirmación clara en la interfaz. Las exclusivamente locales requieren validación local, sin conexión, sesión remota ni autorización del backend. Las que afectan a recursos de la cuenta requieren sesión válida y autorización verificadas en el servidor, además de la confirmación. Una acción local no autoriza ni ejecuta por sí sola cambios destructivos remotos. La eliminación de metadatos y archivos debe mantener la consistencia; el comportamiento de recuperación y retención se definirá antes de implementar esta función.

## 4. Estructura y Estilo de Código

- **Estructura:** organizar el repositorio en `apps/desktop` para el CAD, `apps/web` para la aplicación Next.js, `apps/mobile` para la aplicación móvil si requiere código propio, `apps/api` para NestJS, `packages/geometry` para el modelo y las operaciones geométricas, y `packages/contracts` para contratos compartidos. Si se elige una PWA basada en la aplicación web, documentar su ubicación en `apps/web`. Mantener las especificaciones en `specs/`, diferenciando CAD de escritorio, cuenta, biblioteca de archivos e impresión.
- **Separación de responsabilidades:** los componentes de interfaz presentan información y gestionan interacción; los servicios del backend aplican las reglas de negocio; la capa de persistencia realiza el acceso a datos. El núcleo geométrico no debe depender de React, Three.js, NestJS ni PostgreSQL.
- **Estilo:** preferir funciones pequeñas y módulos por dominio, como usuarios, proyectos, patrones y archivos. Evitar duplicar reglas de negocio entre clientes. Compartir contratos no sustituye la validación del backend.
- **Nomenclatura:** utilizar inglés en identificadores de código; `camelCase` para variables y funciones, `PascalCase` para componentes, clases y tipos, y `UPPER_SNAKE_CASE` para constantes globales. Usar `kebab-case` para archivos y carpetas, respetando los nombres especiales exigidos por cada framework. La interfaz inicial y los mensajes al usuario estarán en español.
- **Calidad:** aplicar formato y análisis estático uniformes. Las operaciones geométricas deben contar con pruebas de medidas, unidades y casos límite; los permisos y el versionado requieren pruebas de integración. Todo cambio debe superar las comprobaciones pertinentes antes de considerarse terminado.
- **Configuración:** utilizar variables de entorno para configuración y secretos. No guardar credenciales en el repositorio ni enviar secretos del backend al cliente.

## 5. Manejo de Errores y Validaciones

- **UI:** mostrar mensajes en español que expliquen el problema y cómo corregirlo. Identificar los campos inválidos y conservar el trabajo del usuario cuando falle una operación. Mostrar el estado de guardado y avisar si existen cambios sin guardar antes de abandonar el editor.
- **Transferencias y descargas:** distinguir entre guardado local, publicación en curso, publicación completada y error de transferencia. En web y móvil mostrar estados de carga, archivo no disponible y descarga fallida con una acción de recuperación. No presentar una descarga incompleta como lista para imprimir.
- **Editor CAD:** validar entradas numéricas y restricciones geométricas antes de aplicar una operación. Una operación inválida no debe dejar el documento parcialmente modificado. Diferenciar advertencias que permiten continuar de errores que impiden guardar o exportar.
- **Backend:** validar cuerpo, parámetros y consultas; rechazar campos y valores no permitidos. Responder con `400` para entradas inválidas, `401` cuando falte autenticación, `403` cuando falten permisos, `404` para recursos no disponibles, `409` para conflictos de versión o integridad y `413` para archivos demasiado grandes. Los errores inesperados deben responder con `500` y un mensaje genérico.
- **Contrato de errores:** responder con un código estable, un mensaje comprensible y, cuando corresponda, detalles de validación por campo y un identificador de seguimiento. No exponer trazas, consultas SQL, rutas internas, credenciales ni datos privados.
- **Registro:** registrar los detalles técnicos en el servidor para diagnóstico, evitando secretos y contenido sensible de los archivos. Relacionar el registro con el identificador de seguimiento devuelto al cliente.
- **Fallos y reintentos:** no informar éxito hasta confirmar la persistencia. Evitar que un reintento duplique operaciones; definir el mecanismo correspondiente en la especificación de cargas, guardados o procesos que lo requieran.

## 6. Comportamiento del Agente de IA (Reglas SDD)

El agente de IA encargado del proyecto es **Codex** y debe cumplir estas reglas:

- **Cero código sombra:** implementar únicamente lo definido en las especificaciones aprobadas (`spec.md`). No añadir funcionalidades, dependencias ni complejidad por anticipación.
- **Fuente de la verdad:** si una solicitud contradice esta constitución o aparece una inconsistencia entre reglas y especificaciones, explicar el conflicto y resolver la actualización del documento correspondiente antes de implementar el cambio afectado.
- **Decisiones pendientes:** no presentar como aprobadas las decisiones aún abiertas. El nombre comercial, el runtime y los sistemas operativos de escritorio, la tecnología y distribución móvil, la biblioteca de persistencia, el proveedor de archivos, los formatos de importación e impresión, la transferencia entre el CAD y la cuenta y el funcionamiento sin conexión deben concretarse en las especificaciones o planes pertinentes.
- **Especificaciones verificables:** cada funcionalidad debe indicar usuarios, alcance, reglas, criterios de aceptación y casos de error. Separar el comportamiento requerido en `spec.md` de las decisiones de implementación en `plan.md`.
- **Trazabilidad:** relacionar las tareas y cambios con la especificación que los autoriza. Actualizar la documentación cuando cambien los contratos o las reglas aprobadas.
- **Validación del trabajo:** ejecutar las comprobaciones aplicables y comunicar qué se verificó y qué permanece pendiente. No declarar completada una funcionalidad con criterios de aceptación incumplidos.

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica del proyecto. Toda especificación, plan o tarea debe respetarla.
- Toda enmienda requiere documentar el cambio, revisar las especificaciones afectadas y dejar constancia de la fecha.
- Las decisiones de implementación no pueden contradecir los principios ni las reglas de dominio aquí fijados.
- Las decisiones pendientes deben resolverse antes de implementar las funcionalidades que dependan de ellas.

---

**Versión**: 1.0.2 | **Ratificada**: 2026-10-23 | **Última enmienda**: 2026-11-14

## Registro de enmiendas

- 2026-11-13 (1.0.1): se sustituye DeepSeek Harness por Codex como agente encargado. Se conservan todos los principios, reglas y decisiones pendientes. Se revisó specs/001-patronaje/spec.md: no requiere cambios funcionales por esta migración y conserva su estado Draft.

- 2026-11-14 (1.0.2): aclaración aprobada del ámbito de las acciones destructivas: confirmación y validación local para acciones exclusivamente locales; confirmación, sesión válida y autorización del servidor para recursos de la cuenta. Se preserva el trabajo sin conexión y se sincroniza FR-017 de la especificación.
