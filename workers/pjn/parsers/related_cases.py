from __future__ import annotations

import re
from collections.abc import Iterable
from html.parser import HTMLParser

from workers.pjn.normalizer import normalize_display_text

CANDIDATE_TAGS = {"a", "li", "tr"}
IGNORED_TAGS = {"script", "style", "noscript", "template"}
NOISE_EXACT = {
    "anterior",
    "buscar",
    "consulta y gestion de causas",
    "ingresar",
    "iniciar sesion",
    "inicio",
    "salir",
    "siguiente",
}
CASE_REGEXES = (
    re.compile(r"\b(?:[A-Z]{1,6}\s*)?\d{1,7}(?:[-.]\d{1,7})?/\d{2,4}\b"),
    re.compile(
        r"\b(?:EXP(?:EDIENTE|TE)?\.?\s*)?[A-Z]{0,6}\s*"
        r"\d{1,7}(?:[-.]\d{1,7})?/\d{2,4}\b",
        re.IGNORECASE,
    ),
)


class _CandidateTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._captures: list[tuple[str, list[str]]] = []
        self._ignored_depth = 0
        self.candidates: list[str] = []
        self.visible_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        if lowered in IGNORED_TAGS:
            self._ignored_depth += 1
            return
        if self._ignored_depth == 0 and lowered in CANDIDATE_TAGS:
            self._captures.append((lowered, []))

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in IGNORED_TAGS:
            self._ignored_depth = max(0, self._ignored_depth - 1)
            return
        if self._ignored_depth > 0:
            return

        for index in range(len(self._captures) - 1, -1, -1):
            captured_tag, parts = self._captures[index]
            if captured_tag != lowered:
                continue
            self.candidates.append(" ".join(parts))
            del self._captures[index]
            break

    def handle_data(self, data: str) -> None:
        if self._ignored_depth > 0:
            return
        self.visible_text.append(data)
        for _, parts in self._captures:
            parts.append(data)


def _looks_like_case(value: str) -> bool:
    normalized = normalize_display_text(value)
    if not normalized or normalized.casefold() in NOISE_EXACT:
        return False
    if not 6 <= len(normalized) <= 500:
        return False
    return any(pattern.search(normalized) for pattern in CASE_REGEXES)


def _unique_normalized(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        normalized = normalize_display_text(value)
        key = normalized.casefold()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)

    return result


def extract_related_cases(html: str) -> list[str]:
    """Extrae filas o enlaces de expedientes desde HTML sin usar el portal real."""

    parser = _CandidateTextParser()
    parser.feed(html or "")
    parser.close()

    candidates = [value for value in parser.candidates if _looks_like_case(value)]
    if candidates:
        return _unique_normalized(candidates)

    visible = normalize_display_text(" ".join(parser.visible_text))
    matches: list[str] = []
    for pattern in CASE_REGEXES:
        matches.extend(match.group(0) for match in pattern.finditer(visible))
    return _unique_normalized(matches)
