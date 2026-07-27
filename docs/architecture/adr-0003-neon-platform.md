# ADR-0003: Neon como plataforma PostgreSQL

- Estado: aceptada
- Fecha: 2026-07-27

## Decisión

Monitor Legal usará:

- Neon Postgres como fuente de verdad;
- Better Auth actualizado, con sus tablas dentro de Neon, para identidad;
- consultas server-side siempre acotadas por actor y `tenant_id`;
- `@neondatabase/serverless` para migraciones y workers de confianza;
- almacenamiento de objetos desacoplado para documentos y evidencia pesada.

La aplicación web nunca recibirá `DATABASE_URL`. Los workers reciben una conexión separada
y escriben siempre con `tenant_id` e idempotency keys.

## Motivos

- Mantiene PostgreSQL estándar, branching y scale-to-zero.
- La identidad y los datos de negocio viven en el mismo PostgreSQL sin mezclar tablas.
- El driver HTTP evita conexiones TCP persistentes en Vercel y GitHub Actions.
- El límite gratuito de base de datos no es adecuado para PDFs, screenshots o traces.

## Riesgos y mitigaciones

- El SDK beta de Neon Auth fue descartado al detectar vulnerabilidades transitivas críticas.
- Better Auth queda aislado bajo `lib/auth` y fijado a una versión auditada.
- La conexión propietaria de migración puede omitir RLS: sólo se usa en CI/operaciones.
- Una futura Data API requerirá JWT/JWKS antes de acceder a tablas protegidas por RLS.
- Los workers no actúan como usuarios: usan una credencial distinta y auditan cada ejecución.
