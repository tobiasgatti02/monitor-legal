from __future__ import annotations

import logging
import random
import re
import sys
import time
from dataclasses import dataclass

from playwright.sync_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    sync_playwright,
)
from playwright.sync_api import (
    Error as PlaywrightError,
)
from playwright.sync_api import (
    TimeoutError as PlaywrightTimeoutError,
)

from workers.pjn.parsers.related_cases import extract_related_cases

LOGGER = logging.getLogger(__name__)

PJN_HOME_URL = "https://www.pjn.gov.ar/"
PJN_LIST_URL = "https://scw.pjn.gov.ar/scw/consultaListaRelacionados.seam"

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)
DEFAULT_VIEWPORT = {"width": 1366, "height": 768}

USERNAME_SELECTORS = [
    "#username",
    "input[name='username']",
    "input[id*='user' i]",
    "input[name*='user' i]",
]
PASSWORD_SELECTORS = [
    "#password",
    "input[name='password']",
    "input[id*='pass' i]",
    "input[name*='pass' i]",
]
SUBMIT_SELECTORS = [
    "#kc-login",
    "input[name='login'][type='submit']",
    "button[type='submit']",
    "input[type='submit']",
]
LOGIN_FORM_SELECTORS = [
    "#kc-form-login",
    "form[action*='login-actions/authenticate']",
]
LOGIN_ERROR_SELECTORS = [
    "#input-error",
    "#kc-feedback-text",
    ".alert-error",
    ".error",
    ".pf-c-alert__title",
]
CAPTCHA_SELECTORS = [
    "iframe[src*='recaptcha']",
    "div.g-recaptcha",
    "textarea[name='g-recaptcha-response']",
    "input[name*='captcha' i]",
]

CANDIDATE_SELECTORS = [
    "table tr",
    "table tbody tr",
    "[role='row']",
    "ul li",
    "ol li",
    "a",
    "div[class*='table'] tr",
    "div[class*='list'] li",
]

NOISE_EXACT = {
    "consulta y gestion de causas",
    "iniciar sesion",
    "ingresar",
    "salir",
    "inicio",
    "buscar",
    "siguiente",
    "anterior",
}

CASE_REGEXES = [
    re.compile(r"\b(?:[A-Z]{1,6}\s*)?\d{1,7}(?:[-.]\d{1,7})?/\d{2,4}\b"),
    re.compile(
        r"\b(?:EXP(?:EDIENTE|TE)?\.?\s*)?[A-Z]{0,6}\s*\d{1,7}(?:[-.]\d{1,7})?/\d{2,4}\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b\d{1,7}/\d{2,4}\b"),
]


class ScraperError(RuntimeError):
    pass


class LoginError(ScraperError):
    pass


class CaptchaDetectedError(ScraperError):
    pass


class ExtractionError(ScraperError):
    pass


@dataclass(frozen=True)
class ScrapeConfig:
    headless: bool = True
    timeout_ms: int = 45000
    max_attempts: int = 2


def collect_expedientes(
    username: str,
    password: str,
    headless: bool = True,
    timeout_ms: int = 45000,
    max_attempts: int = 2,
) -> list[str]:
    config = ScrapeConfig(
        headless=headless,
        timeout_ms=timeout_ms,
        max_attempts=max(1, max_attempts),
    )

    last_error: Exception | None = None
    for attempt in range(1, config.max_attempts + 1):
        try:
            with sync_playwright() as playwright:
                expedientes = _run_once(playwright, username, password, config)
            LOGGER.info(
                "Extraccion finalizada con %s expedientes (intento %s/%s).",
                len(expedientes),
                attempt,
                config.max_attempts,
            )
            return expedientes
        except (PlaywrightTimeoutError, ScraperError) as exc:
            last_error = exc
            LOGGER.warning(
                "Intento %s/%s fallo: %s",
                attempt,
                config.max_attempts,
                exc,
            )
        except PlaywrightError as exc:
            if _is_missing_browser_error(exc):
                install_cmd = f"{sys.executable} -m playwright install chromium"
                last_error = ScraperError(
                    "Playwright no tiene Chromium instalado en este entorno. "
                    f"Ejecuta: {install_cmd}"
                )
            else:
                last_error = ScraperError(f"Error de Playwright: {exc}")

            LOGGER.warning(
                "Intento %s/%s fallo: %s",
                attempt,
                config.max_attempts,
                last_error,
            )
        except Exception as exc:  # pragma: no cover
            wrapped_error = ScraperError(f"Error inesperado del scraper: {exc}")
            last_error = wrapped_error
            LOGGER.exception("Error no controlado durante el scraping.")

        if attempt < config.max_attempts:
            delay_seconds = min(5, attempt * 2)
            time.sleep(delay_seconds)

    if isinstance(last_error, PlaywrightTimeoutError):
        raise ScraperError("Timeout al navegar el sitio PJN.") from last_error
    if last_error is not None:
        raise last_error
    raise ScraperError("Fallo desconocido al extraer expedientes.")


