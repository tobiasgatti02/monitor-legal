from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import Mock

import main
from workers.pjn.connector import PjnSyncResult


def _set_required_env(monkeypatch) -> None:
    monkeypatch.setenv("PJN_USER", "usuario-demo")
    monkeypatch.setenv("PJN_PASS", "clave-demo")
    monkeypatch.setenv("EMAIL_USER", "monitor@example.com")
    monkeypatch.setenv("EMAIL_PASS", "smtp-demo")
    monkeypatch.setenv("ALERT_EMAIL", "estudio@example.com")
    monkeypatch.delenv("DATABASE_URL", raising=False)


def test_run_monitor_keeps_success_path_and_saves_state(monkeypatch, tmp_path) -> None:
    _set_required_env(monkeypatch)
    state_path = tmp_path / "state.json"
    monkeypatch.setenv("PJN_STATE_PATH", str(state_path))

    sync = Mock(
        return_value=PjnSyncResult(
            current_cases=frozenset({"FCR 1/2026 CASO DEMO"}),
            new_cases=(),
            events=(),
        )
    )
    monkeypatch.setattr(main.PjnConnector, "sync", sync)

    assert main.run_monitor() == 0
    assert state_path.exists()
    sync.assert_called_once()


def test_run_monitor_notifies_only_when_there_are_new_cases(monkeypatch, tmp_path) -> None:
    _set_required_env(monkeypatch)
    monkeypatch.setenv("PJN_STATE_PATH", str(tmp_path / "state.json"))
    event_time = datetime(2026, 7, 27, 12, tzinfo=UTC)
    monkeypatch.setattr(
        main.PjnConnector,
        "sync",
        Mock(
            return_value=PjnSyncResult(
                current_cases=frozenset({"FCR 1/2026 CASO DEMO"}),
                new_cases=("FCR 1/2026 CASO DEMO",),
                events=(),
            )
        ),
    )
    notify = Mock()
    monkeypatch.setattr(main.SmtpNewCaseNotifier, "notify", notify)
    monkeypatch.setattr(main, "datetime", Mock(now=Mock(return_value=event_time)))

    assert main.run_monitor() == 0
    notify.assert_called_once()


def test_run_monitor_preserves_missing_env_exit_code(monkeypatch) -> None:
    for name in ("PJN_USER", "PJN_PASS", "EMAIL_USER", "EMAIL_PASS"):
        monkeypatch.delenv(name, raising=False)

    assert main.run_monitor() == 2
