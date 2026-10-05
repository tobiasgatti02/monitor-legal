# Plan de implementación eficiente del agente jurídico

Fecha: 2026-10-04. Estado: propuesta técnica basada en lectura del repositorio y documentación oficial; no son ampliaciones implementadas ni benchmarks ejecutados.

## Objetivo y alcance

Estudio de Provincia de Buenos Aires: accidentes de trabajo, laboral, amparos de salud y sucesiones. Optimizar tiempo de trabajo completo, calidad verificable y costo por resultado aceptado. «El mejor» es una aspiración: sólo una evaluación representativa puede demostrar ventaja sobre alternativas.

Construir sobre Next.js/React, Better Auth, Neon Postgres con RLS, R2 y Workers AI. Conservar autenticación, permisos, documentos originales, aprobaciones y alertas. No hace falta alojar un LLM/GPU local. RAM de la aplicación, tokens, neurons, CPU, almacenamiento y egress son costos diferentes y deben medirse por separado.

## Evidencia del código y cambios necesarios

| Ubicación | Situación observada | Cambio propuesto |
| --- | --- | --- |
| `apps/web/src/lib/agent/service.ts` / `intent.ts` | Llamada de clasificación para cada mensaje libre; seis mensajes de contexto; límites verificados después de consumir. | Rutas de código para comandos/UI e intenciones inequívocas, fallback conservador para ambiguos, contexto limitado por tokens y reservas antes de llamadas. |
| `apps/web/src/lib/agent/gateway.ts` | Salida fija de 800 tokens y hasta dos intentos por proveedor. Usage ausente puede contabilizarse como cero. | Perfiles por tarea, ledger por intento, límites previos, accounting estimado cuando usage falte y estados inciertos en timeouts. |
| `services/ai-gateway/src/index.ts` | Allowlist de tres modelos, clamp adicional de 800 tokens y streaming desactivado. | Perfiles confiables coordinados con la web, trazas numéricas y cancelación. Cambiar sólo el cliente no habilita escritos largos. |
| `apps/web/src/lib/agent/ingestion.ts` | Indexación síncrona; originales/páginas/fragments/vectores serializados en memoria; embeddings reutilizados por checksum del documento. | Pipeline reanudable por lotes, límites antes de parsear y checkpoints. Reutilizar extracción y vectores versionados sin cruzar permisos. |
| `apps/web/src/app/api/knowledge/finalize/route.ts` | Finaliza y luego indexa durante la misma petición. | Finalización idempotente + trabajo persistente; UI de progreso sin depender de que quede abierta. |
| `apps/web/src/lib/agent/retrieval.ts` | FTS y pgvector; embeddings de consulta cacheados por actor; hasta ocho fragmentos; rerank cuando hay búsqueda híbrida. | Recuperación adaptada al tipo de consulta, cobertura explícita para procesos exhaustivos y rerank medido. |
| `apps/web/src/lib/agent/core.ts` | Citas admitidas si su identificador está entre las fuentes. | Claim-evidence estructurado, pasaje comprobado y revisión semántica acotada de afirmaciones relevantes. |
| `apps/web/src/lib/today-data.ts`, alertas y migraciones | Ya existen parte diario, prioridades y programación de alertas. | Ampliar los datos y dependencias; evitar duplicar un tablero o usar IA para decidir reglas simples. |
| `neon/migrations/202607270001_foundation.sql` | Ya existe `jobs` con idempotencia, intentos y timestamps. | Extender lo necesario con checkpoints y leases. No crear otro sistema de colas sin necesidad demostrada. |
| `services/ai-gateway/wrangler.jsonc` | Cron cada cinco minutos. | Consolidar scheduling y medir actividad/costo. No agregar un cron de IA que recorra todas las causas. |

La documentación antigua del repositorio puede estar desactualizada. La implementación debe verificar código, migraciones posteriores y contratos actuales. Producción no fue inspeccionada con una sesión autenticada.

## Tareas, complejidad y dependencias

S = modificación localizada; M = varios módulos; L = datos + backend + UI + pruebas; XL = dependencias externas y validación jurídica/operativa. Son complejidades relativas, no estimaciones de días.