def _run_once(
    playwright: Playwright, username: str, password: str, config: ScrapeConfig
) -> list[str]:
    browser: Browser = playwright.chromium.launch(
        headless=config.headless,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
        ],
    )
    context: BrowserContext = browser.new_context(
        user_agent=DEFAULT_USER_AGENT,
        viewport=DEFAULT_VIEWPORT,
        locale="es-AR",
        timezone_id="America/Argentina/Buenos_Aires",
    )
    context.set_extra_http_headers({"Accept-Language": "es-AR,es;q=0.9,en;q=0.8"})

    page: Page = context.new_page()
    page.set_default_timeout(config.timeout_ms)

    try:
        page.goto(PJN_LIST_URL, wait_until="domcontentloaded", timeout=config.timeout_ms)
        _wait_for_settle(page, config.timeout_ms)

        if _captcha_present(page):
            raise CaptchaDetectedError("Captcha detectado antes del login.")

        if _is_on_login_page(page):
            LOGGER.info("Detectado login SSO de PJN/Keycloak.")
            _perform_login(page, username, password, timeout_ms=config.timeout_ms)
        else:
            LOGGER.info("Sesion previa detectada; no se requiere login.")

        page.goto(PJN_LIST_URL, wait_until="domcontentloaded", timeout=config.timeout_ms)
        _wait_for_settle(page, config.timeout_ms)

        if _is_on_login_page(page):
            raise LoginError(
                "No se pudo establecer sesion en PJN. Sigue apareciendo el formulario de login."
            )

        if _captcha_present(page):
            raise CaptchaDetectedError("Captcha detectado luego de autenticar.")

        expedientes = extract_expedientes(page)
        if not expedientes:
            raise ExtractionError(
                "No se pudieron extraer expedientes. Posible cambio de HTML o lista vacia."
            )

        return expedientes
    finally:
        context.close()
        browser.close()


def _perform_login(page: Page, username: str, password: str, timeout_ms: int) -> None:
    _wait_for_login_form(page, timeout_ms)

    used_user_selector = _fill_first(page, USERNAME_SELECTORS, username)
    _human_delay()
    used_pass_selector = _fill_first(page, PASSWORD_SELECTORS, password)
    _human_delay()

    used_submit_selector = _click_first(page, SUBMIT_SELECTORS)
    LOGGER.info(
        "Login enviado usando selectores user=%s pass=%s submit=%s",
        used_user_selector,
        used_pass_selector,
        used_submit_selector,
    )

    _wait_for_settle(page, timeout_ms)

    error_text = _read_login_error(page)
    if error_text:
        raise LoginError(f"Error de autenticacion PJN: {error_text}")

    if _captcha_present(page):
        raise CaptchaDetectedError("Captcha detectado en el proceso de login.")


def _wait_for_login_form(page: Page, timeout_ms: int) -> None:
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        for selector in LOGIN_FORM_SELECTORS:
            if page.locator(selector).count() > 0:
                return
        time.sleep(0.2)
    raise LoginError("No aparecio el formulario de login esperado de PJN.")


def _fill_first(page: Page, selectors: list[str], value: str) -> str:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() == 0:
                continue
            locator.click(timeout=2500)
            locator.fill(value, timeout=5000)
            return selector
        except Exception:
            continue

    raise LoginError(f"No se encontro campo para selector(es): {selectors}")


