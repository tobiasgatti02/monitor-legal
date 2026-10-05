# Evaluación y límites de evidencia

Los 32 escenarios actuales son fixtures funcionales (ocho variantes por especialidad): evento documentado, persona relatada, falta de prueba, contradicción, OCR parcial, hecho rechazado, fuente desactualizada y carpeta vacía. Sus expectativas son explícitas en `execution.test.ts`. Verifican contratos de estado/evidencia y advertencias. No son casos clínicos o jurídicos representativos ni un conjunto independiente reservado para ajuste de prompts.

Los ensayos SQL prueban RLS y efectos reales en un PostgreSQL efímero. El recorrido Node ejecuta código de producción contra esa base y reemplaza sólo proveedor/almacenamiento por dobles declarados. Los tests del Worker verifican autenticación, perfiles y namespace privado sin consumir Workers AI. El DOCX se abrió, exportó a PDF y se inspeccionaron sus tres páginas. La UI se probó con los componentes reales y API sintética, en escritorio y móvil 390×844; se verificaron cobertura parcial, carga de relato, registro de obligación y cálculo, sin desbordamiento horizontal. No se verificó una sesión real de Better Auth contra las nuevas tablas en staging.

## Medición registrada

- Baseline local previo: 28 tests / cinco archivos / 314 ms, sin llamadas reales de proveedor. El flujo libre tenía clasificación + generación por lectura del código, no por medición remota. No hay p50/p95 remoto comparable ni costo por resultado aceptado.
- `agent-node-validation.json`: recorrido funcional con tres llamadas simuladas (embedding, extracción y sección). Conserva cantidad de consultas y bytes lógicos de resultados. Esos bytes no son egress de red de Neon.
- `agent-memory-validation.json`: diez ingestas secuenciales de textos pequeños con proveedor/R2 simulados; tiempos incluyen el puente `psql` del test. RSS/heap del proceso Node y p50/p95 quedan en el reporte. No extrapolar a PDFs grandes ni latencia real del proveedor.
- `agent-pdf-memory-validation.json`: diez parseos secuenciales reales de PDF sintético de tres páginas (42.220 bytes), parser destruido en `finally`. El primer parseo incluye imports/carga nativa; p95 refleja ese arranque. Pico por muestreo, no profiler nativo exhaustivo. No cubre archivo máximo de 5 MB/200 páginas.
- Ledger sintético: tarifa aplicada a usage de mocks y reservas de auxiliares sin usage. No es consumo ni factura real. Llamadas reales del producto en estos ensayos: cero; comunicaciones enviadas: cero. Consumo del agente de implementación no disponible: no se informa como cero.

## Gate previo a piloto

1. Verificar autenticación, host/plan Node, Neon17/RLS y contratos reales de R2/Workers AI en rama aislada. Conciliar ledger por intento con métricas de proveedor, incluyendo errores/timeouts y uso de otras aplicaciones.
2. Probar PDFs/OCR mixtos y máximos admitidos, diez jobs comparables, interrupciones reales y cancelación, sin crecimiento sostenido. Medir memoria del Worker con el runtime disponible y memoria del navegador/OCR cuando el API de la plataforma lo permita. Mantener límites actuales hasta entonces.
3. Armar con el abogado un dataset anonimizado y expectativas por especialidad: hechos/fechas/personas/montos, prueba faltante, cita/pasaje, antecedentes favorables/adversos, urgencia/diagnóstico sin inferencia, plazos sin reglas activadas, vínculos sucesorios sin inferencia de derechos. Reservar un conjunto fuera del ajuste de prompts.
4. Comparar baseline y ampliación con idénticos documentos/consigna; si se compara con chat general, documentar modelo y configuración. Medir tiempo total incluyendo revisión, fidelidad, cobertura, faltantes, costo por resultado aceptado y tasa de rechazo. Evaluar semantic review del mismo modelo por separado: no es un segundo experto ni garantía de verdad.
5. Medir recall de recuperación bajo RLS/jurisdicción y planes/egress de queries reales antes de tocar HNSW/candidatos. No quitar filtros para mejorar el resultado.

Hasta superar esos gates, las capacidades están implementadas y ensayadas técnicamente en los alcances indicados; no se declara superioridad ni validación jurídica. MEV, SCBA Notificaciones, voz y fórmulas jurídicas siguen deshabilitadas.
