# Feature Specification: PATRONAJE — Núcleo del sistema

**Feature Branch**: `001-patronaje`

**Created**: 2026-10-23

**Status**: Draft

**Input**: Sistema CAD de patronaje digital con gestión de archivos para patronistas, diseñadores de moda, talleres de confección, estudiantes y equipos de producción textil. El CAD de escritorio crea, edita, escala y prepara patrones para producción; la web y la móvil consultan, descargan y comparten esos patrones y sus archivos desde la cuenta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear cuenta e iniciar sesión (Priority: P1)

Una persona se registra con correo y contraseña, inicia sesión en cualquiera de las tres aplicaciones y cierra sesión cuando termina, manteniendo la misma identidad en todas ellas.

**Why this priority**: Sin identidad no hay propietario de proyectos, permisos ni control de acceso; es la base de todo el sistema.

**Independent Test**: Se puede probar registrando un usuario nuevo, iniciando y cerrando sesión en CAD, web y móvil, y comprobando que la misma cuenta accede a los mismos recursos.

**Acceptance Scenarios**:

1. **Given** un visitante sin cuenta, **When** se registra con correo y contraseña válidos, **Then** obtiene una cuenta y puede iniciar sesión.
2. **Given** un usuario autenticado, **When** cierra sesión, **Then** pierde acceso a los recursos privados hasta volver a autenticarse.
3. **Given** un usuario en la web, **When** inicia sesión con la misma cuenta usada en el CAD, **Then** ve los mismos proyectos y archivos.
4. **Given** un usuario que cambia su contraseña, **When** confirma el cambio, **Then** el sistema exige reautenticación y luego aplica la nueva contraseña.

---

### User Story 2 - Crear y editar un patrón en el CAD (Priority: P1)

Un patronista crea un patrón nuevo en un proyecto, dibuja y modifica sus contornos e introduce medidas, trabajando siempre en milímetros sin que el zoom o el tamaño de la ventana alteren las dimensiones reales.

**Why this priority**: La edición geométrica es el núcleo de valor del producto; sin ella no existe el CAD.

**Independent Test**: Se puede probar creando un patrón, dibujando un contorno, introduciendo una medida en milímetros, cambiando el zoom y la unidad de visualización, y verificando que la medida real se conserva.

**Acceptance Scenarios**:

1. **Given** un proyecto abierto, **When** el usuario crea un patrón y dibuja un contorno, **Then** el patrón queda disponible para seguir editándose.
2. **Given** un patrón con una medida de 100 mm, **When** el usuario cambia la unidad de visualización a centímetros, **Then** la medida real sigue siendo 100 mm.
3. **Given** un patrón con zoom al 200 %, **When** el usuario mide una pieza, **Then** la medida es la misma que con zoom al 100 %.
4. **Given** una operación de edición inválida, **When** el usuario la aplica, **Then** el documento no queda parcialmente modificado.

---

### User Story 3 - Guardar y publicar versiones (Priority: P1)

El usuario guarda el patrón en su equipo y publica una versión en su cuenta, distinguiendo ambos estados, y cada versión publicada queda identificada por autor y fecha.

**Why this priority**: Sin guardado y publicación no hay continuidad entre el CAD y los demás dispositivos, que es el flujo principal del producto.

**Independent Test**: Se puede probar guardando localmente, publicando una versión y comprobando que la web/móvil ve esa versión con su autor y fecha, y que el guardado local y la publicación se muestran como estados distintos.

**Acceptance Scenarios**:

1. **Given** un patrón editado, **When** el usuario lo guarda localmente, **Then** el cambio queda en el equipo y se indica que aún no está publicado.
2. **Given** un patrón guardado, **When** el usuario publica una versión, **Then** la versión aparece en la cuenta con autor y fecha.
3. **Given** una publicación fallida, **When** se corta la conexión, **Then** el documento local se conserva y la última versión remota válida no se sustituye.
4. **Given** una versión publicada, **When** el usuario intenta actualizarla desde una copia desactualizada, **Then** el sistema rechaza el conflicto y pide resolverlo.

---

### User Story 4 - Escalar tallas (Priority: P2)

El usuario escala un patrón a una talla solicitada aplicando una regla definida, y el patrón base no se sobrescribe.

**Why this priority**: El escalado es una función clave del patronaje, pero puede entregarse después del flujo básico de creación y publicación.

**Independent Test**: Se puede probar escalando un patrón a una talla y comprobando que se genera una nueva versión o copia y que el patrón base permanece intacto.

**Acceptance Scenarios**:

1. **Given** un patrón base, **When** el usuario lo escala a la talla M, **Then** obtiene un resultado con la talla y la regla aplicadas.
2. **Given** un patrón base, **When** el usuario lo escala, **Then** el patrón base no cambia.
3. **Given** una talla sin regla de escalado definida, **When** el usuario la solicita, **Then** el sistema no aplica un escalado arbitrario.

---

### User Story 5 - Consultar y descargar desde web y móvil (Priority: P2)

Un usuario revisa desde la web o la móvil los archivos de su cuenta, ve vistas previas y versiones, y descarga un archivo autorizado sin cargar el editor CAD completo.

**Why this priority**: Es el puente entre el trabajo del CAD y el acceso desde otros dispositivos; aporta valor una vez existe publicación de versiones.

**Independent Test**: Se puede probar desde la web y la móvil listando archivos, abriendo una vista previa, consultando versiones y descargando un archivo autorizado.

**Acceptance Scenarios**:

1. **Given** una versión publicada, **When** el usuario abre la web o la móvil, **Then** ve el archivo, su vista previa y su historial de versiones.
2. **Given** un archivo preparado para impresión, **When** el usuario lo descarga, **Then** el archivo conserva su contenido y medidas e indica escala y dimensiones de salida.
3. **Given** un usuario sin permiso, **When** intenta descargar un archivo, **Then** el sistema deniega la descarga.
4. **Given** una descarga incompleta, **When** termina la transferencia, **Then** el archivo no se presenta como listo para imprimir.

---

### User Story 6 - Exportar para producción (Priority: P2)

El usuario exporta un patrón a un formato admitido indicando unidad y escala de salida, y el sistema no presenta como apto para producción un patrón con errores geométricos.

**Why this priority**: Conecta el patrón digital con la producción real, pero depende de que existan geometría válida y versiones.

**Independent Test**: Se puede probar exportando un patrón válido y otro con contorno abierto, verificando que el primero se marca apto y el segundo no.

**Acceptance Scenarios**:

1. **Given** un patrón con contorno cerrado y válido, **When** el usuario exporta, **Then** la exportación indica unidad y escala y se presenta como apta para producción.
2. **Given** un patrón con contorno abierto o coordenadas no finitas, **When** el usuario intenta exportarlo para producción, **Then** el sistema bloquea o marca la exportación como no apta.

---

### User Story 7 - Compartir y gestionar permisos (Priority: P3)

El propietario comparte un proyecto o archivo con otro usuario y controla el nivel de permiso, sin que compartir conceda edición por defecto.

**Why this priority**: Habilita el trabajo en equipo, pero el producto entrega valor primero en modo individual.

**Independent Test**: Se puede probar compartiendo un recurso con otro usuario y verificando que solo accede al nivel concedido y que el propietario puede revocarlo.

**Acceptance Scenarios**:

1. **Given** un proyecto del propietario, **When** lo comparte con otro usuario sin especificar permiso, **Then** el otro usuario solo puede consultarlo, no editarlo.
2. **Given** un recurso compartido, **When** el propietario revoca el permiso, **Then** el otro usuario deja de acceder.

---

### Edge Cases

