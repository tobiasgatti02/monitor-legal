from __future__ import annotations

from datetime import UTC, datetime

import pytest

from workers.common.contracts import EventType, JudicialSource, ReviewStatus, Severity
from workers.pjn.normalizer import content_hash, new_case_event, normalize_display_text


def test_display_normalization_preserves_accents_and_collapses_spacing() -> None:
    assert normalize_display_text("  PÉREZ\u00a0  c/ DEMO  ") == "PÉREZ c/ DEMO"


def test_hash_ignores_case_accents_and_visual_punctuation() -> None:
    assert content_hash("PÉREZ — FCR 1/2026") == content_hash("perez FCR 1/2026")


def test_new_case_event_is_idempotent_for_same_tenant_and_content() -> None:
    detected_at = datetime(2026, 7, 27, 10, tzinfo=UTC)
    first = new_case_event(
        tenant_id="tenant-demo",
        connector_id="pjn-demo",
        original_text="FCR 1/2026 PERSONA EJEMPLO",
        detected_at=detected_at,
    )
    second = new_case_event(
        tenant_id="tenant-demo",
        connector_id="pjn-demo",
        original_text=" fcr 1/2026   persona ejemplo ",
        detected_at=detected_at,
    )

    assert first.id == second.id
    assert first.content_hash == second.content_hash
    assert first.source is JudicialSource.PJN
    assert first.event_type is EventType.NEW_CASE
    assert first.severity is Severity.MEDIUM
    assert first.review_status is ReviewStatus.UNREVIEWED


def test_new_case_event_rejects_naive_timestamp() -> None:
    with pytest.raises(ValueError, match="zona horaria"):
        new_case_event(
            tenant_id="tenant-demo",
            connector_id="pjn-demo",
            original_text="FCR 1/2026 PERSONA EJEMPLO",
            detected_at=datetime(2026, 7, 27, 10),
        )
