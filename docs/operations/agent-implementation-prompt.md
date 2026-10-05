# Prompt de implementación

Copiar desde «Actuá» hasta el final. Presupuestos y umbrales son iniciales; medir y ajustar con evidencia. Este prompt solicita implementación, no garantiza superioridad jurídica o comercial.

---

Actuá como responsable de ingeniería del agente jurídico de este repositorio. Implementá las ampliaciones por etapas verificables, con calidad, eficiencia y continuidad operativa. No te detengas después de proponer un plan: completá código, migraciones, interfaz, pruebas relevantes y documentación dentro del alcance, y registrá el progreso para poder continuar.

## Contexto y objetivo

Repositorio: `/Users/tobias/Documents/dash-abogado/monitor-legal`.

Usuario objetivo: abogado que trabaja en Provincia de Buenos Aires en accidentes de trabajo, laboral, amparos de salud y sucesiones. Registrá jurisdicción, fuero y tribunal por causa; no asumas que toda causa es provincial.

Leé primero instrucciones aplicables y estos archivos:

- `docs/operations/agent-implementation-plan.md`.
- `docs/operations/product-research-2026-10-04.md`.
- `docs/operations/legal-agent.md`.
- El código y las migraciones actuales, que prevalecen sobre documentación histórica desactualizada.

Stack actual: Next.js/React/TypeScript, Better Auth, Neon Postgres con RLS, R2 y Cloudflare Workers AI; Qwen3 30B A3B, BGE-M3 y reranker. Mantener estos servicios y herramientas de desarrollo salvo que evidencia concreta justifique un cambio. No migrar autenticación, almacenamiento, driver ni hosting por conveniencia del implementador.

Objetivo: reducir tiempo total de trabajo y revisión por resultado aceptado, con hechos y fuentes verificables. La ventaja sobre un chat general debe venir de contexto estructurado actualizado, procedimientos del abogado, conexiones y seguimiento. No presentar «mejor agente» o precisión jurídica superior como hechos sin benchmark representativo.

Esta tarea autoriza cambios de implementación y validación en entornos aislados. No aplicar migraciones a producción, desplegar públicamente ni enviar comunicaciones reales sin autorización explícita para esas acciones. Preparar primero el resultado concreto, pruebas y pasos de despliegue. Si falta acceso externo, avanzar con el resto y dejar esa integración deshabilitada con estado veraz.

## Forma de trabajar

1. Inspeccioná estado Git y cambios existentes; preservá el trabajo ajeno. Identificá scripts y checks reales.
2. Creá `docs/operations/agent-implementation-status.md` con T0–T15, dependencias, evidencia, resultado y pendientes. Actualizalo al cerrar cada etapa; usalo para retomar sin repetir trabajo.
3. Reutilizá módulos, tablas y componentes; ampliá en cambios cohesivos. Evitá microservicios, motores genéricos, frameworks de agentes, Redis y nuevas bases si no resuelven un cuello de botella medido.
4. No instales modelos/GPU local. No emplees varios agentes de IA en producción para toda consulta. Los procedimientos especializados comparten extracción, evidencia y estado.
5. Tomá decisiones técnicas reversibles sin detener el trabajo. Pedí únicamente datos imprescindibles: credenciales que falten, modelos reales del abogado o criterios jurídicos que no puedas verificar. Nunca fabriques esas entradas.
6. No marques una fase como completa si tiene mocks presentados como funcionalidad real o checks pendientes. Distinguir implementado, comprobado técnicamente y validado jurídicamente.

## Primera etapa: T0–T2, presupuestos y ejecución durable