| ID | Tarea y salida concreta | Complejidad | Depende de | Uso de IA |
| --- | --- | --- | --- | --- |
| T0 | Baseline, fixture de evaluación, ledger y perfiles de presupuesto. | M | — | Sólo evaluación acotada. |
| T1 | Reservas atómicas, límites globales/por estudio, rutas de código y contexto compacto. | M | T0 | Menos llamadas de clasificación y planificación. |
| T2 | Jobs persistentes, lease con fencing, checkpoints, reintentos y UI de progreso. | L | T0–T1 | Infraestructura: cero IA. |
| T3 | Carpeta viva: hechos con fuentes, cronología, participantes, revisiones y versiones. | L | T2 | Lectura/visualización: cero IA. |
| T4 | Extracción incremental: texto/OCR, tipificación y hechos estructurados. | L | T2–T3 | Una extracción acotada por unidad nueva; reutilización. |
| T5 | Checklist configurable, dependencias, próxima acción y ampliación del parte diario. | M | T3–T4 | Reglas/SQL; texto opcional bajo demanda. |
| T6 | Accidentes de trabajo: cronología médica, prueba/faltantes, índice y preparación del reclamo. | L | T4–T5 | Reutiliza T4; síntesis sólo cuando se pide. |
| T7 | Salud: carpeta documental, borrador y seguimiento de obligaciones revisadas. | L | T4–T5 | Reutiliza T4; síntesis/escrito bajo demanda. |
| T8 | Laboral: recibos/comunicaciones, cronología y preparación de entrevista. | L | T4–T5 | Reutiliza T4; cálculos por código en T14. |
| T9 | Sucesiones: personas/vínculos documentados, bienes y etapas configurables. | L | T4–T5 | Reutiliza T4; sin inferir derechos por parentesco. |
| T10 | Plantillas aprobadas, editor/versiones, escrito por secciones, control de evidencia y DOCX. | L | T3–T4 | Redacción por secciones afectadas, con presupuesto global. |
| T11 | Importación manual + conector bonaerense verificado; novedades → propuestas. | XL | T2–T5 | Detección/dedupe sin IA; análisis sólo de novedades. |
| T12 | Investigación JUBA y fuentes autorizadas, pasajes, metadatos y antecedentes adversos. | L/XL | T1–T3, T10 | Recuperación acotada + análisis y validación. |
| T13 | Borradores al cliente, notas de voz, recepción documental y seguimiento de solicitudes. | M/L | T2–T5 | Mensajes/voz bajo demanda; no bot permanente. |
| T14 | Liquidaciones versionadas, honorarios y seguimiento económico. | XL para reglas jurídicas; M para gestión | T3, T8 | Matemática/Decimal y reglas revisadas; IA sólo explicación. |
| T15 | Evaluación de calidad/costo, seguridad, rendimiento y piloto con el abogado. | L, transversal | Desde T0 | Ensayos presupuestados y conjunto reservado. |

Orden: T0–T5 → T6/T7 → T10 → T8/T9 → T11/T12/T13 → T14. T15 acompaña todas las etapas. T11 puede adelantar su investigación de acceso mientras se construye el núcleo, pero una integración no verificada no se anuncia como activa.

## Arquitectura mínima

1. El frontend guarda una carga/solicitud y muestra el estado persistente. No orquesta procesos largos.
2. Una transacción cambia la versión de la fuente y encola el trabajo con idempotencia.
3. Un procesador Node compatible con los parsers actuales reclama el trabajo de forma atómica y breve, ejecuta un lote y guarda un checkpoint. Nunca mantiene un lock de base durante una llamada de IA.
4. Workers AI genera sólo lo que necesita lenguaje o extracción flexible. El gateway autentica perfiles y registra consumo.
5. Postgres conserva hechos, evidencia, revisiones, dependencias, presupuestos y estados. R2 conserva originales y artefactos grandes privados.
6. Las vistas calculan prioridades por reglas y recuperan resultados existentes. Procesos exhaustivos recorren fuentes versionadas; preguntas puntuales usan recuperación.

Reutilizar `jobs` y el scheduler existentes inicialmente. El trabajo puede ejecutarse en pasos dentro de las funciones Node existentes, verificando límites reales del plan. Si un parser o un job no cabe de forma fiable, separar el ejecutor Node con la alternativa compatible más pequeña; documentar costo y motivo. Cloudflare Queues es una opción posterior, no implica que PDF/OCR pesado deba ejecutarse en un Worker.

### Concurrencia y autorización

Punto de partida configurable: una ingesta pesada por ejecutor Node; una por causa; máximo dos generaciones globales y una por causa, aplicadas por almacenamiento compartido, no por variables de proceso. Los leases reservan cupos; expiración, heartbeat y fencing token impiden que un ejecutor viejo publique resultados tras ser reemplazado.

El worker ejecuta bajo identidad validada del solicitante o un rol de funciones estrechas, con alcance de estudio/causa. El scheduler actual no tiene permiso para leer libremente todos los datos: no ampliarlo a un rol propietario ni saltar RLS. Revalidar acceso antes de leer, llamar al modelo, publicar y aprobar. Las referencias entre tablas deben impedir enlaces entre estudios.

### Datos mínimos

