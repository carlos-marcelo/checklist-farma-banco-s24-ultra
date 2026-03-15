from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..models.produto import Produto
from ..trier_client import TrierClient


ENDPOINT = "/rest/integracao/produto/obter-v1"


def sync_produtos(
    db: Session,
    client: TrierClient,
    page_size: int = 200,
) -> Dict[str, int]:
    total = 0

    for records in client.paginated_get(ENDPOINT, params={}, page_size=page_size):
        for record in records:
            values = _map_produto(record)
            if not values.get("codigo"):
                continue
            stmt = (
                insert(Produto)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=[Produto.codigo],
                    set_=values,
                )
            )
            db.execute(stmt)

        db.commit()
        total += len(records)

    return {"registros_processados": total}


def _map_produto(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "codigo": str(record.get("codigo")) if record.get("codigo") is not None else None,
        "nome": record.get("nome"),
        "valor_venda": _to_decimal(record.get("valorVenda")),
        "valor_custo": _to_decimal(record.get("valorCusto")),
        "valor_custo_medio": _to_decimal(record.get("valorCustoMedio")),
        "quantidade_estoque": _to_decimal(record.get("quantidadeEstoque")),
        "unidade": record.get("unidade"),
        "codigo_barras": record.get("codigoBarras"),
        "codigo_laboratorio": record.get("codigoLaboratorio"),
        "nome_laboratorio": record.get("nomeLaboratorio"),
        "codigo_grupo": record.get("codigoGrupo"),
        "nome_grupo": record.get("nomeGrupo"),
        "codigo_categoria": record.get("codigoCategoria"),
        "nome_categoria": record.get("nomeCategoria"),
        "codigo_principio_ativo": record.get("codigoPrincipioAtivo"),
        "nome_principio_ativo": record.get("nomePrincipioAtivo"),
        "ativo": _to_bool(record.get("ativo")),
        "percentual_desconto": _to_decimal(record.get("percentualDesconto")),
    }


def _to_decimal(value: Any):
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _to_bool(value: Any):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    value = str(value).strip().lower()
    if value in {"s", "sim", "true", "1", "t"}:
        return True
    if value in {"n", "nao", "false", "0", "f"}:
        return False
    return None
