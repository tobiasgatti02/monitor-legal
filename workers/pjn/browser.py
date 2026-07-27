"""Adaptador temporal al navegador Playwright legado.

Mantener este módulo pequeño permite mover la implementación de ``utils.scraper`` por
partes, sin cambiar la entrada pública usada por GitHub Actions.
"""

from utils.scraper import collect_expedientes

__all__ = ["collect_expedientes"]
