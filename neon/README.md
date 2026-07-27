# Neon Postgres

Neon es la fuente de verdad del producto. El JSON local sigue temporalmente como mecanismo
de compatibilidad del monitor PJN durante la escritura dual.

## Variables

- `DATABASE_URL`: conexión pooled, sólo backend/workers y migraciones.
- `DATABASE_URL_UNPOOLED`: conexión directa para herramientas que la requieran.
- `BETTER_AUTH_URL`: origen público de la aplicación.
- `BETTER_AUTH_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `MONITOR_TENANT_ID`: UUID del estudio.
- `PJN_CONNECTOR_ID`: UUID de la cuenta PJN que ejecuta ese worker.

No colocar ninguna de estas variables en Git.

## Aplicar migraciones

Con una rama de Neon creada:

```bash
psql "$DATABASE_URL_UNPOOLED" \
  -v ON_ERROR_STOP=1 \
  -f neon/migrations/202607270001_foundation.sql

psql "$DATABASE_URL_UNPOOLED" \
  -v ON_ERROR_STOP=1 \
  -f neon/migrations/202607270002_better_auth.sql
```

Better Auth guarda identidad y sesiones en el mismo Neon Postgres, pero en tablas separadas
del perfil de negocio. Las migraciones deben ejecutarse con la conexión directa.

## Crear el primer usuario y estudio

1. Desplegar la web con `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` y
   `MONITOR_LEGAL_ALLOW_SIGN_UP=true`.
2. Registrar una única cuenta inicial contra `POST /api/auth/sign-up/email`. No se expone
   registro público en la interfaz.
3. Crear el estudio y los dos conectores:

```bash
psql "$DATABASE_URL_UNPOOLED" \
  -v owner_email='admin@estudio.com' \
  -v studio_name='Estudio Jurídico' \
  -f neon/onboarding/create_studio.sql
```

El script devuelve los tres UUID necesarios. Configurar en GitHub:

- `DATABASE_URL`: secret compartido.
- `MONITOR_TENANT_ID`: secret compartido por ambos jobs.
- `PJN_CONNECTOR_ID_GATTI`: secret exclusivo del job Gatti.
- `PJN_CONNECTOR_ID_MAZZARINI`: secret exclusivo del job Mazzarini.
- `NEON_REQUIRED`: variable del repositorio; comenzar con `false` y cambiar a `true`
  sólo después de reconciliar varias corridas.

4. Cambiar inmediatamente `MONITOR_LEGAL_ALLOW_SIGN_UP=false` y volver a desplegar.

El worker usa transacciones e inserción idempotente. No persiste las credenciales PJN ni
SMTP en Postgres.

## Entornos

- Una rama `main` para producción.
- Una rama efímera por pull request cuando se automatice preview.
- Una rama `development` opcional para datos ficticios.

Nunca copiar expedientes reales a previews. Los seeds sólo contienen personas ficticias.
