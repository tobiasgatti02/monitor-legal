from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Iterable

LOGGER = logging.getLogger(__name__)


def _normalize_items(items: Iterable[str]) -> list[str]:
	normalized: list[str] = []
	seen: set[str] = set()

	for item in items:
		text = " ".join(str(item).split())
		if not text:
			continue
		if text in seen:
			continue
		seen.add(text)
		normalized.append(text)

	return normalized


def load_state(state_path: str) -> set[str]:
	if not os.path.exists(state_path):
		return set()

	try:
		with open(state_path, "r", encoding="utf-8") as file:
			raw_state = json.load(file)
	except json.JSONDecodeError:
		LOGGER.error("El archivo de estado %s no es JSON valido.", state_path)
		return set()
	except OSError as exc:
		LOGGER.error("No se pudo leer el archivo de estado %s: %s", state_path, exc)
		return set()

	expedientes: list[str]
	if isinstance(raw_state, dict):
		data = raw_state.get("expedientes", [])
		expedientes = data if isinstance(data, list) else []
	elif isinstance(raw_state, list):
		expedientes = raw_state
	else:
		LOGGER.warning("Formato de estado inesperado en %s.", state_path)
		return set()

	return set(_normalize_items(expedientes))


def detect_new(current_items: Iterable[str], previous_items: Iterable[str]) -> list[str]:
	current_set = set(_normalize_items(current_items))
	previous_set = set(_normalize_items(previous_items))
	return sorted(current_set - previous_set)


def save_state(state_path: str, expedientes: Iterable[str], source_url: str | None = None) -> None:
	normalized = sorted(_normalize_items(expedientes))
	payload = {
		"updated_at": datetime.now(timezone.utc).isoformat(),
		"source_url": source_url,
		"expedientes": normalized,
		"count": len(normalized),
	}

	base_dir = os.path.dirname(state_path) or "."
	os.makedirs(base_dir, exist_ok=True)

	temp_path = f"{state_path}.tmp"
	with open(temp_path, "w", encoding="utf-8") as file:
		json.dump(payload, file, indent=2, ensure_ascii=False)
		file.write("\n")

	os.replace(temp_path, state_path)
