from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from workers.common.contracts import JudicialEvent
from workers.pjn.normalizer import new_case_event, normalize_display_text


class CaseCollector(Protocol):
    def __call__(
        self,
        *,
        username: str,
        password: str,
        headless: bool,
        timeout_ms: int,
        max_attempts: int,
    ) -> list[str]: ...


@dataclass(frozen=True, slots=True)
class PjnSyncResult:
    current_cases: frozenset[str]
    new_cases: tuple[str, ...]
    events: tuple[JudicialEvent, ...]


class PjnConnector:
    """Encapsula consulta, comparación y normalización sin enviar notificaciones."""

    def __init__(
        self,
        *,
        tenant_id: str,
        connector_id: str,
        collector: CaseCollector,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._tenant_id = tenant_id
        self._connector_id = connector_id
        self._collector = collector
        self._clock = clock or (lambda: datetime.now(UTC))

    def sync(
        self,
        *,
        username: str,
        password: str,
        previous_cases: Iterable[str],
        headless: bool = True,
        timeout_ms: int = 45_000,
        max_attempts: int = 2,
    ) -> PjnSyncResult:
        collected = self._collector(
            username=username,
            password=password,
            headless=headless,
            timeout_ms=timeout_ms,
            max_attempts=max_attempts,
        )
        current = frozenset(
            normalized for item in collected if (normalized := normalize_display_text(item))
        )
        previous = {
            normalized for item in previous_cases if (normalized := normalize_display_text(item))
        }
        new_cases = tuple(sorted(current - previous))
        detected_at = self._clock()
        events = tuple(
            new_case_event(
                tenant_id=self._tenant_id,
                connector_id=self._connector_id,
                original_text=case,
                detected_at=detected_at,
            )
            for case in new_cases
        )
        return PjnSyncResult(
            current_cases=current,
            new_cases=new_cases,
            events=events,
        )