Extender tablas actuales cuando corresponda. Candidatas nuevas: hechos/eventos de causa; enlaces de evidencia; definiciones/versiones/instancias de checklist; versiones de plantillas y borradores; consumo por intento y reservas. Agregar relaciones sólo si un flujo las usa: no levantar un knowledge graph ni un motor genérico de agentes.

Evidencia estable: documento/version/checksum, página o sección, offsets y pasaje. No depender sólo del UUID de un chunk que se destruye al reindexar. Estados diferenciados: relatado, extraído, confirmado, rechazado; correcciones conservan historia. Derivados grandes usan claves privadas con contratos de lectura/escritura propios, sin abrir el namespace de originales.

## Presupuestos iniciales propuestos

Son puntos de partida a ajustar con evaluación, no garantías. Los máximos incluyen instrucciones, herramientas, historial, evidencia, verificaciones, reintentos y todos los pasos. Contabilizar embeddings y reranking aparte y agregarlos al costo total. Una ventana de contexto por llamada no equivale al consumo acumulado de un trabajo.

| Perfil | Entrada acumulada máxima | Salida acumulada máxima | Llamadas de generación | Llamadas de herramientas |
| --- | ---: | ---: | ---: | ---: |
| Lista, dashboard, checklist, cálculo | 0 | 0 | 0 | Ejecución de código |
| Clasificación ambigua, si es necesaria | 1.500 | 128 | 1 | 0 |
| Respuesta operativa breve | 6.000 | 600 | 1 | 2 |
| Consulta documental | 12.000 | 1.200 | 2 | 4 |
| Extracción por lote de páginas | 8.000 | 1.200 | 2 incluyendo reparación | 0 |
| Escrito por secciones | 48.000 | 6.000 | 6 incluyendo revisión/reparación | 8 |
| Investigación jurídica acotada | 24.000 | 2.400 | 4 | 8; hasta 6 fuentes completas inicialmente |

Clasificación se deduce del presupuesto del flujo padre; no se agrega como consumo invisible. Un documento tiene varios lotes, por lo que necesita reserva agregada por documento antes de iniciarse. Calcular ese costo según tamaño y lotes: no prometer procesar todo documento dentro de 8.000 tokens. Un trabajo parcial se guarda y se etiqueta como parcial; nunca se transforma en un resumen supuestamente exhaustivo.

Reservar el máximo autorizado antes de cada llamada, incluyendo posible salida. Si no queda presupuesto, guardar avance y ofrecer un alcance menor. No truncar evidencia en medio de JSON o eliminar hechos críticos para encajar. El presupuesto diario de neurons/USD debe configurarse con la cuota real de cuenta, plan y otras cargas; no inventar una cifra mensual.

### Contabilidad de neurons y costo

Según [precios oficiales de Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) consultados el 2026-10-04:

- Qwen3 30B A3B: 4.625 neurons por millón de tokens de entrada y 30.475 por millón de salida.
- BGE-M3: 1.075 neurons por millón de entrada; reranker-base: 283 por millón de entrada.
- La tarifa publicada es USD 0,011 por 1.000 neurons; hay asignación gratuita diaria de 10.000 compartida en la cuenta, sujeta a condiciones del plan.

Ejemplo calculado: 6.000 tokens de entrada + 600 de salida en Qwen ≈ 46,035 neurons, o USD 0,000506 de inferencia a tarifa marginal. No incluye extracción previa, embeddings, reintentos, búsqueda, Vercel, base ni almacenamiento. Son estimaciones por tabla de tarifas, no consumo facturado observado.

Mantener tarifas versionadas con fuente y fecha. Medir tokens reales cuando el proveedor los devuelva; distinguir estimado/desconocido, nunca contar usage ausente como cero. Un timeout puede haber consumido recursos: reservar conservadoramente y reconciliar. La cuota de cuenta real requiere métricas del proveedor y no sólo el ledger de esta app.

## Ahorros sin degradar cobertura

