from __future__ import annotations

import logging
import os
import smtplib
import sys
from datetime import datetime

from dotenv import load_dotenv

from utils.mailer import send_new_expedientes_email
from utils.scraper import (
    PJN_LIST_URL,
    CaptchaDetectedError,
    ExtractionError,
    LoginError,
    ScraperError,
    collect_expedientes,
)
from utils.storage import detect_new, load_state, save_state

DEFAULT_ALERT_EMAIL = "Gattilegales@gmail.com"


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default

    try:
        parsed = int(raw)
    except ValueError:
        return default

    return parsed if parsed > 0 else default


def _configure_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


def _validate_required_env() -> tuple[bool, list[str]]:
    required_vars = ["PJN_USER", "PJN_PASS", "EMAIL_USER", "EMAIL_PASS"]
    missing = [name for name in required_vars if not os.getenv(name)]
    return (len(missing) == 0, missing)


def run_monitor() -> int:
    load_dotenv()
    _configure_logging()
    logger = logging.getLogger("pjn-monitor")

    is_valid, missing = _validate_required_env()
    if not is_valid:
        logger.error("Faltan variables de entorno requeridas: %s", ", ".join(missing))
        return 2

    pjn_user = os.environ["PJN_USER"]
    pjn_pass = os.environ["PJN_PASS"]
    email_user = os.environ["EMAIL_USER"]
    email_pass = os.environ["EMAIL_PASS"]

    alert_email = os.getenv("ALERT_EMAIL", DEFAULT_ALERT_EMAIL)
    state_path = os.getenv("PJN_STATE_PATH", "state.json")
    timeout_ms = _int_env("PJN_TIMEOUT_MS", 45000)
    retries = _int_env("PJN_RETRIES", 2)
    headless = _bool_env("PJN_HEADLESS", True)

    previous_state = load_state(state_path)
    logger.info("Expedientes previos cargados: %s", len(previous_state))

    try:
        current_items = collect_expedientes(
            username=pjn_user,
            password=pjn_pass,
            headless=headless,
            timeout_ms=timeout_ms,
            max_attempts=retries,
        )
    except CaptchaDetectedError as exc:
        logger.error("Captcha o challenge anti-bot detectado: %s", exc)
        return 3
    except LoginError as exc:
        logger.error("Fallo de login PJN: %s", exc)
        return 4
    except ExtractionError as exc:
        logger.error("Fallo de extraccion de expedientes: %s", exc)
        return 5
    except ScraperError as exc:
        logger.error("Fallo general de scraping: %s", exc)
        return 1

    current_state = set(current_items)
    new_expedientes = detect_new(current_state, previous_state)
    logger.info("Expedientes actuales detectados: %s", len(current_state))

    if new_expedientes:
        logger.info("Nuevos expedientes detectados: %s", len(new_expedientes))
        try:
            send_new_expedientes_email(
                smtp_user=email_user,
                smtp_pass=email_pass,
                recipient=alert_email,
                expedientes=new_expedientes,
                timestamp=datetime.now().astimezone(),
            )
        except smtplib.SMTPAuthenticationError as exc:
            logger.error(
                "Fallo autenticando SMTP Gmail (%s). "
                "Usa EMAIL_PASS con App Password de Google (no password normal).",
                exc,
            )
            return 6
        except smtplib.SMTPException as exc:
            logger.error("Fallo SMTP al enviar alerta: %s", exc)
            return 6
        except Exception as exc:
            logger.exception("No se pudo enviar el email de alerta: %s", exc)
            return 6
    else:
        logger.info("No se detectaron expedientes nuevos.")

    try:
        save_state(state_path, current_state, source_url=PJN_LIST_URL)
    except Exception as exc:
        logger.exception("No se pudo guardar state.json: %s", exc)
        return 7

    logger.info("Estado actualizado correctamente en %s", state_path)
    return 0


if __name__ == "__main__":
    sys.exit(run_monitor())
