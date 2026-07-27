from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any


class JudicialSource(StrEnum):
    PJN = "PJN"
    MEV_SCBA = "MEV_SCBA"
    SCBA_NOTIFICATIONS = "SCBA_NOTIFICACIONES"


class EventType(StrEnum):
    NEW_CASE = "NEW_CASE"
    MOVEMENT = "MOVEMENT"
    DISPATCH = "DISPATCH"
    NOTIFICATION = "NOTIFICATION"
    DOCUMENT = "DOCUMENT"
    HEARING = "HEARING"
    JUDGMENT = "JUDGMENT"
    FILING = "FILING"
    DEPENDENCY_CHANGE = "DEPENDENCY_CHANGE"
    OTHER = "OTHER"


class Severity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ReviewStatus(StrEnum):
    UNREVIEWED = "UNREVIEWED"
    REVIEWED = "REVIEWED"
    DISMISSED = "DISMISSED"


@dataclass(frozen=True, slots=True)
class JudicialEvent:
    """Contrato canónico independiente de la base de datos y de la interfaz."""

    id: str
    tenant_id: str
    case_id: str | None
    connector_id: str
    source: JudicialSource
    source_event_id: str | None
    source_url: str | None
    event_type: EventType
    source_date: datetime | None
    detected_at: datetime
    title: str
    original_text: str
    normalized_text: str
    content_hash: str
    severity: Severity
    review_status: ReviewStatus = ReviewStatus.UNREVIEWED
    requires_lawyer_review: bool = True
    possible_deadline: bool = False
    raw_artifact_ids: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)
