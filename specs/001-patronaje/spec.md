# Especificación funcional — PATRONAJE

> **Feature:** 001 — Núcleo del sistema PATRONAJE (cuentas, proyectos, CAD de patronaje, versiones, biblioteca de archivos y exportación).
>
> **Estado:** propuesta para revisión.
>
> **Agente de IA:** DeepSeek.

## 1. Descripción general

PATRONAJE permite crear, editar, escalar y preparar patrones digitales para producción en una aplicación de escritorio (CAD), y consultar, descargar y compartir esos patrones y sus archivos desde una aplicación web y una móvil. Todas las aplicaciones comparten una misma cuenta de usuario y un backend que centraliza autenticación, autorización, proyectos, versiones y archivos.

Esta especificación define el **alcance inicial** del sistema. Las funcionalidades que excedan este alcance (por ejemplo, edición colaborativa en tiempo real, simulación de telas o diseño 3D) quedan fuera y requieren una especificación propia.

## 2. Usuarios y roles

| Rol | Descripción |
| --- | --- |
| **Visitante** | Persona sin sesión iniciada. Solo accede a las pantallas públicas de ingreso y registro. |
| **Usuario autenticado** | Persona con cuenta. Puede crear y administrar sus proyectos, patrones y archivos según sus permisos. |
| **Propietario** | Usuario dueño de un proyecto o archivo. Puede editar, publicar, compartir, eliminar y gestionar permisos sobre sus recursos. |
| **Editor autorizado** | Usuario al que el propietario otorgó permisos de modificación sobre un recurso. |

La gestión de roles administrativos (por ejemplo, administradores de plataforma) queda fuera de este alcance.

## 3. Alcance

### 3.1 Incluido

- Registro, inicio de sesión, cierre de sesión y gestión básica del perfil de cuenta.
- Creación, listado y gestión de proyectos.
- Creación, edición y guardado de patrones en el CAD de escritorio.
- Escalado de tallas de un patrón.
- Guardado local y publicación de versiones en la cuenta.
- Biblioteca de archivos con vista previa, consulta de versiones y descarga desde web y móvil.
- Exportación del patrón preparado para producción.
- Compartición y gestión de permisos básica.
- Eliminación de proyectos y archivos con confirmación.

### 3.2 Excluido (fuera de alcance)

- Edición geométrica desde web o móvil.
- Edición colaborativa en tiempo real.
- Simulación de telas o diseño 3D.
- Impresión directa desde la aplicación (solo se entregan archivos preparados para impresión con instrucciones de escala).
- Integración con pasarelas de pago o planes comerciales.
- Módulo administrativo de plataforma.

## 4. Requisitos funcionales

### FR-1. Cuenta y autenticación

- **FR-1.1** Un visitante puede registrarse proporcionando correo y contraseña; la contraseña se almacena de forma segura (nunca en texto plano).
- **FR-1.2** Un usuario puede iniciar sesión, obtener una sesión autenticada y cerrar sesión desde cualquiera de las tres aplicaciones.
- **FR-1.3** La misma identidad de usuario y las mismas reglas de permisos se aplican en el CAD, la web y la móvil.
- **FR-1.4** Un usuario puede ver y actualizar su perfil (nombre, correo de contacto) y cambiar su contraseña.
- **FR-1.5** Las acciones sensibles (cambio de contraseña, cambio de correo, eliminación de cuenta) requieren reautenticación.

### FR-2. Proyectos

- **FR-2.1** Un usuario autenticado puede crear un proyecto con nombre y descripción opcional.
- **FR-2.2** El usuario puede listar sus proyectos y los que le hayan sido compartidos.
- **FR-2.3** El propietario puede renombrar, editar la descripción y eliminar un proyecto.
- **FR-2.4** Cada proyecto tiene exactamente un propietario.

### FR-3. CAD de escritorio — edición de patrones

- **FR-3.1** El CAD permite crear un patrón nuevo en un proyecto y abrir un patrón existente.
- **FR-3.2** El usuario puede dibujar y modificar contornos (líneas y curvas) del patrón en un plano de trabajo.
- **FR-3.3** El usuario puede introducir medidas y restricciones numéricas sobre el patrón.
- **FR-3.4** La geometría se almacena internamente en milímetros; el cambio de unidad de visualización no altera las medidas reales.
- **FR-3.5** El zoom y el tamaño de la ventana no modifican las dimensiones del patrón.
- **FR-3.6** El usuario puede deshacer y rehacer operaciones de edición.

