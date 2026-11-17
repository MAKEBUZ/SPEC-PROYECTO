# Matriz técnica de referencia

Consulta: 2026-11-14. Baseline documental seleccionada para la implementación futura; no hay dependencias instaladas, compilación ni compatibilidad ejecutada. Las versiones exactas se fijarán en manifiestos y lockfile al autorizar código. Antes de ese momento se revisarán avisos de seguridad; no actualizar mayores ni perfiles geométricos/PDF silenciosamente.

## Versiones seleccionadas

| Componente | Versión de referencia | Aplicación y compatibilidad documental |
|---|---|---|
| Node.js | 24.22.3 LTS | Toolchain y servidor; se elige la rama 24 para proximidad con Node incluido en Electron, aunque 26 también es LTS. |
| npm | 12.2.2 | Workspaces y package-lock; declara Node ^22.22.2, ^24.15.0 o >=26. |
| TypeScript | 7.0.2 | strict; declara Node >=16.20. Validar decoradores Nest y compilación de todos los paquetes antes de congelar lockfile. |
| Electron | 45.3.2 | Incluye Node 24.22.2 y Chromium 156.0.8078.100; el Node instalado del servidor no sustituye este runtime. |
| React / react-dom | 19.3.1 / 19.3.1 | Misma versión en CAD y web; react-dom requiere React ^19.3.1. |
| Next.js | 16.4.6 | Node >=20.9.0; peers React/ReactDOM ^19.0.0 admiten la versión seleccionada. |
| Tailwind / @tailwindcss/postcss | 4.3.5 / 4.3.5 | CSS compartido; revisar estilos en Safari móvil real, sin asumir que compilar prueba compatibilidad. |
| Three.js | 0.187.0 | Solo renderer CAD; no fuente de verdad ni dependencia del núcleo geométrico. |
| Nest core/common/platform-express | 12.5.0, alineados | Node >=20 y peers de la misma rama 12. Sin microservicios/websockets añadidos. |
| rxjs / reflect-metadata | 7.8.2 / 0.2.2 | Satisfacen los peers declarados de Nest. |
| PostgreSQL | 18.7 | Estable soportado; no usar 19 RC. Misma versión en pruebas de integración y servidor inicial. |
| pg | 8.23.1 | Node >=16. Usar implementación JS, sin pg-native opcional; transacción en una sola conexión. |
| PDFKit | 0.20.2 | Perfil vectorial y reproducibilidad definidos en el contrato de impresión; probar en Node servidor y utilityProcess. |
| @resvg/resvg-wasm | 2.6.2 | Vista previa PNG con el mismo WASM y fuentes en cliente/servidor; declara Node >=10. |
| pdfjs-dist | 6.5.438 | Lectura independiente del PDF para validación; declara Node >=22.13.0 o >=24. |
| argon2 | 0.45.2 | Solo backend; Node >=16.17. Verificar binario/compilación Linux x64 en futura instalación. No distribuir este módulo en CAD. |
| Vite | 8.3.8 | Compilación renderer CAD; Node ^20.19 o >=22.12. Next conserva su propio compilador. |
| Electron Forge CLI | 8.0.1 | Empaquetado Windows; Node >=22.13. Configurar instalador Windows durante implementación, no aquí. |
| node-addon-api | 8.9.2 | Adaptador mínimo Windows de archivos; reconstruir/probar contra Electron 45.3.2, no reutilizar binarios de otro ABI. |
| Vitest / @playwright/test | 5.1.0 / 1.65.1 | Unitarias/integración y E2E; requisitos de Node compatibles con 24.22.3. |

Los módulos opcionales de los peers no se instalan por aparecer en el registro. Las dependencias transitivas y tipos se resolverán en el lockfile, con revisión de licencia y avisos. Esta tabla comprueba restricciones publicadas, no garantiza ausencia de errores de integración. El núcleo de precisión debe ejecutarse contra ambos runtimes Node seleccionados; no depender de resultados numéricos accidentalmente distintos.

## Matriz de validación de plataformas