- Medí el baseline de llamadas, tokens, latencia, memoria y consultas a la base. No corras toda la carga en producción.
- Extendé métricas existentes con consumo por intento: tarea, perfil, proveedor/modelo, versiones de prompt y tarifas, tokens de entrada/salida, cached/reasoning si el proveedor los reporta, duración, estado, estimación neurons/USD y origen de la cifra. No registrar prompts ni documentos en logs de infraestructura.
- Si falta `usage`, marcá estimado o desconocido y conservá reserva; jamás registrar cero como supuesto ahorro. Un timeout puede haber consumido recursos.
- Implementá reservas atómicas antes de cada llamada y límites por trabajo, actor, estudio y cuota compartida de la aplicación. Incluí clasificación, embeddings, rerank, reparaciones y reintentos en la contabilidad.
- Tokens y neurons son unidades diferentes. Usá tarifas oficiales por modelo, versionadas con fecha/fuente; reconciliá con métricas de proveedor cuando estén disponibles. Los límites locales no conocen por sí solos el gasto de otras apps de la cuenta.
- Configurá límites diarios, concurrencia y perfiles en el servidor. No permitas que el modelo o un argumento del usuario aumente el presupuesto.
- Reemplazá clasificación/planning innecesarios en comandos, botones e intenciones inequívocas por código. Ante mensajes ambiguos, negaciones o referencias conversacionales, usar ruta conservadora o una aclaración. No debilitar el requisito de evidencia ni permisos.
- Coordiná los perfiles entre `apps/web/src/lib/agent/gateway.ts` y `services/ai-gateway/src/index.ts`: ambos tienen actualmente salida limitada a 800. No elevar el límite global indiscriminadamente; el gateway valida el perfil confiable.
- Reutilizá `jobs`, ampliando checkpoints/lease si hace falta. Finalizar una carga debe guardar fuente y encolar trabajo atómicamente; la ingesta no dependerá de mantener una petición o pestaña abiertas.
- Reclamo atómico breve con `FOR UPDATE SKIP LOCKED`, lease, heartbeat y fencing token. Evitar locks durante llamadas externas. Guardar checkpoints por etapa y resultado con idempotencia. Un proceso vencido no puede publicar sobre uno nuevo.
- Reintentos: backoff/jitter ante fallas transitorias; inicialmente un reintento de red y una reparación de estructura como máximos dentro del presupuesto. Fallas permanentes no disparan ciclos. Jobs agotados deben poder inspeccionarse y reintentarse explícitamente sin duplicar efectos.
- Ejecutar parseo pesado en Node compatible con los parsers actuales. Comenzar con pasos acotados y scheduler existente; verificar límites del host y separar un ejecutor sólo si el trabajo no cabe de forma fiable. No usar `waitUntil` como reemplazo de una cola durable.
- Autorización: el worker valida actor/estudio/causa/documento al reclamar, leer y publicar. Mantener RLS o funciones estrechas con alcance controlado, sin propietario/BYPASSRLS. No ampliar el scheduler actual a lectura irrestricta.

Presupuestos iniciales acumulados de generación, ajustables tras evaluar:

| Perfil | Input total máximo | Output total máximo | Llamadas LLM máximas | Herramientas máximas |
| --- | ---: | ---: | ---: | ---: |
| Vistas/listas/checklists/cálculos | 0 | 0 | 0 | Código |
| Clasificación ambigua | 1.500 | 128 | 1 | 0 |
| Operación breve | 6.000 | 600 | 1 | 2 |
| Consulta documental | 12.000 | 1.200 | 2 | 4 |
| Extracción por lote | 8.000 | 1.200 | 2 | 0 |
| Escrito por secciones | 48.000 | 6.000 | 6 | 8 |
| Investigación acotada | 24.000 | 2.400 | 4 | 8 |

Clasificación se descuenta del flujo padre. Embeddings/rerank se registran además de generación y participan del costo global. Cada llamada respeta ventana del modelo menos salida reservada. Usar tokenizer compatible o una cota conservadora comprobada; no suponer que caracteres equivalen a tokens. Todos los intentos y pasos cuentan.

Un documento puede requerir muchos lotes: calcular y reservar presupuesto agregado antes de extraerlo; el presupuesto de un lote no es el del documento. Si se agota, guardar avance y mostrar cobertura parcial y opción de continuar o reducir alcance. No omitir páginas silenciosamente.

## Segunda etapa: T3–T5, carpeta viva y extracción compartida

