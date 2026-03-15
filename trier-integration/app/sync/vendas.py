from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..models.venda import Venda
from ..trier_client import TrierClient


ENDPOINT = "/rest/integracao/venda/obter-v1"


def sync_vendas(
    db: Session,
    client: TrierClient,
    data_inicial: Optional[str] = None,
    data_final: Optional[str] = None,
    page_size: int = 200,
) -> Dict[str, int]:
    params: Dict[str, Any] = {}
    if data_inicial:
        params["dataEmissaoInicial"] = data_inicial
    if data_final:
        params["dataEmissaoFinal"] = data_final

    total = 0

    for records in client.paginated_get(ENDPOINT, params=params, page_size=page_size):
        for record in records:
            values = _map_venda(record)
            stmt = (
                insert(Venda)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=[
                        Venda.numero_nota,
                        Venda.codigo_produto,
                        Venda.data_emissao,
                        Venda.hora_emissao,
                    ],
                    set_=values,
                )
            )
            db.execute(stmt)

        db.commit()
        total += len(records)

    return {"registros_processados": total}


def _map_venda(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "numero_nota": record.get("numeroNota"),
        "data_emissao": _parse_date(record.get("dataEmissao")),
        "hora_emissao": _parse_time(record.get("horaEmissao")),
        "codigo_vendedor": record.get("codigoVendedor"),
        "codigo_cliente": record.get("codigoCliente"),
        "codigo_produto": record.get("codigoProduto"),
        "quantidade_produtos": _to_decimal(record.get("quantidadeProdutos")),
        "valor_total_bruto": _to_decimal(record.get("valorTotalBruto")),
        "valor_total_liquido": _to_decimal(record.get("valorTotalLiquido")),
        "valor_total_custo": _to_decimal(record.get("valorTotalCusto")),
        "parceiro": record.get("parceiro"),
        "entrega": record.get("entrega"),
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


def _parse_time(value: Any):
    if not value:
        return None
    if isinstance(value, str) and "T" in value:
        value = value.split("T")[1]
    value = str(value)
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    return None


def _to_decimal(value: Any):
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None