CAD: soporte aprobado por el usuario: Windows 11 de 64 bits, arquitectura x64; Windows 10 y Windows ARM64 no incluidos. incluir lectura/escritura en NTFS local y USB NTFS/exFAT en la batería de aceptación. Los sistemas de archivos indicados son configuraciones de ensayo, no una restricción adicional del alcance USB aprobado. Red y carpetas sincronizadas siguen aplazadas por decisión del usuario. macOS/Linux siguen fuera de la primera entrega.

Servidor de pruebas: Linux x64 en EC2 t3.small us-east-2, Node 24.22.3/PostgreSQL 18.7. La imagen Linux exacta se fijará al preparar un despliegue autorizado y comprobar los paquetes soportados; no se ha elegido ni contratado una AMI comercial.

Portal/PWA: soporte Android aprobado: Android 12 o posterior con Chrome; validar Chrome estable y modo instalado. Soporte iPhone aprobado: iOS 17 o posterior con Safari, incluida la PWA instalada desde su icono. Portal web en computadora: soporte aprobado de Chrome y Edge en su versión estable actual y la anterior. Registrar las versiones exactas verificadas en cada entrega. Incluir la versión estable anterior de los navegadores donde sea instalable. Las aprobaciones de Android e iPhone definen el soporte requerido; las referencias restantes no sustituyen decisiones pendientes. No proclamar soporte probado hasta ejecutar instalación, autenticación, descarga y recuperación de errores en dispositivos físicos. Tailwind documenta requisitos de navegador modernos que la matriz debe satisfacer.

## Requisitos de equipo — U1

Windows 11 x64 con 4 núcleos, 16 GB de RAM y SSD es el equipo de referencia para medir rendimiento, no un mínimo excluyente. El mínimo admitido se determinará mediante pruebas durante la implementación y antes de declarar compatibilidad de entrega; no se excluyen por ahora equipos inferiores. Las pruebas no autorizan reducir funciones ni cambiar costes sin consultar. U1 queda resuelto documentalmente; compatibilidad y rendimiento no se consideran probados. U2 cerrado documentalmente; implementación y pruebas pendientes.

## Verificación al iniciar implementación

Generar lockfile sin rangos flotantes para dependencias directas; compilar backend, web y CAD por separado; reconstruir el adaptador Windows; ejecutar contratos compartidos en Node servidor y Electron. Verificar instalación Windows, Argon2id Linux, Unicode, PDF grande y PWA. Si una versión concreta resulta incompatible, ajustar parches compatibles y registrar el cambio; no reducir funciones ni tolerancias para salvar una dependencia.

## Evidencia primaria

- [Node descargas LTS](https://nodejs.org/en/download) y [Electron estable](https://releases.electronjs.org/?channel=stable), consultados 2026-11-14.
- Metadatos publicados por mantenedores en npm, consultados solo como JSON (sin instalar): [next 16.4.6](https://registry.npmjs.org/next/16.4.6), [react-dom 19.3.1](https://registry.npmjs.org/react-dom/19.3.1), [Nest 12.5.0](https://registry.npmjs.org/@nestjs/core/12.5.0), [pg 8.23.1](https://registry.npmjs.org/pg/8.23.1), [PDFKit 0.20.2](https://registry.npmjs.org/pdfkit/0.20.2), [argon2 0.45.2](https://registry.npmjs.org/argon2/0.45.2), [TypeScript 7.0.2](https://registry.npmjs.org/typescript/7.0.2), [npm 12.2.2](https://registry.npmjs.org/npm/12.2.2).
- [Tailwind compatibilidad](https://tailwindcss.com/docs/compatibility), [node-argon2](https://github.com/ranisalt/node-argon2), [PostgreSQL versiones](https://www.postgresql.org/support/versioning/).
- Metadatos de impresión: [resvg WASM 2.6.2](https://registry.npmjs.org/@resvg/resvg-wasm/2.6.2), [pdfjs-dist 6.5.438](https://registry.npmjs.org/pdfjs-dist/6.5.438).
- El resto de versiones de la tabla se verificó en el endpoint público `https://registry.npmjs.org/<paquete>/latest`; la tabla conserva la versión consultada para no depender del valor futuro de latest.