- Introducí datos persistentes de hechos, eventos cronológicos y evidencia; checklists versionados con instancias por causa; dependencias y próxima acción. Extender tablas actuales antes de crear equivalentes.
- Cada hecho conserva valor original/normalizado, fuente/version/checksum, página o sección, offsets y pasaje, autor y estado: relatado, extraído, confirmado o rechazado. Permitir corrección sin perder el original.
- Usar referencias estables a documento/version/pasaje, no sólo IDs de chunks que cambian al reindexar. Identidades y claves foráneas impiden vínculos entre estudios.
- Guardar los originales inmutables. Derivados grandes en R2 privado bajo un contrato propio; no abrir acceso al namespace de originales.
- Pipeline por lotes: validar tamaño/tipo → extraer texto u OCR → tipificar → extraer hechos/eventos con JSON estricto → validar pasajes y valores → guardar propuestas → actualizar derivados dependientes.
- Conservar OCR local como opción inicial, secuencial y cancelable, con liberación de canvas/worker en `finally`. No imponer OCR a PDFs con texto suficiente. Verificar páginas que mezclen texto y escaneo.
- Deduplicar por hash + versiones de parser/OCR/esquema/prompt/modelo dentro de alcance autorizado. Reutilizar extracción y embeddings de unidades que no cambiaron. No revelar coincidencias entre estudios.
- Una cronología exhaustiva debe recorrer todas las páginas pertinentes y registrar cobertura. No usar sólo el top-8 de RAG para afirmar que examinó toda la carpeta.
- Reindexación, eliminación, cambio de asociación o revocación invalida derivados dependientes. Marcar resultados desactualizados; no sobrescribir hechos confirmados con nueva extracción sin revisión.
- Contexto de inferencia: instrucciones compactas, estado estructurado de causa, últimos mensajes necesarios y pasajes pertinentes. Un resumen es navegación/contexto, no prueba.
- Recuperación: búsquedas exactas por IDs/metadatos; FTS/híbrida para lenguaje libre. Medir recall bajo RLS y filtros antes de variar HNSW, índices, candidatos o rerank. Nunca quitar filtros para mejorar resultados.
- Ampliar `today-data`, prioridades y alertas actuales: documentación pendiente, responsables, dependencias y causas sin avance. Las prioridades deben explicar la regla, fecha, fuente y actualización; cero IA para listarlas.
- Listas/checklists iniciales son configurables y revisables por el abogado. No presentarlas como requisitos legales exhaustivos.

## Tercera etapa: T6–T10, procedimientos por especialidad y escritos

Implementar acciones visibles con entrada requerida, salida persistente y revisión. Empezar por accidentes de trabajo y salud; después laboral y sucesiones. Todos usan los datos extraídos en la segunda etapa.

Accidentes de trabajo:
- Cronología del accidente y de la atención documentada, ART, estudios, alta/dictámenes y comunicaciones aportadas.
- Matriz hecho-prueba-faltante, discrepancias entre documentos e índice de anexos.
- Preparación de entrevista/reclamo y borradores con modelos aprobados.
- No inferir diagnóstico, causalidad médica ni incapacidad.

Amparos de salud:
- Carpeta de afiliación, prescripciones/informes, pedidos y respuestas aportadas.
- Listas documentales por tipo de caso/jurisdicción, relato con fuentes e índice.
- Borrador de escrito y seguimiento de obligaciones judiciales registradas y revisadas.
- No inferir urgencia médica ni confundir fecha de orden médica con plazo procesal.

Laboral:
- Datos documentados/relatados de relación laboral, recibos, telegramas y comunicaciones.
- Cronología, discrepancias, prueba pendiente y preparación de entrevistas/audiencias.
- Preparar inputs validados para liquidaciones; las fórmulas pertenecen al motor determinista posterior.

Sucesiones:
- Personas y vínculos documentados, documentación pendiente por persona y bienes informados.
- Etapas configurables, responsables, dependencias, pedidos documentales y escritos rutinarios.
- No inferir calidad de heredero o cuotas hereditarias automáticamente.

