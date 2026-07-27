from __future__ import annotations

import smtplib
from collections.abc import Sequence
from datetime import datetime
from email.message import EmailMessage

SUBJECT_NEW_CASE = "Nuevo expediente detectado PJN"


def build_alert_message(
    sender: str,
    recipient: str,
    expedientes: Sequence[str],
    timestamp: datetime,
) -> EmailMessage:
    body_lines = [
        "Se detectaron nuevos expedientes:",
        "",
    ]

    body_lines.extend(f"- {expediente}" for expediente in expedientes)
    body_lines.extend(
        [
            "",
            "Fecha:",
            timestamp.isoformat(),
        ]
    )

    message = EmailMessage()
    message["Subject"] = SUBJECT_NEW_CASE
    message["From"] = sender
    message["To"] = recipient
    message.set_content("\n".join(body_lines))
    return message


def send_new_expedientes_email(
    smtp_user: str,
    smtp_pass: str,
    recipient: str,
    expedientes: Sequence[str],
    timestamp: datetime,
    smtp_host: str = "smtp.gmail.com",
    smtp_port: int = 465,
) -> None:
    if not expedientes:
        return

    msg = build_alert_message(
        sender=smtp_user,
        recipient=recipient,
        expedientes=expedientes,
        timestamp=timestamp,
    )

    with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30) as smtp:
        smtp.login(smtp_user, smtp_pass)
        smtp.send_message(msg)
