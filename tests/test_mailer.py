from __future__ import annotations

from datetime import UTC, datetime

from utils.mailer import SUBJECT_NEW_CASE, build_alert_message


def test_build_alert_message_preserves_sender_recipient_and_cases() -> None:
    timestamp = datetime(2026, 7, 27, 9, 30, tzinfo=UTC)

    message = build_alert_message(
        sender="monitor@example.com",
        recipient="estudio@example.com",
        expedientes=["FCR 1234/2024 PERSONA EJEMPLO"],
        timestamp=timestamp,
    )

    assert message["Subject"] == SUBJECT_NEW_CASE
    assert message["From"] == "monitor@example.com"
    assert message["To"] == "estudio@example.com"
    assert "FCR 1234/2024 PERSONA EJEMPLO" in message.get_content()
    assert timestamp.isoformat() in message.get_content()
