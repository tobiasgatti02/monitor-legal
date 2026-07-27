# ADR-0002: eventos judiciales canónicos e idempotentes

- Estado: aceptada
- Fecha: 2026-07-27

## Decisión

Todo conector produce `JudicialEvent`. El identificador de un evento PJN `NEW_CASE` se
deriva de tenant, fuente, tipo y hash normalizado. La base agregará una restricción única
equivalente para que reintentos y workers concurrentes sean seguros.

Se conserva por separado:

- texto original;
- texto normalizado;
- hash;
- fuente y URL;
- momento de detección;
- evidencia asociada;
- clasificación y revisión humana.

El conector detecta y normaliza. Persistencia, alertas, email y UI consumen el contrato,
pero no forman parte del scraper.
