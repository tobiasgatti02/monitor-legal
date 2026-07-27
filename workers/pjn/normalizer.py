from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from datetime import UTC, datetime

from workers.common.contracts import (
    EventType,
    JudicialEvent,
    JudicialSource,
    ReviewStatus,
    Severity,
)

PJN_LIST_URL = "https://scw.pjn.gov.ar/scw/consultaListaRelacionados.seam"
EVENT_NAMESPACE = uuid.UUID("249f95df-4eba-40df-924d-14cde780afec")


def normalize_display_text(value: str) -> str:
    """Normaliza Unicode y espacios sin destruir la evidencia legible."""

    normalized = unicodedata.normalize("NFKC", value or "")
    return re.sub(r"\s+", " ", normalized).strip()


def normalize_for_hash(value: str) -> str:
    """Produce una representación estable ante cambios visuales irrelevantes."""

    display = normalize_display_text(value).casefold()
    decomposed = unicodedata.normalize("NFKD", display)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    without_punctuation = re.sub(r"[^\w/.-]+", " ", without_marks, flags=re.UNICODE)
    return re.sub(r"\s+", " ", without_punctuation).strip()


def content_hash(value: str) -> str:
    return hashlib.sha256(normalize_for_hash(value).encode("utf-8")).hexdigest()


def new_case_event(
    *,
    tenant_id: str,
    connector_id: str,
    original_text: str,
    detected_at: datetime | None = None,
) -> JudicialEvent:
    detected = detected_at or datetime.now(UTC)
    if detected.tzinfo is None:
        raise ValueError("detected_at debe incluir zona horaria")

    normalized = normalize_display_text(original_text)
    digest = content_hash(normalized)
    stable_id = uuid.uuid5(
        EVENT_NAMESPACE,
        f"{tenant_id}:{JudicialSource.PJN}:{EventType.NEW_CASE}:{digest}",
    )

    return JudicialEvent(
        id=str(stable_id),
        tenant_id=tenant_id,
        case_id=None,
        connector_id=connector_id,
        source=JudicialSource.PJN,
        source_event_id=None,
        source_url=PJN_LIST_URL,
        event_type=EventType.NEW_CASE,
        source_date=None,
        detected_at=detected,
        title="Nuevo expediente relacionado detectado",
        original_text=original_text,
        normalized_text=normalized,
        content_hash=digest,
        severity=Severity.MEDIUM,
        review_status=ReviewStatus.UNREVIEWED,
        requires_lawyer_review=True,
        possible_deadline=False,
        metadata={"legacy_case_text": normalized},
    )
