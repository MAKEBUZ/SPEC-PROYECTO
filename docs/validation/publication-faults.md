# T040 — fronteras de publicación

Pruebas locales ejecutadas con PostgreSQL 18.7 efímero, correo capturado y objetos privados sintéticos. Sin AWS ni despliegues.

| Requisito | Evidencia ejecutada |
|---|---|
| FR-009 y parte manual FR-020 | E2E de publicación separa guardado, preparación y envío; carga interrumpida se recupera al reabrir con la misma revisión |
| FR-010, BR-002/003 | Commit transaccional conserva autor/fecha, versión previa y conjunto completo; fallo SQL tras insertar archivos revierte todo |
| FR-022, BR-007 | Competencia por la misma versión esperada admite una sola actualización; E2E conserva copia independiente o respaldo antes de cargar remoto |
| FR-120 | Revocación después de verificar artefactos rechaza el commit y conserva el intento fallido |
| FR-274/275 | Publicación nueva con PDF de la misma revisión, sin cambiar geometría; la versión previa sin PDF conserva todos sus registros y hashes |
| FR-276 | PDF adulterado rechaza el conjunto tanto en primera publicación como en actualización; no cambia el último vínculo ni omite el archivo |
| FR-284 | 100 MB inclusivos en manifiesto, un byte de exceso rechazado, competencia por cuota de 2 GB y cuota de versiones/papelera |
| BR-008 | Hash/tamaño/tipo, estructura editable, regeneración PNG/PDF y lectura independiente antes de aceptar |

Fallos inyectados: antes y después de escribir objeto, al releer/verificar, al confirmar recepción SQL, al validar artefacto y durante el commit tras insertar archivos. Pérdidas de respuesta en creación de proyecto, inicio, carga, commit y abandono se reconcilian sin duplicar mutaciones. Un fallo al persistir el vínculo local después del commit conserva el seguimiento y consulta el resultado sin republicar.

Validación final dirigida: **25/25** en `publication.spec.ts` (15), `desktop-publication.spec.ts` (6) y `pdf-publication.spec.ts` (4). Los cuatro últimos combinan PDF válido/adulterado con primera publicación/versión previa. E2E previamente ejecutado: **5/5** en `publication.spec.ts`, incluida exportación/selección PDF, reinicio y conflicto. Regresión completa anterior a ampliar los dos casos PDF: **150/150**, 23 archivos, 44,68 s. TypeScript correcto.

Se cierra la matriz funcional T040. No acredita capacidad/rendimiento de un documento JSON real de 100 MB, aceptación completa T095 ni módulos de publicación automática aplazados.
