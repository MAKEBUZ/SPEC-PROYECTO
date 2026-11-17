# Recuperación local: integridad y confirmación vigente

Continuación local del 2026-11-15 en patronaje, sin AWS ni despliegue.

## Correcciones de T044 y pruebas de T039

Una confirmación de descarte corresponde a una copia concreta: si entretanto se capturó otra generación, se rechaza sin retirar la nueva. Tampoco se acepta descartar dos veces el mismo candidato ni descartar una entrada que ya es evidencia de descarte.

La lectura verifica la secuencia completa por documento. Generaciones repetidas o huecos aíslan sus candidatos e impiden nuevas escrituras sobre esa secuencia. El daño de un documento no se interpreta como permiso para recuperar su copia anterior. No se repara ni se descarta automáticamente.

El capturador periódico incluye la obtención del snapshot en su manejo de errores. Un fallo al obtenerlo o escribirlo se notifica y permite un intento posterior. Se mantiene una sola captura en curso, con captura inicial de documentos nuevos y objetivo periódico de 60 segundos. Detener el programador impide nuevas capturas.

## Evidencia ejecutada

- Tres pruebas nuevas reprodujeron los fallos de descarte antiguo, generación faltante y duplicada antes de corregirlos.
- Siete pruebas específicas pasan después de corregirlos, incluidas las dos del programador con reloj controlado.
- Regresión de recuperación: **63/63**, 13 archivos, 4,14 s.
- TypeScript: correcto.

T039/T044 permanecen abiertas: no se ha conectado y validado todavía el recorrido completo de recuperación en la interfaz y el ciclo de documentos del CAD. Un reloj controlado prueba la programación, no el objetivo de rendimiento con cargas reales ni un fallo físico del disco/USB.

La búsqueda local sigue sin encontrar `cl`, `clang++`, `g++` ni `vswhere.exe`. La compilación y aceptación del adaptador Windows de T041 siguen pendientes; no se instaló un compilador ni se sustituyó el adaptador por una operación de archivos con garantías distintas.
