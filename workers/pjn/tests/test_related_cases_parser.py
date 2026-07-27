from __future__ import annotations

from pathlib import Path

from workers.pjn.parsers.related_cases import extract_related_cases

FIXTURE = Path(__file__).parents[1] / "fixtures" / "related_cases.html"


def test_extract_related_cases_from_sanitized_fixture() -> None:
    cases = extract_related_cases(FIXTURE.read_text(encoding="utf-8"))

    assert cases == [
        "FCR 1234/2024 PÉREZ EJEMPLO c/ EMPRESA DEMO S.A. s/ DAÑOS JUZGADO FEDERAL DE PRUEBA",
        "CAF 9876/2023 PERSONA FICTICIA s/ INCIDENTE CÁMARA DE EJEMPLO",
        "Expediente FBB 42/2026",
    ]
    assert all("999/1999" not in case for case in cases)


def test_fallback_extracts_case_number_from_plain_markup() -> None:
    assert extract_related_cases("<div>Resultado: FCR 77/2026</div>") == ["FCR 77/2026"]


def test_visual_whitespace_does_not_change_result() -> None:
    html = "<table><tr><td>FCR&nbsp;1234/2024</td><td>PERSONA   EJEMPLO</td></tr></table>"

    assert extract_related_cases(html) == ["FCR 1234/2024 PERSONA EJEMPLO"]
