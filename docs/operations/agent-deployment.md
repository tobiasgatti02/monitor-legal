# Preparación de despliegue del agente — 2026-10-04

No se desplegó ni se modificó una base externa. Las ampliaciones quedan deshabilitadas por defecto. El código requiere las migraciones nuevas incluso con flags apagadas: la contabilidad es obligatoria para cualquier llamada nueva de IA.

## Validación reproducible

`npm ci` utiliza el lockfile actual; no hay dependencias de aplicación nuevas. PostgreSQL local necesita pgvector. El script crea y destruye exclusivamente su propio cluster temporal en loopback, puerto 55439; aborta si el puerto ya está ocupado. No lee credenciales de bases externas.

```sh
PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config bash scripts/validate-agent-local.sh
```

En otros hosts, usar el `pg_config` de la instalación con pgvector. PostgreSQL 16 fue el host disponible en esta sesión; se debe repetir en PostgreSQL 17/Neon antes de promover. Los tests de integración usan RLS real y proveedor/R2 simulados. No verificar servicios externos contando esos mocks como llamadas reales.

El ensayo opcional del Worker se ejecuta con `LEGAL_TEST_MINIFLARE_MODULE=/ruta/al/miniflare/dist/src/index.js node scripts/agent-worker-local.mjs`, usando la instalación local de desarrollo existente. No instala dependencias ni usa credenciales Cloudflare, AI remoto o cron. Registra heap de workerd/R2 local; usa fecha de compatibilidad 2026-09-23 por límite del binario instalado. Repetir con la fecha objetivo y medir picos antes del piloto.

Para ejecutar sólo las pruebas normales: `npm run test:web`. Para SQL y recorrido durable, el script anterior inicia el cluster requerido. Los reportes generados están en `agent-*-validation.json`; no contienen documentos reales, prompts ni secretos. La fixture PDF es sintética, de tres páginas. Se comprobó visualmente el DOCX exportado con LibreOffice, tres páginas sin cortes ni superposiciones.

## Entorno aislado y orden de promoción

1. Recuperar autenticación de gestión del proyecto existente. El acceso de sólo lectura disponible respondió HTTP 401; no se creó un proyecto sustituto ni se usó `DATABASE_URL` para mutar una rama cuya identidad no se pudo comprobar.
2. Crear una rama schema-only/aislada del proyecto existente; confirmar identificadores de proyecto, rama y host. Usar datos sintéticos para los ensayos iniciales.
3. Ejecutar en orden las migraciones `202610040001` a `202610040009`, con conexión directa y rol de migración. Son aditivas; no borrar tablas previas. El rol de ejecución debe ser `monitor_runtime`, sin propietario/superusuario/BYPASSRLS. El scheduler conserva `monitor_scheduler`; `monitor_accounting` es NOLOGIN, no propietario de tablas y sin BYPASSRLS. No agregar membresías a runtime/scheduler para acceder a ese rol.
4. Publicar primero el gateway en un entorno de prueba, con R2 de prueba y su `SERVICE_KEY`. Verificar los perfiles coordinados y el namespace privado `derived/`. Conservar los contratos y tickets de los originales. No reutilizar el bucket de producción para pruebas destructivas.
5. Preparar web de prueba con Better Auth y conexiones actuales. Configurar `LEGAL_AI_URL/KEY` (compartido por IA y almacenamiento privado) conforme a los contratos ya existentes. Nunca exponer claves en `NEXT_PUBLIC_*`.
6. Habilitar `LEGAL_DURABLE_INGESTION`, después `LEGAL_LIVE_FOLDER` y `LEGAL_FACT_EXTRACTION`. Probar carga → cierre de pestaña → cron → revisión de hechos. Activar `LEGAL_DRAFTS` sólo con plantillas aprobadas; `LEGAL_RESEARCH` después del ensayo de lectura oficial y SSRF. MEV, SCBA Notificaciones, voz y liquidaciones jurídicas permanecen deshabilitadas.
7. Configurar en web `INGESTION_CRON_KEY` independiente y `DATABASE_SCHEDULER_URL`. En Worker, `INGESTION_CRON_URL` y `INGESTION_CRON_KEY`, apuntando sólo a la web de prueba. El cron existente sigue cada cinco minutos: entrega alertas y luego reclama un paso de ingesta. No agregar otro cron ni IA que recorra causas. La frecuencia afecta latencia del backlog y suspensión de la base; medir antes de cambiarla. Las preferencias de alertas y quiet hours se preservan.
8. Verificar límites del plan real del host Node: endpoint con `maxDuration=120`, lease 90 s y llamadas del gateway acotadas. Un paso toma un único original de hasta 5 MB, hasta 200 páginas, 500.000 caracteres; OCR local sigue hasta 30 páginas. No hay streaming del parser: requiere original entero. No prometer estabilidad de PDFs máximos a partir de la fixture pequeña.
9. Ensayo real acotado con destino simulado, límites y conciliación de Cloudflare. Evaluación con el abogado y conjunto reservado. La promoción a producción y cualquier envío real requieren autorización posterior del usuario.

