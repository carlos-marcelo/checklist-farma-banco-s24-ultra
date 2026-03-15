from __future__ import annotations

from typing import Any, Dict, Iterable, List

import requests


class TrierClient:
    def __init__(self, base_url: str, token: str, timeout: int = 30) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
        )

    def _build_url(self, endpoint: str) -> str:
        endpoint = endpoint.lstrip("/")
        return f"{self.base_url}/{endpoint}"

    def get(self, endpoint: str, params: Dict[str, Any] | None = None) -> Any:
        url = self._build_url(endpoint)
        response = self.session.get(url, params=params, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def paginated_get(
        self, endpoint: str, params: Dict[str, Any] | None, page_size: int
    ) -> Iterable[List[Dict[str, Any]]]:
        if params is None:
            params = {}

        first_record = 0
        while True:
            params.update(
                {
                    "primeiroRegistro": first_record,
                    "quantidadeRegistros": page_size,
                }
            )

            payload = self.get(endpoint, params=params)
            records = _extract_records(payload)

            if not records:
                break

            yield records

            if len(records) < page_size:
                break

            first_record += page_size


def _extract_records(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict):
        for key in (
            "registros",
            "itens",
            "dados",
            "data",
            "resultado",
            "result",
            "lista",
            "conteudo",
            "content",
        ):
            value = payload.get(key)
            if isinstance(value, list):
                return value

    return []
