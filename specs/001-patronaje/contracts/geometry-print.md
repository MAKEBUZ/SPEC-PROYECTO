# Contrato de geometría, impresión y verificación de publicaciones

Estado: diseño técnico seleccionado para la primera entrega; sin código ni pruebas ejecutadas. Resuelve las elecciones de algoritmo y estrategia de verificación de R-01/R-02. La viabilidad numérica, el determinismo entre plataformas y los objetivos de rendimiento son puertas de validación antes de liberar, no hechos demostrados. Las decisiones funcionales de spec.md prevalecen.

## Modelo y decisiones de algoritmo

El núcleo TypeScript puro usa líneas y Bézier cúbicas en milímetros, conectividad explícita y cornerJoins por identidad de vértice. La escena Three.js y las polilíneas de pantalla son representaciones derivadas. Una esquina nueva es miter; cambiar otra no la modifica. La elección round/miter por esquina se conserva al guardar y exportar.

No seleccionar ClipperOffset como generador canónico: su JoinType por recorrido, cuantización, normalización y límites de punta no satisfacen directamente las uniones mixtas aprobadas. Tampoco usar Union o SimplifyPaths para reparar originales. Puede utilizarse como oráculo comparativo de casos simples durante las pruebas, no como dependencia necesaria del producto. Se elige construcción por tramos y uniones explícitas; no queda pendiente elegir una biblioteca de offset global.

Para las decisiones topológicas usar los valores finitos realmente almacenados como racionales exactos derivados de su representación binaria, con operaciones racionales BigInt. El camino rápido emplea intervalos conservadores y predicados filtrados; un signo no demostrado se refina o pasa al cálculo exacto, nunca se decide mediante una tolerancia fija de tamaño. Esto no aumenta la precisión de la entrada ni inventa medidas que no estaban guardadas.

Validación del contorno original:

1. Comprobar finitud, identidad/conectividad del cierre y segmentos constantes. Una Bézier cuyo inicio coincide con el final no es automáticamente de longitud cero: lo es si toda su trayectoria es constante.
2. Integrar algebraicamente x·dy−y·dx por tramo para área firmada. Distinguir área exactamente cero de positiva pequeña; no añadir mínimo funcional.
3. Descartar pares mediante cajas conservadoras. Para curvas, subdivisión de Casteljau y Bézier clipping reducen los intervalos paramétricos; clasificar raíces mediante eliminación polinómica y aislamiento real con aritmética racional cuando existan tangencias, coincidencias o estancamiento. Separar raíces múltiples de cruces y detectar componentes comunes, no confiar solo en que cambie el signo.
4. Excluir únicamente la unión normal de extremos de tramos consecutivos; un contacto adicional, solapamiento o autocruce sigue siendo defecto. Las intersecciones internas de un mismo tramo también se comprueban.

La eliminación polinómica y el aislamiento de raíces son trabajo del núcleo geométrico: no se atribuyen a Three.js ni a una biblioteca de orientación de segmentos. Deben probarse por separado con soluciones analíticas conocidas y casos degenerados. Si el proceso no puede completar un cálculo por recursos o un defecto del motor, comunica fallo técnico y conserva el borrador; no clasifica una figura positiva como nula ni declara producción válida sin prueba. No convertir un presupuesto de tiempo interno en un nuevo límite de geometría.

## Construcción del margen

Orientar el contorno válido para identificar exterior. Para ancho d=0, mantener coincidencia con el contorno base, conforme a la spec. Para d>0:

- Recta: trasladar su soporte d por la normal exterior.
- Bézier regular B(t): representar el offset conceptual O(t)=B(t)+d·N(t), donde N es la normal unitaria exterior a B′. Separar intervalos en raíces de la derivada; evaluar tangentes laterales mediante la primera derivada no nula en cada extremo. No dividir por velocidad cero ni ocultar una singularidad.
- Esquina convexa miter: intersectar los soportes tangentes de los dos extremos desplazados y conectar hasta esa intersección. Sin MiterLimit, bisel o cambio automático de forma. Una punta finita dentro de los tamaños aprobados se conserva; una intersección inexistente/no finita o geometría inválida activa la validación de margen existente.
- Esquina convexa round: arco exterior con centro en el vértice base y radio d, entre los extremos desplazados; no una curva elegida visualmente.
- Encuentros cóncavos: recortar únicamente los extremos adyacentes hasta su intersección local para formar el encuentro del offset. No aplicar una unión booleana global que suprima bucles o cambie topología para conseguir artificialmente un margen válido.

