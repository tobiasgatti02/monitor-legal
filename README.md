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

## Deploy en GitHub Actions (cada 2 horas)

Workflow: `.github/workflows/monitor.yml`

Disparadores:

- `schedule: 0 */2 * * *`
- `workflow_dispatch`

### Secrets obligatorios en GitHub

En tu repo -> Settings -> Secrets and variables > Actions > New repository secret:

- `EMAIL_USER` (compartido para todos los usuarios)
- `EMAIL_PASS` (compartido para todos los usuarios)

**Para un usuario (ej. Gatti):**
- `PJN_USER` o `PJN_USER_gatti`
- `PJN_PASS` o `PJN_PASS_gatti`
- `ALERT_EMAIL_gatti` (opcional; default Gattilegales@gmail.com)

**Para múltiples usuarios (ej. Gatti + Mazzarini):**

El workflow ejecuta ambos usuarios en paralelo usando `strategy.matrix`. Configurá:

- `PJN_USER_gatti` / `PJN_PASS_gatti` / `ALERT_EMAIL_gatti`
- `PJN_USER_mazzarini` / `PJN_PASS_mazzarini` / `ALERT_EMAIL_mazzarini`

Cada usuario tendrá su propio `state_gatti.json` y `state_mazzarini.json`.

## Persistencia de archivos de estado

El workflow:

1. Ejecuta monitor para cada usuario.
2. Si su respectivo `state_<user>.json` cambió, hace commit y push automático.
3. Sube artifact del estado de cada usuario en cada corrida.

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
