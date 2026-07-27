# Arquitectura actual del monitor PJN

Fecha de auditoría: 2026-07-27.

## Flujo real

1. GitHub Actions dispara `PJN Monitor` por cron o manualmente.
2. Se ejecutan dos jobs independientes: `monitor-gatti` y `monitor-mazzarini`.
3. Cada job restaura un JSON de estado desde Actions Cache.
4. `main.py` carga variables, lee el estado y llama al scraper Playwright.
5. `utils/scraper.py` autentica contra SSO PJN, abre la lista de relacionados y
   extrae textos que parecen expedientes.
6. `utils/storage.py` compara strings completos contra el estado anterior.
7. `utils/mailer.py` envía un email si hay strings nuevos.
8. Sólo después del email se reemplaza el estado local y se sube como artifact/cache.

```text
GitHub Actions
  ├─ cuenta A ─┐
  └─ cuenta B ─┴─> main.py
                    ├─ JSON previo
                    ├─ Playwright / SSO / lista relacionados
                    ├─ comparación de strings
                    ├─ Gmail SMTP
                    └─ JSON nuevo
```

## Código que se conserva

- La navegación Playwright y la detección explícita de captcha.
- Los selectores resilientes de SSO como compatibilidad inicial.
- Los códigos de salida operativos de `main.py`.
- La escritura atómica de estado mediante archivo temporal y `os.replace`.
- El constructor de email y la separación existente en módulos `utils`.
- Los dos jobs independientes mientras se migra a conectores persistidos.

## Limitaciones verificadas

- No había tests ni fixtures.
- Scraping, comparación, persistencia y entrega se orquestan en un único flujo síncrono.
- La identidad de una causa es el texto completo de una fila; un cambio visual puede parecer
  un expediente nuevo.
- El selector tolera cualquier texto con `/` y números, lo que amplía falsos positivos.
- No existe evento canónico, outbox, auditoría ni idempotencia en base de datos.
- El estado depende de cache/artifacts con retención y no es una fuente de verdad.
- El workflow pide `contents: write` aunque ya no escribe commits.
- Los estados se versionaron y uno contenía 26 descripciones de expedientes en un repo público.
- Las dependencias tienen rangos amplios y las acciones usan tags mayores, no SHA inmutable.
- El user-agent fijo declara Chrome 123 y puede volverse una señal de automatización.
- No hay captura diagnóstica tipada para `SELECTOR_CHANGED`, timeout o caída del portal.

## Estado operativo observado

La API pública de GitHub mostró 991 ejecuciones y, el 2026-07-27, ambos jobs de la
ejecución más reciente terminaron correctamente. El cron está declarado cada hora, pero
los timestamps observados presentan intervalos variables. GitHub Actions se mantiene como
transición, no como garantía de programación exacta.