## Presupuestos y consumo

`ai_profiles` y `ai_limits` se administran del lado servidor/migración. Límites iniciales diarios UTC: actor 500, estudio 2.500, aplicación 5.000 neurons; son techos locales experimentales, no la cuota de cuenta Cloudflare. Generación: uno por actor/causa, dos globales/estudio. Ingesta: un lease global. La clasificación consume el presupuesto padre. Embeddings/rerank, reintentos y reparación figuran por intento.

Se reserva antes de llamar; una extracción calcula su costo agregado y retiene saldo antes del primer lote. Si excede el perfil o cruza el día UTC, queda parcial; el usuario debe continuar expresamente por un máximo de seis unidades. Continuar libera el remanente anterior y crea otro segmento limitado. No resetear cuotas para que una prueba pase.

`usage` ausente conserva reserva no nula y origen estimado; un timeout queda incierto. USD y neurons son estimaciones de tarifa marginal, no factura ni consumo de otras apps. Verificar y versionar tarifas antes de cambiarlas. No contar prompt caching ni proveedores alternativos como ahorro sin confirmar soporte/usage.

## Backfill acotado

Los originales existentes se conservan; las citas legadas sin versión/artefacto requieren reindexación y se muestran desactualizadas. No hacer reextracción global automática. En una rama autorizada, listar metadatos de hasta 20 documentos accesibles con `artifact_key` ausente, estado `STALE` o parser anterior; usar las acciones de reindexar del módulo Documentos bajo la identidad del abogado, revisar cobertura y ledger, y pasar al siguiente grupo sólo tras aceptar el anterior. El idempotency key combina documento/hash/parser/OCR. La extracción y vectores de unidades vigentes se reutilizan. Las fuentes confirmadas antiguas quedan para revisión, nunca se sobrescriben.

Si se automatiza ese paso más adelante, reutilizar `queueStatement` dentro de una transacción bajo actor/RLS, con proyección de IDs y lote fijo; no ejecutar cargas sin scope como propietario ni copiar texto entre estudios.

## Regresión y rollback

Apagar `LEGAL_DRAFTS` o `LEGAL_RESEARCH` detiene sus endpoints; apagar `LEGAL_FACT_EXTRACTION` evita extraer hechos nuevos. Apagar `LEGAL_DURABLE_INGESTION` detiene el ejecutor y conserva jobs/originales. Las cargas finalizadas continúan guardando fuente y encolando; su índice queda pendiente. Apagar `LEGAL_LIVE_FOLDER` oculta y deshabilita carpeta, procedimientos, importaciones y escenarios nuevos. Gestión, fuentes originales, honorarios y pagos siguen en sus módulos.

Desconfigurar sólo los nuevos `INGESTION_CRON_URL/KEY` del Worker para detener el disparo; preservar cron/secrets de alertas. Cancelar trabajos pendientes desde la UI aumenta fencing token: un worker viejo no puede publicar. No eliminar reservas inciertas ni tablas para aparentar ahorro.

Para volver al comportamiento previo de indexación síncrona, usar el despliegue anterior de web/gateway compatible; una flag no reintroduce ese código. Mantener migraciones aditivas y datos/auditoría para recuperar avances. No revertir schema mediante DROP ni borrar R2. Antes de volver a habilitar: repetir citas/acceso, presupuesto, concurrencia y revisión de fuente.

## Entradas pendientes

Modelos reales del abogado por especialidad/jurisdicción y aprobación de listas; reglas/índices de liquidaciones y resultados esperados; casos reservados para evaluación de calidad y tiempo de revisión; sesión legítima separada MEV y Presentaciones/Notificaciones; canal de comunicación/voz verificado y política de audio. El acceso público a JUBA identificado no equivale a búsqueda automatizada autenticada, texto completo ni vigencia jurídica validada.