- Coordenadas no finitas o medidas fuera de las restricciones de la operación al editar.
- Exportación de un patrón con contorno abierto o piezas superpuestas inválidas.
- Conflicto de versión cuando dos copias modifican el mismo patrón.
- Publicación interrumpida por pérdida de conexión a mitad de la transferencia.
- Carga de un archivo con formato no admitido o tamaño excesivo.
- Descarga parcial que el usuario intenta imprimir como si estuviera completa.
- Cambio de unidad de visualización con valores límite (0 mm, medidas negativas).
- Acceso a un recurso compartido después de que el propietario lo elimine.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir registrar una cuenta con correo y contraseña, almacenando la contraseña de forma segura.
- **FR-002**: El sistema MUST permitir iniciar y cerrar sesión desde CAD, web y móvil con la misma identidad de usuario.
- **FR-003**: El sistema MUST permitir ver y actualizar el perfil y cambiar la contraseña exigiendo reautenticación.
- **FR-004**: El sistema MUST permitir crear, listar, renombrar y eliminar proyectos, con exactamente un propietario por proyecto.
- **FR-005**: El CAD MUST permitir crear, abrir y editar patrones con contornos y medidas numéricas.
- **FR-006**: El sistema MUST almacenar la geometría en milímetros y no alterar las medidas reales al cambiar la unidad de visualización ni el zoom.
- **FR-007**: El CAD MUST permitir deshacer y rehacer operaciones de edición.
- **FR-008**: El sistema MUST permitir escalar un patrón a una talla aplicando una regla definida, sin sobrescribir el patrón base.
- **FR-009**: El sistema MUST distinguir el guardado local de la publicación en la cuenta y mostrar ambos estados.
- **FR-010**: El sistema MUST registrar autor y fecha en cada versión publicada y ejecutar el versionado de forma atómica.
- **FR-011**: El sistema MUST validar la estructura del documento antes de guardar y conservar la última versión válida si el guardado falla.
- **FR-012**: La web y la móvil MUST permitir listar archivos y versiones, mostrar vista previa y consultar el historial sin cargar el editor CAD.
- **FR-013**: La web y la móvil MUST permitir descargar archivos autorizados, conservando contenido y medidas.
- **FR-014**: El sistema MUST asociar cada archivo de impresión a la versión que lo originó e indicar escala y dimensiones de salida.
- **FR-015**: El sistema MUST exportar patrones a los formatos admitidos indicando unidad y escala, y rechazar la exportación de producción con errores geométricos.
- **FR-016**: El sistema MUST permitir al propietario compartir recursos y gestionar permisos, sin conceder edición por defecto.
- **FR-017**: El sistema MUST exigir confirmación en la interfaz y autorización en el backend para acciones destructivas.
- **FR-018**: El backend MUST verificar autenticación y autorización en toda operación sobre recursos privados.

### Business Rules

- **BR-001**: Toda lectura, modificación, descarga o eliminación de recursos privados requiere autenticación y autorización verificadas en el backend; ocultar controles en la interfaz no sustituye la validación.
- **BR-002**: Un archivo solo se presenta como disponible en la cuenta cuando su transferencia y registro se completaron.
- **BR-003**: Las operaciones de versionado son atómicas y cada versión identifica autor y fecha.
- **BR-004**: Se rechazan coordenadas no finitas y medidas que incumplan las restricciones de la operación.
- **BR-005**: Las piezas destinadas a producción deben tener contorno cerrado y válido antes de exportarse.
- **BR-006**: El margen de costura es no negativo, se expresa en la unidad interna y se distingue del contorno base.
- **BR-007**: Una actualización verifica la versión que se modifica y rechaza conflictos para que el usuario los resuelva.
- **BR-008**: Los archivos se validan por tamaño, formato y contenido antes de aceptarse.

### Key Entities

- **Usuario**: identidad común a las tres aplicaciones; atributos de perfil y credenciales.
- **Proyecto**: agrupa patrones y archivos; tiene un propietario y participantes con permisos.
- **Patrón**: documento geométrico en milímetros; pertenece a un proyecto.
- **Versión**: instantánea publicada de un patrón; registra autor y fecha.
- **Archivo**: recurso asociado a una versión (editable, vista previa o preparado para impresión); incluye metadatos y referencia de almacenamiento.
- **Permiso**: nivel de acceso concedido por el propietario sobre un recurso compartido.
- **ReglaDeEscalado**: definición aplicable a un patrón y una talla.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario nuevo puede registrarse e iniciar sesión en las tres aplicaciones y acceder a los mismos recursos.
- **SC-002**: El 100 % de las medidas introducidas en milímetros se conservan exactas al cambiar la unidad de visualización y el zoom.
- **SC-003**: El 100 % de las publicaciones fallidas conservan el documento local y la última versión remota válida.
- **SC-004**: El 100 % de las versiones publicadas muestran autor y fecha.
- **SC-005**: El 100 % de las descargas autorizadas conservan el contenido y las medidas del archivo.
- **SC-006**: Ninguna exportación de producción se presenta como apta si el patrón tiene errores geométricos.
- **SC-007**: Ningún usuario sin permiso accede a un recurso privado, verificado desde la interfaz y la API.

## Assumptions

- Los usuarios tienen conexión a internet al publicar o descargar; el trabajo sin conexión se definirá en el plan técnico.
- La edición geométrica ocurre únicamente en el CAD de escritorio; web y móvil son de consulta y gestión.
- La identidad de usuario es común a las tres aplicaciones.
- Los formatos de importación, intercambio e impresión, el proveedor de almacenamiento, la biblioteca de persistencia, el runtime del CAD y la tecnología móvil se deciden en `plan.md` antes de implementar las funcionalidades que dependen de ellos.
- La edición colaborativa en tiempo real y la simulación de telas quedan fuera de este alcance y requieren una especificación propia.