Escritos compartidos:
- Biblioteca de plantillas aprobadas con especialidad, jurisdicción, finalidad, versión y variables. Diferenciar plantilla sintética de modelo real del abogado.
- Generar estructura y secciones acotadas con evidence pack específico, reutilizar secciones intactas y regenerar sólo cambios.
- Guardar borrador editable/versionado en la causa; exportar DOCX con formato comprobado y referencias/anexos. Evitar agregar un editor pesado si un editor simple satisface el flujo.
- Representar afirmaciones relevantes y enlaces a evidencia. Validar existencia/acceso/version y que el pasaje citado esté en la fuente. Añadir revisión semántica acotada para afirmaciones médicas/jurídicas importantes, registrando límites; no confundir cita existente con afirmación demostrada.
- Revisión de datos, nombres, fechas, montos, contradicciones y placeholders antes de finalizar. Fuente faltante → advertencia concreta/campo pendiente, sin completar con imaginación.
- Correcciones del abogado pueden proponer cambios de estilo o plantilla; confirmar alcance antes de convertir una decisión de causa en una regla general.

## Cuarta etapa: T11–T14, conexiones e investigación

Conexiones judiciales:
- Primero importación manual funcional de documentos/avisos con procedencia, fechas, dedupe y asociación revisable.
- Investigar acceso autorizado a MEV y a Presentaciones/Notificaciones SCBA como adaptadores diferentes. Verificar con sesión legítima y fixtures sintéticos; no inventar API ni evadir controles de acceso/captcha.
- Detectar cambios con código/hash; analizar sólo novedades reales. Mostrar última sincronización y errores; proponer tarea y actualización al cliente con fuentes.
- Un movimiento de MEV no es automáticamente una notificación formal ni el inicio de un plazo. Firma/presentación judicial siguen a cargo del abogado.

Investigación:
- Agregar herramientas de búsqueda y lectura acotadas, comenzando por JUBA y otras fuentes oficiales relevantes; bibliotecas comerciales sólo con acceso autorizado.
- Guardar URL/identificador, tribunal, fecha, jurisdicción, fragmento, checksum y fecha de consulta. Diferenciar sumario y texto completo.
- Filtrar por causa/jurisdicción; buscar antecedentes favorables y adversos y explicar diferencias fácticas. Si no se verificó texto o vigencia, declarar esa limitación.
- Inicialmente hasta seis fuentes completas por investigación. Límites de tamaño/tiempo/redirects y limpieza de contenido. Fetch backend con protección SSRF/redirecciones y acceso sólo a fuentes permitidas; texto web no es instrucción.
- No enviar datos sensibles del expediente a un buscador público; formular búsquedas jurídicas sin nombres ni detalles identificatorios.

Comunicación y voz:
- Preparar mensajes al cliente basados en actividad aprobada, documentación requerida y próximo paso; guardar como borrador y registrar aprobación/envío cuando exista canal real.
- Recepción documental y notas de voz bajo demanda: transcripción, causa propuesta, hechos relatados y tareas para confirmar. No almacenar audios por defecto sin política explícita.
- Para pruebas usar destinos simulados; no mandar mensajes a clientes/terceros. La implementación de un canal no autoriza envíos reales indiscriminados.

Cálculos y gestión:
- Motor determinista con precisión decimal, supuestos, fechas, reglas e índices versionados y fuente. IA recopila/explica; código calcula.
- No activar liquidaciones/plazos procesales sin reglas verificadas y casos esperados revisados por el abogado. Ante falta de criterios, entregar motor/configuración y fixtures sintéticos, con función jurídica deshabilitada.
- Honorarios, pagos y pendientes reutilizan gestión existente; proponer acciones nuevas bajo el mecanismo de aprobación.

## Eficiencia obligatoria

