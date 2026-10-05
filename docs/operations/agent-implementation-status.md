# Avance de implementación — 2026-10-04

Alcance autorizado: código, interfaz, migraciones y ensayos aislados. Sin despliegue público, modificaciones de producción ni comunicaciones reales. Se preservaron los cambios previos en alerts-workspace.tsx y legal-agent.md.

| Tarea | Dependencias | Estado | Evidencia / pendiente |
|---|---|---|---|
| T0 Medición y perfiles | — | En curso | Baseline: 28 tests en 5 archivos, 314 ms; clasificación y generación: al menos 2 llamadas por mensaje libre. Falta ledger por intento. |
| T1 Reservas y rutas | T0 | Pendiente | Reservas previas, límites distribuidos y rutas conservadoras. |
| T2 Ejecución durable | T0–T1 | Pendiente | Extender jobs; sacar indexación de finalize. |
| T3 Carpeta viva | T2 | Pendiente | Evidencia estable, hechos y revisión. |
| T4 Extracción compartida | T2–T3 | Pendiente | Cobertura, reanudación, cache privado versionado. |
| T5 Documentación pendiente | T3–T4 | Pendiente | Checklist, dependencias y parte diario. |
| T6 Accidentes de trabajo | T4–T5 | Pendiente | Requiere datos compartidos; modelos reales del abogado aún no aportados. |
| T7 Salud | T4–T5 | Pendiente | No inferir urgencia ni plazo procesal. |
| T8 Laboral | T4–T5 | Pendiente | Datos/entrevista; reglas jurídicas pendientes. |
| T9 Sucesiones | T4–T5 | Pendiente | Vínculos documentados; sin inferencia de derechos. |
| T10 Escritos | T3–T4 | Pendiente | Plantillas aprobadas, evidencia y DOCX. |
| T11 Conexiones | T2–T5 | Pendiente | Importación manual; MEV/SCBA sin sesión autorizada verificada. |
| T12 Investigación | T1–T3,T10 | Pendiente | Fuentes oficiales permitidas; textos/vigencia deben verificarse. |
| T13 Comunicación y voz | T2–T5 | Pendiente | Sólo borradores, sin envío real; voz requiere canal verificado. |
| T14 Cálculos | T3,T8 | Pendiente | Motor decimal; activación jurídica requiere reglas y casos revisados. |
| T15 Evaluación | Transversal | En curso | Fixtures técnicos no equivalen a validación jurídica. |

## Consumo y baseline

La duración anterior corresponde a Vitest local, sin llamadas a proveedores. Los tests existentes usan mocks: sus tokens no son consumo real. Consumo del agente de implementación no disponible en este entorno; no se estima como cero. Se medirán llamadas del producto por intento, tokens reportados/estimados, duración, neurons y tarifa marginal; no equivalen a factura ni a cuota de toda la cuenta. No hay evaluación del tiempo de revisión del abogado ni comparación jurídica representativa.
