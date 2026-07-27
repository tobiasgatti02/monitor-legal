from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from utils.storage import load_state, save_state


@dataclass(frozen=True, slots=True)
class JsonCaseStateRepository:
    """Persistencia de compatibilidad; PostgreSQL la reemplazará en modo dual."""

    state_path: str
    source_url: str

    def load(self) -> set[str]:
        return load_state(self.state_path)

    def save(self, cases: Iterable[str]) -> None:
        save_state(self.state_path, cases, source_url=self.source_url)
