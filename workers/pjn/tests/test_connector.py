from __future__ import annotations

from datetime import UTC, datetime

from workers.pjn.connector import PjnConnector


def test_connector_returns_current_state_new_cases_and_events() -> None:
    calls: list[dict[str, object]] = []

    def collector(**kwargs: object) -> list[str]:
        calls.append(kwargs)
        return [
            " FCR 1/2025 CASO CONOCIDO ",
            "CAF 2/2026 CASO NUEVO",
            "CAF 2/2026  CASO NUEVO",
        ]

    connector = PjnConnector(
        tenant_id="tenant-demo",
        connector_id="pjn-account-demo",
        collector=collector,
        clock=lambda: datetime(2026, 7, 27, 12, tzinfo=UTC),
    )

    result = connector.sync(
        username="usuario",
        password="secreto",
        previous_cases={"FCR 1/2025 CASO CONOCIDO"},
    )

    assert len(calls) == 1
    assert calls[0]["username"] == "usuario"
    assert result.current_cases == frozenset({"FCR 1/2025 CASO CONOCIDO", "CAF 2/2026 CASO NUEVO"})
    assert result.new_cases == ("CAF 2/2026 CASO NUEVO",)
    assert len(result.events) == 1
    assert result.events[0].metadata["legacy_case_text"] == "CAF 2/2026 CASO NUEVO"
