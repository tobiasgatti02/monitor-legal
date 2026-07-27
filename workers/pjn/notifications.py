from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from utils.mailer import send_new_expedientes_email


@dataclass(frozen=True, slots=True)
class SmtpNewCaseNotifier:
    smtp_user: str
    smtp_pass: str
    recipient: str

    def notify(self, *, expedientes: Sequence[str], timestamp: datetime) -> None:
        send_new_expedientes_email(
            smtp_user=self.smtp_user,
            smtp_pass=self.smtp_pass,
            recipient=self.recipient,
            expedientes=expedientes,
            timestamp=timestamp,
        )
