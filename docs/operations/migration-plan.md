# Plan de migración por cambios pequeños

Cada punto representa un cambio revisable y desplegable, no una reescritura masiva.

1. `test: characterize legacy PJN parsing and state`
   - fixtures sanitizados, normalización, comparación y email.
2. `refactor: introduce canonical judicial event contract`
   - parser puro, hash e identificador idempotente.
3. `security: stop tracking case state and narrow workflow permissions`
   - estado fuera de Git y permisos mínimos.
4. `feat(db): add Neon tenant foundation and RLS`
   - migraciones PostgreSQL reproducibles, Neon Auth, roles, pertenencia y auditoría.
5. `feat(web): add authenticated legal workspace shell`
   - layout, navegación y estados de carga/error.
6. `feat(domain): add clients leads cases and tasks`
   - APIs paginadas y validación compartida.
7. `feat(pjn): dual-write new cases as canonical events` — implementado
   - JSON temporal + PostgreSQL, sin retirar alertas actuales.
8. `feat(today): prioritize events tasks deadlines and communications` — primera versión
   - feed diario y acciones rápidas.
9. `feat(notifications): add outbox email telegram and WhatsApp drafts`
   - deduplicación, aprobación y quiet hours.
10. `ops: remove legacy JSON path after reconciliation`
    - sólo después de comparar resultados de ambas rutas.

## Puertas de calidad

Cada cambio debe pasar unit tests, lint, typecheck, migraciones reproducibles y una revisión
de ausencia de secretos. Los smoke tests PJN son manuales, no destructivos y nunca intentan
resolver captcha.
