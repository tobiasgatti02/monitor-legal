from __future__ import annotations

import logging
import os
import smtplib
import sys
from datetime import datetime

from dotenv import load_dotenv

from utils.scraper import (
    PJN_LIST_URL,
    CaptchaDetectedError,
    ExtractionError,
    LoginError,
    ScraperError,
)
from workers.pjn.browser import collect_expedientes
from workers.pjn.connector import PjnConnector
from workers.pjn.neon_sink import NeonEventSink, NeonPersistenceError
from workers.pjn.notifications import SmtpNewCaseNotifier
from workers.pjn.state import JsonCaseStateRepository

DEFAULT_ALERT_EMAIL = "Gattilegales@gmail.com"
DEFAULT_TENANT_ID = "legacy-single-tenant"
DEFAULT_CONNECTOR_ID = "pjn-legacy"


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
    tenant_id = os.getenv("MONITOR_TENANT_ID", DEFAULT_TENANT_ID)
    connector_id = os.getenv("PJN_CONNECTOR_ID", DEFAULT_CONNECTOR_ID)
    database_url = os.getenv("DATABASE_URL")
    neon_required = _bool_env("NEON_REQUIRED", False)

    state_repository = JsonCaseStateRepository(
        state_path=state_path,
        source_url=PJN_LIST_URL,
    )
    previous_state = state_repository.load()
    logger.info("Expedientes previos cargados: %s", len(previous_state))

    connector = PjnConnector(
        tenant_id=tenant_id,
        connector_id=connector_id,
        collector=collect_expedientes,
    )

    try:
        sync_result = connector.sync(
            username=pjn_user,
            password=pjn_pass,
            previous_cases=previous_state,
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

    logger.info("Expedientes actuales detectados: %s", len(sync_result.current_cases))
    logger.info("Eventos canonicos preparados: %s", len(sync_result.events))

    if database_url:
        try:
            persisted = NeonEventSink(
                database_url=database_url,
                tenant_id=tenant_id,
                connector_id=connector_id,
                trigger=os.getenv("PJN_SYNC_TRIGGER", "SCHEDULE"),
            ).persist(sync_result)
            logger.info(
                "Corrida persistida en Neon: sync_run=%s eventos_insertados=%s",
                persisted.sync_run_id,
                persisted.inserted_events,
            )
        except NeonPersistenceError as exc:
            logger.error("Fallo de persistencia Neon: %s", exc)
            if neon_required:
                return 8
    else:
        logger.info("Neon dual-write desactivado: DATABASE_URL no configurada.")

    if sync_result.new_cases:
        logger.info("Nuevos expedientes detectados: %s", len(sync_result.new_cases))
        notifier = SmtpNewCaseNotifier(
            smtp_user=email_user,
            smtp_pass=email_pass,
            recipient=alert_email,
        )
        try:
            notifier.notify(
                expedientes=sync_result.new_cases,
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
        state_repository.save(sync_result.current_cases)
    except Exception as exc:
        logger.exception("No se pudo guardar state.json: %s", exc)
        return 7

    logger.info("Estado actualizado correctamente en %s", state_path)
    return 0


if __name__ == "__main__":
    sys.exit(run_monitor())
