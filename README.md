# Monitor Legal

Dashboard diario para estudios jurídicos argentinos. Reúne novedades judiciales, tareas,
plazos, clientes y seguimientos en una vista operativa “Hoy”.

La entrega conserva la automatización PJN existente para Gatti y Mazzarini, pero separa
extracción, normalización, persistencia y notificaciones. Neon Postgres es la nueva fuente
de verdad; el estado JSON continúa temporalmente como respaldo durante la migración.

## Estado actual

- Monitor PJN con Playwright y dos jobs independientes en GitHub Actions.
- Eventos judiciales canónicos, determinísticos e idempotentes.
- Escritura dual opcional: JSON + Neon.
- Esquema multi-tenant completo con roles, membresías, RLS y auditoría.
- Better Auth estable sobre Neon para identidad y sesiones.
- Dashboard “Hoy” responsive con modo demo sanitizado y lectura real desde Neon.
- CI para Python y web: pruebas, lint, formato, tipos y build.

Las pantallas restantes del producto (CRUD completo de clientes, causas, agenda,
documentos, honorarios y administración de conectores) siguen el plan incremental en
`docs/operations/migration-plan.md`.

## Arquitectura

```text
GitHub Actions / local worker
  └─ PJN Playwright
      └─ parser y normalizador
          ├─ estado JSON temporal
          ├─ alerta SMTP existente
          └─ eventos + sync_runs en Neon

Next.js
  ├─ Better Auth sobre Neon
  └─ consultas server-side con filtro tenant_id
```

Directorios principales:

```text
apps/web/                  Dashboard Next.js
workers/common/            Contratos compartidos
workers/pjn/               Conector, normalizador y sink Neon
neon/migrations/           Esquema PostgreSQL y Better Auth
neon/onboarding/           Alta inicial del estudio
tests/                     Caracterización y contratos Python
docs/                      ADR, seguridad y operación
```

## Desarrollo local

Requisitos: Python 3.12+, Node.js 22+ y Chromium de Playwright.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
playwright install chromium

npm ci
cp .env.example .env
```

Ejecutar el worker:

```bash
python main.py
```

Ejecutar la web con datos ficticios:

```bash
MONITOR_LEGAL_DEMO=true npm run dev
```

Abrir `http://localhost:3000`. El modo demo nunca usa expedientes reales.

## Configurar Neon

Crear un proyecto en Neon y guardar la conexión pooled como `DATABASE_URL` y la conexión
directa como `DATABASE_URL_UNPOOLED`. Aplicar:

```bash
psql "$DATABASE_URL_UNPOOLED" \
  -v ON_ERROR_STOP=1 \
  -f neon/migrations/202607270001_foundation.sql

psql "$DATABASE_URL_UNPOOLED" \
  -v ON_ERROR_STOP=1 \
  -f neon/migrations/202607270002_better_auth.sql
```

Configurar la web:

```dotenv
DATABASE_URL=postgresql://...
BETTER_AUTH_URL=https://tu-dominio.example
BETTER_AUTH_SECRET=un-secreto-aleatorio-de-al-menos-32-caracteres
MONITOR_LEGAL_ALLOW_SIGN_UP=true
MONITOR_LEGAL_DEMO=false
```

La interfaz no ofrece registro público. Para el primer usuario:

```bash
curl -X POST "https://tu-dominio.example/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d '{"name":"Administrador","email":"admin@estudio.com","password":"una-clave-segura"}'
```

Luego crear el tenant y ambos conectores:

```bash
psql "$DATABASE_URL_UNPOOLED" \
  -v owner_email='admin@estudio.com' \
  -v studio_name='Estudio Jurídico' \
  -f neon/onboarding/create_studio.sql
```

Después del alta inicial, cambiar `MONITOR_LEGAL_ALLOW_SIGN_UP=false` y volver a desplegar.

El procedimiento detallado y los secrets resultantes están en `neon/README.md`.

## Variables del worker PJN

- `PJN_USER`, `PJN_PASS`: credenciales de una cuenta PJN.
- `EMAIL_USER`, `EMAIL_PASS`: cuenta SMTP y App Password.
- `ALERT_EMAIL`: destinatario de esa cuenta.
- `PJN_HEADLESS`, `PJN_TIMEOUT_MS`, `PJN_RETRIES`: comportamiento del navegador.
- `PJN_STATE_PATH`: estado JSON temporal de esa cuenta.
- `DATABASE_URL`: conexión pooled de Neon; si falta, continúa el modo legado.
- `MONITOR_TENANT_ID`: UUID del tenant existente.
- `PJN_CONNECTOR_ID`: UUID del conector de esa cuenta.
- `NEON_REQUIRED`: `false` durante reconciliación; `true` cuando Neon sea obligatorio.
- `PJN_SYNC_TRIGGER`: `SCHEDULE` o `MANUAL`.
- `LOG_LEVEL`: `DEBUG`, `INFO`, `WARNING` o `ERROR`.

La automatización conserva los nombres existentes:

- Gatti: `PJN_USER_GATTI`, `PJN_PASS_GATTI`, `ALERT_EMAIL_GATTI`.
- Mazzarini: `PJN_USER_MAZZARINI`, `PJN_PASS_MAZZARINI`,
  `ALERT_EMAIL_MAZZARINI`.

Para Neon, ambos jobs comparten `DATABASE_URL` y `MONITOR_TENANT_ID`; cada uno recibe su
propio `PJN_CONNECTOR_ID_*`. El workflow comienza con `NEON_REQUIRED=false`, de modo que la
activación no interrumpe las alertas actuales.

## Códigos de salida

- `0`: ejecución correcta.
- `1`: error general de scraping.
- `2`: faltan variables requeridas.
- `3`: captcha o challenge detectado.
- `4`: login PJN fallido.
- `5`: extracción fallida.
- `6`: envío SMTP fallido.
- `7`: guardado de estado JSON fallido.
- `8`: persistencia Neon fallida cuando `NEON_REQUIRED=true`.

## Calidad

```bash
.venv/bin/pytest
.venv/bin/ruff check .
.venv/bin/ruff format --check .
npm run lint:web
npm run typecheck
npm run test:web
npm run build
```

## Seguridad

No versionar `.env`, conexiones, contraseñas ni archivos de estado reales. Los secrets se
mantienen sólo en GitHub Actions y en el proveedor de despliegue. Las credenciales que se
hayan compartido por texto deben rotarse antes de conectar cuentas reales.

La limpieza del antiguo `state.json` en el historial Git es una operación separada: el
archivo ya no está en la rama actual, pero los objetos históricos no fueron reescritos.
Ver `docs/security/audit-2026-07-27.md`.