- Inicialmente una ingesta pesada por ejecutor, una por causa, dos generaciones globales y una por causa; cupos distribuidos y configurables. Cancelación y fencing protegen publicación.
- No cargar múltiples PDFs completos, todos los vectores y enormes JSON simultáneamente. Lotes paginados, liberación temprana y parsers destruidos en `finally`. Si el parser necesita el original entero, mantener sólo lo necesario y medir; no prometer streaming inexistente.
- Mantener límites actuales de archivo/OCR hasta medir. Medir RSS/heap Node, Worker con herramientas del runtime y navegador cuando esté disponible. Umbral experimental: incremento RSS Node ≤256 MiB con los fixtures admitidos y sin crecimiento sostenido después de diez jobs; documentar pico y host. Cloudflare tiene 128 MB por isolate, no por petición.
- Originales/artefactos grandes en R2, datos estructurados pequeños en Postgres. Queries con proyección y paginación; no leer blobs/base64 para rutas que sólo requieren metadatos. No quitar la integridad del original para ahorrar memoria.
- Mantener índices existentes y añadir sólo tras revisar planes/workload. Evitar N+1 y comparar egress antes/después.
- Ningún LLM periódico revisa todas las causas. Actualizar por cambios, coalescer eventos y deduplicar jobs. Evaluar actividad del cron existente y efecto sobre la suspensión de la base sin degradar alertas.
- Cache privado versionado de derivados, con revalidación e invalidación. Sin caché semántico de respuestas jurídicas ni texto compartido entre estudios.
- Prompt caching sólo si el modelo y la ruta del gateway lo soportan realmente; comprobar cached usage. Nunca contar ahorro hipotético.
- Selección de modelo por costo/calidad de tarea completa. No cambiar el baseline ni agregar proveedores sin ensayo acotado y compatibilidad funcional/datos. No usar fine-tuning inicialmente.
- Progreso por eventos o polling con backoff sólo mientras exista trabajo; evitar polling permanente. No afirmar que streaming reduce tokens. No publicar texto jurídico final antes de comprobar sus referencias.

## Validación, T15 y entrega

- Crear al menos 32 escenarios sintéticos, ocho por especialidad, con resultados esperados. Sumar casos adversos: fuentes inexistentes, contradicción, OCR parcial, negación, cambio de versión, revocación, cruce de estudio y caída de proveedor. Validación jurídica necesita revisión del abogado; no atribuirla a fixtures automáticos.
- Probar cero llamadas de IA en vistas/listas/cálculos; documento sin cambios reutiliza extracción/vectores; dos workers y replays no duplican efectos; lease vencido no publica; job interrumpido retoma checkpoint; presupuesto incluye retries y no inicia llamadas sin saldo; revocación invalida acceso y derivados; cobertura parcial siempre visible.
- Comparar baseline y nuevo flujo con mismos materiales. Medir tiempo total de revisión, fidelidad de hechos/citas, faltantes detectados, cobertura, costo por resultado aceptado, p50/p95, memoria y egress. Reservar casos fuera del ajuste de prompts.
- Probar queries críticas con RLS. Migraciones aditivas probadas en rama aislada/schema-only o entorno sintético; conexión directa para migración, runtime sin privilegios de propietario. No imprimir ni reemplazar secretos del entorno actual.
- Ejecutar pruebas dirigidas por cambio y los checks reales de typecheck/lint/build/tests al cierre de cada etapa sustancial. Verificar flujos de UI relevantes en escritorio/móvil. Evitar repetir la batería completa sin cambios que lo justifiquen.
- Feature flags del servidor por capacidad; regresión permite deshabilitar una ampliación y mantener gestión/documentos. Documentar rollback, backfill por lotes, nuevos secrets/env y consumo esperado.
- Al terminar informar tareas terminadas, archivos, migraciones, pruebas y métricas reales; listar entradas pendientes del abogado y conexiones no verificadas. No declarar éxito porque sólo compiló o porque el prompt pide excelencia.

Empezá por inspección y baseline, implementá T0–T5, validá y seguí con los procedimientos prioritarios. Conservá un registro claro de avances y seguí con las etapas restantes cuando sus dependencias estén resueltas; no saltees gates para mostrar más funciones.