- Comandos y botones de acciones deterministas evitan clasificación y planificación. Ambigüedad/negación/referencias conservan ruta segura; el backend exige evidencia independientemente de la etiqueta del modelo.
- No cambiar a un modelo pequeño sólo por tamaño. Comparar tarea aceptada, llamadas adicionales y costo total. Mantener Qwen como baseline hasta evaluar candidatos.
- Buscar por metadatos/identificadores primero para búsquedas exactas; usar FTS/híbrida para lenguaje libre. Limitar candidatos antes del rerank y medir recall bajo filtros/RLS.
- No construir una cronología global con los ocho fragmentos de una pregunta. Recorrer lotes de todas las fuentes relevantes, registrar cobertura y combinar hechos estructurados.
- Deduplicar dentro de alcance autorizado por hash + versión de parser/OCR/esquema/modelo. Compartir embeddings sólo con referencias y acceso correctamente separados; no revelar que otro estudio tiene un archivo.
- Estado normalizado y extractos citables sustituyen historia repetida. Un resumen es derivado, nunca autoridad probatoria.
- Al cambiar un archivo, actualizar sus extracciones y derivados dependientes; no regenerar todas las causas. Coalescer eventos, versionar dependencias e invalidar al borrar/revocar.
- Rerank y revisión semántica se usan donde mejoran resultados medidos. La verificación determinista de fuentes se mantiene siempre.
- Un reintento de red transitorio y una reparación estructural como máximo, si el presupuesto lo permite; no bucles de autocorrección ilimitados. No hacer fallback entre proveedores sin accounting y autorización de datos.
- No agregar LLMs periódicos ni polling permanente de IA. Polling de jobs sólo mientras hay trabajo visible y con backoff; scheduler concentra trabajo pendiente y evita escanear texto completo.

### Memoria

Conservar límites iniciales de archivos/OCR; no elevarlos hasta medir. En Node, una ingesta pesada a la vez, imports dinámicos, lotes de páginas/chunks y vectores serializados por lote. Liberar parser, canvases, buffers y workers en `finally`; soporte de cancelación.

Cloudflare documenta [128 MB por isolate](https://developers.cloudflare.com/workers/platform/limits/), compartidos por sus peticiones concurrentes. No confundirlos con RAM de Node/Vercel ni con la memoria del LLM remoto. Medir los tres runtimes: RSS/heap en Node, profiling del Worker y memoria del navegador cuando la plataforma lo permita. Umbral experimental Node: incremento de RSS ≤256 MiB para los fixtures admitidos y sin crecimiento sostenido en diez jobs; verificar pico nativo y límite real de host. No presentar ese umbral como garantía de todo PDF.

### Persistencia, caché y programación

Cachear vectores de consulta y resultados derivados versionados privados; revalidar acceso siempre. Evitar caché semántico de respuestas jurídicas y compartir texto entre actores sin control. TTL no sustituye invalidación por revocación. Identificar respuesta sin actualizarse y cobertura incompleta.

El [prompt caching de Workers AI](https://developers.cloudflare.com/workers-ai/features/prompt-caching/) sólo aplica a modelos compatibles. Ordenar prefijo estable primero ayuda cuando exista soporte; no asumir descuento para Qwen ni para nuestro gateway actual. Confirmar capability y métricas antes de contarlo como ahorro.

Las consultas frecuentes pueden mantener activa la base y alterar el ahorro de suspensión. Medir el cron de cinco minutos antes de añadir otros. No reducir frecuencia de alertas sin preservar su requisito de entrega; registrar ese tradeoff.

## Evaluación y aceptación

Empezar con al menos 32 escenarios sintéticos (ocho por especialidad), más pruebas adversas de permisos, citas, documentos contradictorios, OCR, cambios, concurrencia y presupuesto. Para exactitud jurídica, incorporar después casos y resultados esperados revisados por el abogado y reservar un conjunto que no se use para ajustar prompts.

Comparar flujo actual, chat general con los mismos documentos/consigna y dashboard; evaluar por separado la calidad del modelo y la integración operacional. Medir tiempo completo incluyendo revisión, costo por resultado aceptado, fidelidad de hechos/citas, faltantes detectados y cobertura de cronología.

Gates técnicos: cero llamadas IA en vistas deterministas; relectura sin cambios no duplica extracción/embeddings; ninguna llamada arranca sin reserva; replay y doble worker no duplican efectos; revocación invalida derivados/citas; presupuestos incluyen errores/reintentos; páginas omitidas se señalan. Las métricas p50/p95 se reportan con dataset, concurrencia y entorno, sin inventar cifras.

## Documentación oficial consultada

- [Anthropic: Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents): usar soluciones simples y workflows para tareas definidas.
- [Workers AI: Qwen3](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/): capacidades y contexto de 32.768 tokens por llamada.
- [PostgreSQL 17: SELECT](https://www.postgresql.org/docs/17/sql-select.html): `SKIP LOCKED` para consumidores de tablas de cola; reclamar y confirmar en transacciones cortas.
- [pgvector](https://github.com/pgvector/pgvector): filtrado y búsqueda aproximada pueden afectar recall; medir antes de ajustar índices o scans.
- [Cloudflare Queues: concurrency](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/): limitar consumidores puede ser apropiado para proteger sistemas upstream, a costa de backlog.

La investigación internacional de producto está en `product-research-2026-10-04.md`. El prompt ejecutable está en `agent-implementation-prompt.md`.