Representar los tramos desplazados y arcos como entidades derivadas con referencia a su origen. Para renderizado/PDF aproximarlos adaptativamente a curvas o segmentos, acotando el error en todo el intervalo con envolventes de derivadas y aritmética de intervalos; refinar hasta la cota objetivo. La cota se aplica directamente a O(t), no a una suma ingenua de errores de una polilínea y su offset. Refinar más donde sea necesario para preservar separación/topología; no fusionar detalles pequeños.

Revalidar el margen completo, incluidas uniones y extremos: cierre, finitud, contactos/cruces, área, tamaño y correspondencia con el ancho y tipo de unión. Guardar el ancho y elecciones solicitadas aunque no pueda obtenerse un margen válido. Conservar la distinción entre margen inválido y error técnico del cálculo.

## Precisión, composición y PDF

Objetivo interno de aproximación del offset: cota máxima de 0,01 mm respecto de su trayectoria conceptual, reducida adaptativamente si la topología lo exige. Es un presupuesto técnico de cálculo, no un nuevo mínimo de longitud, una tolerancia de cierre ni permiso para alterar el ancho solicitado. La geometría derivada usada por CAD y exportación procede del mismo resultado versionado.

Presupuesto interno CAD→PDF: 0,05 mm en total, distribuido en 0,01 transformación/unidades, 0,01 serialización, 0,02 aproximación/clipping y 0,01 incertidumbre de verificación. El criterio aprobado sigue siendo desviación máxima de 0,1 mm, medible bidireccionalmente en toda la trayectoria; la suma asignada no equivale a una prueba ejecutada. No usar error entre vértices muestreados como sustituto de la cota completa.

Las distancias de 2 mm y tamaños máximos se validan sobre geometría real/derivada acotada, no píxeles. Si el intervalo de distancia cruza el umbral, refinar; distinguir exactamente 2 mm de inferior, sin margen oculto. Validar solo selección/preparación y estructura global, como exige la spec.

PDFKit emite las cúbicas originales cuando corresponde; el margen usa el trazado derivado acotado. Conversión mm→puntos según 72/25,4 y UserUnit para gran formato. Para A4/Carta, usar el mismo trazado y recorte de página, sin escalarlo. Fijar orden de páginas, instrucciones, cuadrado de prueba, leyenda, numeración, solape y franja auxiliar conforme a la preparación. Un verificador separado basado en PDF.js interpreta operadores, matrices, UserUnit, cajas y recortes para contrastar trayectorias, páginas y dimensiones esperadas; no basta comprobar el manifiesto embebido. PDF.js no se usa para ejecutar JavaScript, abrir enlaces ni cargar recursos externos.

## Perfil de exportación reproducible

Seleccionar un perfil versionado e inmutable exportProfileId que identifica versión exacta del núcleo, PDFKit, verificador, fuentes embebidas, configuración de renderizado PNG, formato numérico y reglas de ordenación. El perfil queda registrado con cada artefacto y se conserva al publicar. La identidad de revisión y preparación se calcula desde el contenido guardado, sin depender del nombre del archivo ni del reloj de exportación.

Eliminar fuentes de no determinismo: metadatos temporales y file ID derivados de entradas canónicas, orden de objetos y fuentes estable, mismos bytes de tipografía, locale explícito y PDF sin compresión dependiente de una versión nativa de zlib. El perfil no usa aleatoriedad ni reloj del dispositivo. La vista previa PNG se genera mediante un rasterizador CPU versionado de las mismas primitivas, sin capturas del canvas del navegador; codificación y metadatos fijos. Debe demostrarse reproducción Windows/Linux antes de aceptar el perfil para publicar. Seleccionar @resvg/resvg-wasm para usar el mismo binario WASM en CAD y servidor; SVG es una representación interna generada por el núcleo, no un formato de importación habilitado. Desactivar fuentes del sistema y cargar solo bytes de fuentes incluidos en el perfil; prohibir referencias externas. El componente Rust compilado a WASM se limita a rasterización, no sustituye el núcleo TypeScript ni exige incorporar Rust al código de negocio. Fijar versión exacta y hash del WASM con la matriz de dependencias. La igualdad PNG entre plataformas es un criterio de aceptación obligatorio, no una garantía atribuida al paquete.

