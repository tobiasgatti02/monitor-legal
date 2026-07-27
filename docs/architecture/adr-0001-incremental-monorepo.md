# ADR-0001: evolución incremental a monorepo

- Estado: aceptada
- Fecha: 2026-07-27

## Contexto

El monitor PJN ya opera para dos cuentas. Una reescritura simultánea del scraper, la
persistencia y la interfaz aumentaría el riesgo de perder alertas.

## Decisión

Se aplicará un patrón de reemplazo progresivo:

1. Mantener `main.py` y `.github/workflows/monitor.yml` como entrada compatible.
2. Extraer parsers puros, normalización y contratos debajo de `workers/`.
3. Publicar el resultado en PostgreSQL además del JSON durante una ventana dual.
4. Construir `apps/web` y paquetes compartidos sin mover el legado de una sola vez.
5. Retirar JSON/email directo sólo cuando la base, el outbox y las alertas estén verificadas.

## Consecuencias

- Durante la transición habrá adaptadores y algo de duplicación explícita.
- Cada paso admite rollback sin perder el monitor operativo.
- Los conectores no conocerán React, SMTP ni tablas de presentación.
- La fuente de verdad final será PostgreSQL con RLS; los artifacts quedarán como evidencia.
