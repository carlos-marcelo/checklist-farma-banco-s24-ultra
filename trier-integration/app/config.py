from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    trier_base_url: str
    trier_token: str
    database_url: str
    trier_page_size: int


def get_settings(require_database: bool = True) -> Settings:
    base_url = os.getenv("TRIER_BASE_URL", "").strip()
    token = os.getenv("TRIER_TOKEN", "").strip()
    database_url = os.getenv("DATABASE_URL", "").strip()
    page_size_raw = os.getenv("TRIER_PAGE_SIZE", "200").strip()

    if not base_url:
        raise RuntimeError("TRIER_BASE_URL nao configurado")
    if not token:
        raise RuntimeError("TRIER_TOKEN nao configurado")
    if require_database and not database_url:
        raise RuntimeError("DATABASE_URL nao configurado")

    try:
        page_size = int(page_size_raw)
    except ValueError as exc:
        raise RuntimeError("TRIER_PAGE_SIZE invalido") from exc

    return Settings(
        trier_base_url=base_url,
        trier_token=token,
        database_url=database_url,
        trier_page_size=page_size,
    )