def _click_first(page: Page, selectors: list[str]) -> str:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() == 0:
                continue
            locator.click(timeout=5000)
            return selector
        except Exception:
            continue

    # Fallback: Enter en password
    for selector in PASSWORD_SELECTORS:
        try:
            if page.locator(selector).count() == 0:
                continue
            page.press(selector, "Enter", timeout=2000)
            return f"{selector} (Enter)"
        except Exception:
            continue

    raise LoginError("No se encontro boton de submit para enviar login.")


def _wait_for_settle(page: Page, timeout_ms: int) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except PlaywrightTimeoutError:
        page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)


def _is_on_login_page(page: Page) -> bool:
    url = page.url.lower()
    if "sso.pjn.gov.ar" in url and "/auth/realms/pjn" in url:
        return True

    for selector in LOGIN_FORM_SELECTORS:
        if page.locator(selector).count() > 0:
            return True

    return page.locator("#username").count() > 0 and page.locator("#password").count() > 0


def _captcha_present(page: Page) -> bool:
    for selector in CAPTCHA_SELECTORS:
        try:
            if page.locator(selector).count() > 0:
                return True
        except Exception:
            continue

    try:
        page_text = page.inner_text("body").lower()
    except Exception:
        return False

    return "captcha" in page_text or "recaptcha" in page_text


def _read_login_error(page: Page) -> str | None:
    for selector in LOGIN_ERROR_SELECTORS:
        try:
            locator = page.locator(selector).first
            if locator.count() == 0:
                continue
            text = _normalize_text(locator.inner_text(timeout=1000))
            if text:
                return text
        except Exception:
            continue

    try:
        body_text = page.inner_text("body")
    except Exception:
        return None

    for marker in ("usuario o clave", "credenciales", "error", "invalid"):
        if marker in body_text.lower():
            return marker
    return None


def extract_expedientes(page: Page) -> list[str]:
    try:
        parsed_cases = extract_related_cases(page.content())
    except Exception:
        LOGGER.debug("El parser HTML puro fallo; se conserva el extractor legado.", exc_info=True)
    else:
        if parsed_cases:
            return parsed_cases

    candidates: list[str] = []

    for selector in CANDIDATE_SELECTORS:
        candidates.extend(_extract_texts_from_selector(page, selector))

    try:
        body_text = page.inner_text("body")
        candidates.extend(_split_lines(body_text))
    except Exception:
        LOGGER.debug("No se pudo leer el texto completo del body para fallback.")

    filtered = [_normalize_text(text) for text in candidates if _looks_like_expediente(text)]
    unique = _unique_keep_order(filtered)

    if unique:
        return unique

    try:
        body_text = page.inner_text("body")
    except Exception:
        body_text = ""

    fallback: list[str] = []
    for pattern in CASE_REGEXES:
        fallback.extend(pattern.findall(body_text))

    return _unique_keep_order(_normalize_text(x) for x in fallback if x)


def _extract_texts_from_selector(page: Page, selector: str, max_items: int = 2000) -> list[str]:
    texts: list[str] = []
    locator = page.locator(selector)

    try:
        count = locator.count()
    except Exception:
        return texts

    for index in range(min(count, max_items)):
        try:
            text = _normalize_text(locator.nth(index).inner_text(timeout=1500))
            if text:
                texts.append(text)
        except Exception:
            continue

    return texts


def _split_lines(text: str) -> list[str]:
    return [_normalize_text(line) for line in text.splitlines() if _normalize_text(line)]


def _looks_like_expediente(text: str) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return False

    lowered = normalized.lower()
    if lowered in NOISE_EXACT:
        return False

    if len(normalized) < 8 or len(normalized) > 260:
        return False

    if any(regex.search(normalized) for regex in CASE_REGEXES):
        return True

    if any(
        keyword in lowered for keyword in ("expte", "expediente", "causa", "legajo", "incidente")
    ) and re.search(r"\d", normalized):
        return True

    return "/" in normalized and re.search(r"\d", normalized) is not None


def _unique_keep_order(items) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()

    for item in items:
        text = _normalize_text(str(item))
        if not text:
            continue
        if text in seen:
            continue
        seen.add(text)
        unique.append(text)

    return unique


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _human_delay(min_delay: float = 0.15, max_delay: float = 0.55) -> None:
    time.sleep(random.uniform(min_delay, max_delay))


def _is_missing_browser_error(exc: PlaywrightError) -> bool:
    message = str(exc).lower()
    return "executable doesn't exist" in message and "playwright install" in message
