from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..models.estoque import Estoque
from ..trier_client import TrierClient


ENDPOINT = "/rest/integracao/estoque/obter-v1"


def sync_estoque(
    db: Session,
    client: TrierClient,
    codigo_produto: Optional[str] = None,
    page_size: int = 200,
) -> Dict[str, int]:
    params: Dict[str, Any] = {}
    if codigo_produto:
        params["codigoProduto"] = codigo_produto

    total = 0

    for records in client.paginated_get(ENDPOINT, params=params, page_size=page_size):
        for record in records:
            values = _map_estoque(record)
            if not values.get("codigo_produto"):
                continue
            stmt = (
                insert(Estoque)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=[Estoque.codigo_produto],
                    set_=values,
                )
            )
            db.execute(stmt)

        db.commit()
        total += len(records)

    return {"registros_processados": total}


def _map_estoque(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "codigo_produto": str(record.get("codigoProduto"))
        if record.get("codigoProduto") is not None
        else None,
        "quantidade_estoque": _to_decimal(record.get("quantidadeEstoque")),
        "valor_custo_medio": _to_decimal(record.get("valorCustoMedio")),
        "data_ultima_entrada": _parse_date(record.get("dataUltimaEntrada")),
        "valor_ultima_entrada": _to_decimal(record.get("valorUltimaEntrada")),
    }


def _parse_date(value: Any):
    if not value:
        return None
    if isinstance(value, str) and "T" in value:
        value = value.split("T")[0]
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return None


def _to_decimal(value: Any):
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None
