from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest

from workers.pjn.neon_sink import (
    NeonEventSink,
    NeonPersistenceError,
    _event_parameters,
)
from workers.pjn.normalizer import new_case_event


def test_sink_rejects_non_uuid_tenant_before_connecting() -> None:
    with pytest.raises(NeonPersistenceError, match="MONITOR_TENANT_ID"):
        NeonEventSink(
            database_url="postgresql://example.invalid/db",
            tenant_id="legacy-single-tenant",
            connector_id="a59ca240-5bcb-4a1e-9cc0-07f8326a4378",
        )


def test_event_parameters_keep_canonical_evidence() -> None:
    event = new_case_event(
        tenant_id="a9fb5d6d-73bc-4b96-84ce-9d4b297bde59",
        connector_id="a59ca240-5bcb-4a1e-9cc0-07f8326a4378",
        original_text="FCR 42/2026 PERSONA EJEMPLO",
        detected_at=datetime(2026, 7, 27, 18, tzinfo=UTC),
    )
    parameters = _event_parameters(
        event,
        tenant_id=UUID("a9fb5d6d-73bc-4b96-84ce-9d4b297bde59"),
        case_id=UUID("1c3bc891-d624-4e9a-b44e-af1c21e36b6b"),
        connector_id=UUID("a59ca240-5bcb-4a1e-9cc0-07f8326a4378"),
        sync_run_id=UUID("d8fb3cbd-186f-4ee1-b8a9-89c7472620ad"),
    )

    assert parameters[5] == "PJN"
    assert parameters[8] == "NEW_CASE"
    assert parameters[12] == "FCR 42/2026 PERSONA EJEMPLO"
    assert parameters[14] == event.content_hash
