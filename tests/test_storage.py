from __future__ import annotations

import json

from utils.storage import detect_new, load_state, save_state


def test_detect_new_normalizes_whitespace_and_removes_duplicates() -> None:
    current = ["FCR 1234/2024  PÉREZ", " FCR 1234/2024 PÉREZ ", "CAF 9/2025 DEMO"]
    previous = ["FCR 1234/2024 PÉREZ"]

    assert detect_new(current, previous) == ["CAF 9/2025 DEMO"]


def test_load_state_accepts_legacy_list_format(tmp_path) -> None:
    path = tmp_path / "state.json"
    path.write_text(json.dumps([" FCR 1/2024  DEMO ", "FCR 1/2024 DEMO"]), encoding="utf-8")

    assert load_state(str(path)) == {"FCR 1/2024 DEMO"}


def test_save_state_is_sorted_and_reloadable(tmp_path) -> None:
    path = tmp_path / "state.json"

    save_state(
        str(path),
        ["ZZZ 2/2025 DEMO", "AAA 1/2024 DEMO"],
        source_url="https://example.invalid/pjn",
    )

    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["count"] == 2
    assert payload["expedientes"] == ["AAA 1/2024 DEMO", "ZZZ 2/2025 DEMO"]
    assert load_state(str(path)) == {"AAA 1/2024 DEMO", "ZZZ 2/2025 DEMO"}


def test_load_invalid_json_fails_closed(tmp_path) -> None:
    path = tmp_path / "state.json"
    path.write_text("{no-es-json", encoding="utf-8")

    assert load_state(str(path)) == set()
