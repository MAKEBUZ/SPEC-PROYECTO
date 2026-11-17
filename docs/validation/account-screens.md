# T025 — Pantallas de cuenta

Implementación local en patronaje, 2026-11-15, mediante speckit-implement. Sin cambios funcionales aprobados, despliegues, correo real ni gastos AWS.

## Cambios

Pantallas compartidas React para portal y renderer CAD: registro, login, verificación/reenvío, solicitud y confirmación de reset, perfil, cambio de contraseña, cierre actual/todas, revisión del alcance de eliminación, recuperación limitada y comprobación de eliminación sin sesión normal. Se conserva el acceso local del CAD al cerrar sesión; la interfaz indica invalidación remota pendiente.

Next.js ofrece /account, /account/verify-email y /account/reset-password. Abrir un enlace no confirma ni consume nada: el token se conserva solo en memoria, se retira de la URL y requiere envío explícito. No se almacena en el registro de operaciones. La respuesta genérica 202 del reset no promete existencia de cuenta, envío de correo ni cambio de contraseña.

Las mutaciones registran operationId, tipo y cuenta antes de enviarse, sin contraseña, token ni payload. Una respuesta incierta conserva el bloqueo de operaciones en conflicto; no hay reenvío automático. Cerrar sesión sigue siendo independiente. Las entradas se muestran únicamente para la cuenta iniciada. La consulta usa el contrato de US3; T051 todavía debe implementar su endpoint. Esto no completa el journal, retención ni reconciliación de US3.

Web utiliza BrowserSession con CSRF y cookies HttpOnly; solo guarda identificadores de solicitudes U2, nunca su credencial. CAD usa IPC validado y rutas permitidas: main guarda la credencial U2 en el almacén protegido de T023 y nunca la devuelve al renderer. Comprobación automática al abrir/reconectar, reintentos crecientes ante fallo y acción Comprobar ahora; un fallo no infiere eliminación.

Las pantallas están conectadas al HTML y build de Electron mediante Vite; el portal compila con Next.js. Se incorporan tipos React exactos en el lockfile. No se añade un framework alternativo.

## Validación

- TypeScript estricto incluye ahora los archivos TSX.
- 73 pruebas unitarias y de contratos aprobadas, incluidas persistencia anterior al envío, bloqueo por incertidumbre y fallo local de guardado.
- Integración PostgreSQL completa: 91 aprobadas de 92. Persiste solo el fallo previo de GET /projects no implementado (RESOURCE_UNAVAILABLE frente a ACCOUNT_LIMITED); no se modificó la aserción.
- Dos flujos nuevos en tests/integration/account-panel.spec.ts conectan el cliente de las pantallas y main con Nest/PostgreSQL reales: registro/verificación/reset y perfil/eliminación/recuperación/U2, sin secretos en respuestas al renderer.
- Build Next.js de las tres rutas y build Vite/Electron.
- tools/validation/account-ui.mjs: Edge local headless con respuestas HTTP simuladas. Comprueba perfil, pérdida de respuesta sin duplicación, persistencia tras recarga, verificación limitada, recuperación, reset genérico, offline, enlace sin consumo automático y vista de 390 px sin desbordamiento horizontal. Capturas locales .local/account-web.png y .local/account-mobile.png inspeccionadas visualmente.
- Prueba nativa Windows oculta: renderer React visible, IPC, aislamiento sin Node en renderer y safeStorage/ACL. No abre una ventana al usuario.

## Continuación

T026 sigue pendiente: aceptación integrada de los tres clientes y matriz real de dispositivos. La prueba móvil anterior es de viewport, no acredita Android/iPhone ni instalación PWA. US3/T051 completará consultas de resultados; US8/T088 la purga física. No se presentan esas dependencias como terminadas por T025.

Para reproducir: tools/validation/toolchain.ps1 run check; tools/validation/toolchain.ps1 exec -- vitest run tests/unit tests/contracts; .local/toolchain/node.exe tools/validation/postgres.mjs; .local/toolchain/node.exe node_modules/next/dist/bin/next build apps/web --webpack; .local/toolchain/node.exe tools/validation/account-ui.mjs; .local/toolchain/node.exe tools/validation/desktop-smoke.mjs. La UI de ensayo usa loopback; fuera del ensayo, PATRON_API_ORIGIN exige HTTPS. Ningún comando despliega recursos.