La comparación exacta de bytes es una estrategia deliberada: la primera entrega publica artefactos del propio CAD, no PDF externos arbitrarios. No pretende aceptar cualquier PDF visualmente equivalente. No se debe introducir un perfil en clientes hasta que su reproducción en el servidor esté comprobada. Conservar perfiles necesarios para verificar artefactos ya emitidos; una actualización no reescribe versiones publicadas.

## Verificación remota y publicación atómica

El servidor recibe documento editable, manifiesto, vista previa y PDF seleccionados. Recalcula la revisión canónica del editable, encuentra cada preparación por identidad/hash y valida selección, estructura y límites. No confía en un hash de origen declarado por el cliente.

Un trabajador aislado regenera los artefactos esperados en temporales usando el perfil identificado. Compara longitud y bytes reales con los objetos cargados, y calcula sus propios hashes. Para los PDF ejecuta también el verificador independiente de operadores/geometría. Para la vista previa reproduce el perfil PNG. No reemplaza silenciosamente la carga por el resultado regenerado: coincidencia permite publicar los originales; diferencia rechaza el conjunto con ARTIFACT_MISMATCH y mantiene intacta la versión anterior. Un perfil desconocido produce EXPORT_PROFILE_UNSUPPORTED, no aceptación por metadatos. Son errores técnicos explicables que preservan el trabajo local.

Tras validar todos los archivos, el commit revalida sesión, autorización, cuota y versión esperada, como establece contracts/api.md. Los temporales no son versiones ni adjuntos accesibles. Un fallo o caída del trabajador no deja una publicación parcial y no se interpreta como fracaso definitivo si el resultado de commit sigue desconocido.

Regeneración compartida verifica correspondencia con el editable, pero no descubre por sí sola un error común del motor. La comprobación independiente de geometría y los ensayos de referencia cubren ese riesgo. El PDF original mantiene sus bytes al descargarlo.

## Recursos y criterios de cierre

En EC2 de pruebas procesar un trabajo geométrico/publicación pesado a la vez, con streaming de archivos y temporales en disco. No reservar otro servicio ni aumentar instancias automáticamente. La cola permanece persistida; las cargas grandes pueden tardar más y deben mostrar estado sin falsos éxitos. Los 60 segundos de generación local no se convierten en un SLA remoto inventado. Si el perfil no cabe en la capacidad aprobada, reportar el resultado antes de proponer coste mayor.

Pruebas futuras obligatorias: esquinas mixtas, puntas agudas válidas y fuera de tamaño, curvas con tangencias/cúspides, detalles positivos muy pequeños, offsets inválidos sin reparación, PDF de 10 m más auxiliares, 250 páginas, error bidireccional, cancelación y guardado local, reproducción binaria Windows/Linux, PDF manipulado con manifiesto intacto, cambio de tipografía/metadatos, perfil no admitido y caída en cada frontera del commit. Ninguna está ejecutada aquí.

## Fuentes y alcance

- [ClipperOffset](https://www.angusj.com/clipper2/Docs/Units/Clipper.Offset/Classes/ClipperOffset/_Body.htm): restricciones de offset, normalización y segmentos cortos; justifica no adoptarlo como motor canónico sin adaptación.
- [Sederberg y Nishita: Curve intersection using Bézier clipping](https://www.sciencedirect.com/science/article/pii/001044859090039F): base de reducción paramétrica; no sustituye tratamiento de degeneraciones.
- [Comparación de algoritmos de intersección, NASA](https://ntrs.nasa.gov/citations/19850020280): subdivisión, intervalos y reducción a raíces polinómicas como métodos diferenciados.
- [Cotas globales del error de offset, investigación de Technion](https://gershon.cs.technion.ac.il/papers/tech-offset-err.pdf): la verificación por muestras no garantiza la cota completa.
- [PDFKit tamaños y UserUnit](https://pdfkit.org/docs/paper_sizes.html), [PDFKit documento/metadata](https://pdfkit.org/docs/getting_started.html) y [fuente de documento](https://github.com/foliojs/pdfkit/blob/master/lib/document.js): revisar al fijar la versión; determinismo es responsabilidad del perfil, no garantía general de PDFKit.
- [PDF.js PDFPageProxy](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html): acceso a operadores y geometría de página para el verificador independiente.

- [resvg-js/WASM](https://github.com/thx/resvg-js): rasterizador CPU con distribución WASM; se selecciona el mismo artefacto y fuentes para ambos entornos. [resvg](https://github.com/linebender/resvg): motor de representación SVG, no editor ni validador geométrico.