### FR-4. Escalado de tallas

- **FR-4.1** El usuario puede escalar un patrón a una talla solicitada aplicando una regla de escalado definida.
- **FR-4.2** El escalado genera una nueva versión o copia y no sobrescribe silenciosamente el patrón base.
- **FR-4.3** Se informa al usuario de la regla de escalado y la talla aplicadas.

### FR-5. Guardado y versiones

- **FR-5.1** El usuario puede guardar el patrón localmente en su equipo.
- **FR-5.2** El usuario puede publicar una versión del patrón en la cuenta.
- **FR-5.3** Guardar localmente y publicar en la cuenta se muestran como estados distintos.
- **FR-5.4** Cada versión publicada registra autor y fecha, y queda asociada a su proyecto.
- **FR-5.5** Un guardado fallido conserva la última versión válida y permite recuperar cambios locales no guardados.
- **FR-5.6** Antes de guardar se valida la estructura del documento.

### FR-6. Biblioteca de archivos (web y móvil)

- **FR-6.1** La web y la móvil permiten listar los archivos y versiones disponibles en la cuenta.
- **FR-6.2** Se muestra una vista previa del patrón sin cargar el editor CAD completo.
- **FR-6.3** El usuario puede consultar el historial de versiones de un patrón.
- **FR-6.4** El usuario puede descargar un archivo autorizado (editable, vista previa o preparado para impresión).
- **FR-6.5** Cada archivo de impresión indica escala y dimensiones de salida y está asociado a la versión que lo originó.
- **FR-6.6** La web y la móvil no ofrecen operaciones de edición geométrica.

### FR-7. Exportación para producción

- **FR-7.1** El usuario puede exportar un patrón a un formato de intercambio o de impresión admitido.
- **FR-7.2** La exportación indica unidad y escala de salida.
- **FR-7.3** El sistema no presenta una exportación como apta para producción si existen errores geométricos que impiden obtener medidas correctas.
- **FR-7.4** Las piezas destinadas a producción deben tener un contorno cerrado y válido antes de exportarse.

### FR-8. Compartición y permisos

- **FR-8.1** El propietario puede compartir un proyecto o archivo con otro usuario.
- **FR-8.2** Compartir no concede edición por defecto; el propietario otorga el nivel de permiso explícitamente.
- **FR-8.3** El propietario puede revocar permisos en cualquier momento.
- **FR-8.4** Solo el propietario o un usuario autorizado puede cambiar permisos.

### FR-9. Eliminación

- **FR-9.1** La eliminación de proyectos o archivos exige una confirmación clara en la interfaz.
- **FR-9.2** La eliminación requiere autorización verificada en el backend y mantiene la consistencia entre metadatos y archivos.

## 5. Reglas de negocio

| Id | Regla |
| --- | --- |
| **BR-1** | La geometría se almacena en milímetros; cambiar la unidad de visualización no modifica las dimensiones reales. |
| **BR-2** | Se rechazan coordenadas no finitas y medidas que incumplan las restricciones de la operación. |
| **BR-3** | Solo se aplican reglas de escalado definidas para el patrón y la talla solicitada; el escalado no sobrescribe silenciosamente el patrón base. |
| **BR-4** | El margen de costura es no negativo, se expresa en la unidad interna y se distingue del contorno base. |
| **BR-5** | Todo proyecto y archivo de la cuenta tiene un propietario; toda operación sobre recursos privados requiere autenticación y autorización verificadas en el backend. |
| **BR-6** | Un archivo solo se presenta como disponible en la cuenta cuando su transferencia y registro se completaron; un fallo de publicación no elimina el documento local ni sustituye la última versión remota válida. |
| **BR-7** | Las operaciones de versionado son atómicas; cada versión identifica autor y fecha. |
| **BR-8** | Los archivos se validan por tamaño, formato y contenido antes de aceptarse; no se confía solo en la extensión o el tipo declarado. |
| **BR-9** | Una actualización verifica la versión que se modifica y rechaza conflictos para que el usuario los resuelva. |
| **BR-10** | Las acciones destructivas requieren confirmación en la interfaz y autorización en el backend. |

