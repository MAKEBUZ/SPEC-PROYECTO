# Demo local reproducible

Fecha de preparación: 2026-11-17. CAD 0.1.7. Ejecutar la instalación del [README](../README.md) y `node tools/demo/start.mjs` desde la raíz. Requiere Windows, Edge, Docker, recursos y builds; no requiere AWS.

## Qué demuestra y qué no

API NestJS, PostgreSQL y migraciones reales; CAD y portal reales; archivos locales y publicación manual. El lanzador **solo cambia el transporte**: Edge y CAD redirigen las solicitudes del origen ficticio `https://patron.example.invalid` a servicios loopback. No inventa decisiones de autenticación ni respuestas de negocio. El correo se captura en `.local/demo/<id>/mail` y los blobs se guardan en ese directorio. No es una configuración de producción.

El service worker está bloqueado en esta demo para permitir el puente. No acredita HTTPS público, PWA instalada, envío SES, almacenamiento S3, respaldos remotos ni eliminación definitiva de cuenta. Esa última composición no se habilita en este lanzador reducido. Las comprobaciones físicas permanecen pendientes.

La base vive en un contenedor efímero etiquetado `patronaje.purpose=demo`; Ctrl+C o cerrar el navegador termina la sesión y retira ese contenedor. Si se interrumpe el proceso a la fuerza, revisar únicamente contenedores con esa etiqueta. No usar datos reales. Guardar editables/PDF fuera del directorio temporal si se necesitan para la exposición.

## Recorrido para el profesor (15–20 minutos)

1. **Cuenta.** En Edge de la demo, registrar `alumno@example.invalid` con una contraseña que satisfaga la política visible. Leer el archivo de correo señalado en consola; pegar el enlace en esa misma ventana y confirmar verificación. Acceder en CAD con esas credenciales. Esperado: editor habilitado. Evidencia: captura sin contraseña ni token.
2. **Crear.** Pulsar «Nuevo contorno» o P; colocar cuatro puntos para un rectángulo y cerrar pulsando el primero. Esc termina la herramienta. Nombrar la pieza `Demo A`, talla `M`, cantidad `2`; activar hilo con inicio `(10,10)` y fin `(10,40)`, aplicar datos. Si las dimensiones dibujadas no contienen esas marcas, usar puntos numéricos o ajustar la ubicación. Validación esperada: sin problemas. Usar «Centrar piezas» cuando sea necesario.
3. **Guardar.** Guardar como `Demo.patron`; mover un punto y deshacer con Ctrl+Z. Guardar y reabrir. Esperado: forma conservada y «Documento sin cambios». Evidencia: editable creado y captura del estado.
4. **Preparar e imprimir.** Crear preparación `Demo A4`, seleccionar `Demo A`, papel A4, margen imprimible 10 mm, aplicar configuración y guardar. Generar `Demo-A4.pdf`. Esperado: «PDF guardado», archivo que abre, cuadrado de 100 mm, montaje y piezas. Revisar digitalmente; no afirmar escala física sin imprimir y medir.
5. **Publicar.** Abrir Publicación, actualizar PDF disponibles, seleccionar el PDF de esta revisión guardada, crear proyecto `Demo académica` y nombre de patrón `Demo patrón`. Preparar editable/vista previa/PDF; pulsar «Publicar versión». Esperado: «Versión publicada», conjunto íntegro. Guardar no bastaba para publicarlo.
6. **Consultar y descargar.** En el Edge de la demo visitar `https://patron.example.invalid/library`, iniciar sesión si corresponde, abrir proyecto/patrón/versión. Ver la miniatura y descargar editable y PDF. Comparar su contenido/hash con los originales, sin modificar los descargados. En PowerShell: `Get-FileHash -Algorithm SHA256 -LiteralPath 'ruta-del-original', 'ruta-de-la-descarga'`. Esperado: hashes iguales por pareja. El diálogo de descarga pertenece al navegador de ensayo.
7. **Error controlado.** En CAD desactivar «Línea de hilo», aplicar y guardar el borrador; intentar exportar esa pieza seleccionada. Esperado: aviso de hilo faltante y PDF bloqueado, sin perder documento. Restaurar el hilo válido, aplicar, guardar y exportar. Esperado: PDF generado. No reutilizar una selección de otra pieza para este caso.
8. **Cerrar.** Conservar los artefactos deseados; Ctrl+C en la consola. Esperado: CAD/navegador de demo cerrados y contenedor retirado. La sesión siguiente parte de una base nueva, no de la cuenta del piloto.

## Reproducción automatizada complementaria

```powershell
node tools/demo/start.mjs --smoke
node tools/validation/postgres.mjs --e2e tests/e2e/first-release.spec.ts tests/e2e/account.spec.ts tests/e2e/pwa.spec.ts
```

El primer comando acredita arranque/cierre, no todo el recorrido. El segundo usa PostgreSQL real y ventanas de ensayo; comprueba guardado, PDF, publicación interrumpida/reanudada, consulta, descargas íntegras y papelera. Parte de una geometría fixture y sustituye diálogos de archivo: no equivale a observar al profesor creando una pieza. La creación gráfica tiene pruebas propias en `tests/e2e/cad-graphical.spec.ts`. El error de producción se cubre además en pruebas de impresión y en las comprobaciones manuales históricas.

Registrar cada ensayo con fecha, commit, versión, equipo, resultado, captura/archivo y limitación. No publicar tokens, contraseñas ni los correos capturados. Véase [informe](validation/delivery-report.md).
