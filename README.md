# Monitor automatico PJN (expedientes nuevos + alerta email)

Sistema de monitoreo 24/7 para detectar expedientes nuevos en el Poder Judicial de la Nacion Argentina y enviar alerta por email.

## Decision tecnica importante

Se evaluo `requests + session scraping`, pero el flujo real observado redirige a SSO (Keycloak/OIDC) en `sso.pjn.gov.ar`, con tokens de sesion, redirects y formulario dinamico.

Por estabilidad en produccion, se usa **Playwright** (navegador real) con modo headless, delays humanos leves, user-agent realista y selectores resilientes.

## Estructura del proyecto

```text
.
  main.py
  requirements.txt
  state.json
  .env.example
  utils/
    mailer.py
    scraper.py
    storage.py
  .github/workflows/monitor.yml
  README.md
```

## Flujo automatico

1. Abre `https://scw.pjn.gov.ar/scw/consultaListaRelacionados.seam`
2. Si corresponde, autentica en SSO PJN.
3. Vuelve al listado de relacionados.
4. Extrae expedientes desde tablas, filas, listas y anchors.
5. Compara contra `state.json`.
6. Si hay nuevos, envia email.
7. Guarda nuevo estado.

## Requisitos

- Python 3.12+
- Cuenta Gmail para SMTP (recomendado App Password)
- Credenciales PJN validas

## Instalacion local

```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
```

Completar `.env` con tus valores reales.

## Variables de entorno

- `PJN_USER`: usuario PJN
- `PJN_PASS`: password PJN
- `EMAIL_USER`: gmail emisor
- `EMAIL_PASS`: app password de gmail
- `ALERT_EMAIL`: destino de alertas (default `Gattilegales@gmail.com`)
- `PJN_HEADLESS`: `true` o `false`
- `PJN_TIMEOUT_MS`: timeout de navegacion (default 45000)
- `PJN_RETRIES`: reintentos de scraping (default 2)
- `PJN_STATE_PATH`: ruta de estado JSON (default `state.json`)
- `LOG_LEVEL`: `DEBUG`, `INFO`, `WARNING`, `ERROR`

## Ejecucion local

```bash
python main.py
```

Codigos de salida:

- `0`: OK
- `2`: faltan variables requeridas
- `3`: captcha/challenge detectado
- `4`: login fallido
- `5`: extraccion fallida
- `6`: fallo de envio email
- `7`: fallo guardando estado
- `1`: fallo general scraping

## Deploy en GitHub Actions (cada 1 hora)

Workflow: `.github/workflows/monitor.yml`

Disparadores:

- `schedule: 0 * * * *`
- `workflow_dispatch`

### Secrets obligatorios en GitHub

En tu repo -> Settings -> Secrets and variables > Actions > New repository secret:

- `EMAIL_USER` (compartido para todos los usuarios)
- `EMAIL_PASS` (compartido para todos los usuarios)

**Jobs separados en GitHub Actions:**

- `monitor-gatti` usa `PJN_USER_GATTI` / `PJN_PASS_GATTI` / `ALERT_EMAIL_GATTI`
- `monitor-mazzarini` usa `PJN_USER_MAZZARINI` / `PJN_PASS_MAZZARINI` / `ALERT_EMAIL_MAZZARINI`

Cada job tiene su propio estado:

- `state_gatti.json`
- `state_mazzarini.json`

Para el caso de Mazzarini, el mail de alerta debe ser `mazzariniagustin@gmail.com`.

## Persistencia de archivos de estado

El workflow:

1. Ejecuta `monitor-gatti` y `monitor-mazzarini` como jobs separados.
2. Cada job usa su cuenta PJN y su propio archivo de estado.
3. Sube artifact del estado de cada cuenta en cada corrida.

Esto permite continuidad de estado entre ejecuciones por usuario.

## Seguridad

- No hay credenciales hardcodeadas en código.
- Solo se usan variables de entorno/secrets.
- `state_<user>.json` guarda solo expedientes detectados y metadatos (sin passwords).

## Troubleshooting

1. Login cae o queda en SSO:
   - Verificar credenciales PJN.
   - Revisar logs del job en Actions.
2. Captcha detectado:
   - El monitor sale con codigo 3 para no romper estado.
   - Reintentar luego; algunos desafios son temporales.
3. No extrae expedientes:
   - Posible cambio de HTML en SCW.
   - Activar `LOG_LEVEL=DEBUG` y revisar salida.
4. Gmail rechaza login SMTP:
   - Usar App Password, no password normal.
   - Verificar que `EMAIL_USER` y `EMAIL_PASS` sean correctos.
   - Si aparece `534 5.7.9 Application-specific password required`, activar verificacion en 2 pasos en Google y generar una App Password para `EMAIL_PASS`.

## Nota de operacion 24/7

GitHub Actions scheduler no garantiza ejecucion exacta al segundo, pero para monitoreo continuo gratuito es la alternativa mas estable sin servidor dedicado.