## 6. Criterios de aceptación

### Cuentas

- **AC-1.1** Un usuario nuevo puede registrarse, iniciar sesión y cerrar sesión desde las tres aplicaciones.
- **AC-1.2** Un visitante no puede acceder a ningún recurso privado sin autenticarse.
- **AC-1.3** Cambiar la contraseña exige reautenticación.

### CAD y patrones

- **AC-3.1** Se puede crear, abrir, editar y guardar un patrón sin que el zoom o el tamaño de ventana alteren sus medidas.
- **AC-3.2** Una medida introducida en milímetros se conserva exacta al cambiar la unidad de visualización.
- **AC-3.3** Una operación de edición inválida no deja el documento parcialmente modificado.

### Escalado

- **AC-4.1** Escalar a una talla no sobrescribe el patrón base y registra la talla y la regla aplicadas.

### Guardado y versiones

- **AC-5.1** Guardar localmente y publicar en la cuenta se distinguen claramente en la interfaz.
- **AC-5.2** Cada versión publicada queda identificada por autor y fecha.
- **AC-5.3** Tras un guardado fallido, la última versión válida se conserva y los cambios locales son recuperables.

### Biblioteca y descarga

- **AC-6.1** Desde web y móvil se puede listar, previsualizar y descargar un archivo autorizado.
- **AC-6.2** La descarga conserva el contenido y las medidas del archivo.
- **AC-6.3** No se muestra una descarga incompleta como lista para imprimir.

### Exportación

- **AC-7.1** La exportación indica unidad y escala de salida.
- **AC-7.2** Un patrón con contorno abierto o errores geométricos no se presenta como apto para producción.

### Permisos y eliminación

- **AC-8.1** Compartir no concede edición por defecto; el propietario controla los permisos.
- **AC-9.1** Eliminar un proyecto o archivo exige confirmación y deja el estado del sistema consistente.

## 7. Casos de error

| Id | Escenario | Respuesta esperada |
| --- | --- | --- |
| **E-1** | Acceso a un recurso sin sesión o sin permiso. | Código `401` o `403`; mensaje claro en español; el recurso no se expone. |
| **E-2** | Entrada inválida (campos vacíos, valores fuera de rango, coordenadas no finitas). | Código `400` con detalle por campo; la operación no se aplica. |
| **E-3** | Conflicto de versión al publicar o actualizar. | Código `409`; se conserva la última versión válida y se ofrece resolver el conflicto. |
| **E-4** | Archivo demasiado grande o formato no admitido. | Código `413` o rechazo con mensaje; el archivo no se acepta. |
| **E-5** | Publicación interrumpida (pérdida de conexión). | El documento local no se elimina; se muestra estado de publicación fallida con acción de reintento sin duplicar. |
| **E-6** | Exportación con errores geométricos. | La exportación se bloquea o se marca como no apta para producción. |
| **E-7** | Error inesperado del servidor. | Código `500` con mensaje genérico e identificador de seguimiento; sin exponer detalles técnicos. |

## 8. Requisitos no funcionales

- **Seguridad:** contraseñas nunca en texto plano; secretos fuera del repositorio; recursos privados nunca en rutas públicas permanentes.
- **Consistencia:** cambios que afecten varias entidades se ejecutan en transacciones; versionado atómico.
- **Trazabilidad:** cada operación de servidor se registra con identificador de seguimiento, sin exponer datos sensibles.
- **Calidad:** operaciones geométricas cubiertas por pruebas de medidas, unidades y casos límite; permisos y versionado con pruebas de integración.
- **Idioma:** mensajes de interfaz en español; identificadores de código en inglés.

## 9. Decisiones pendientes (se resuelven en el plan técnico)

- Runtime y sistemas operativos del CAD de escritorio.
- Tecnología y distribución de la aplicación móvil (nativa, multiplataforma o PWA).
- Biblioteca de acceso a datos de PostgreSQL.
- Proveedor de almacenamiento de archivos.
- Formatos concretos de importación, intercambio e impresión.
- Mecanismo de transferencia CAD ↔ cuenta y comportamiento sin conexión.
