from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Tuple

from ..trier_client import TrierClient


PRODUTO_ENDPOINT = "/rest/integracao/produto/obter-v1"
ESTOQUE_ENDPOINT = "/rest/integracao/estoque/obter-v1"


def build_audit_payload(
    client: TrierClient,
    filial: str,
    empresa: str,
    page_size: int = 200,
) -> Dict[str, Any]:
    produtos = _fetch_all(client, PRODUTO_ENDPOINT, page_size=page_size)
    estoques = _fetch_all(client, ESTOQUE_ENDPOINT, page_size=page_size)
    estoque_map = _build_estoque_map(estoques)

    groups_map: Dict[str, Dict[str, Any]] = {}

    for produto in produtos:
        codigo = _to_str(produto.get("codigo"))
        if not codigo:
            continue

        estoque_info = estoque_map.get(codigo)
        quantidade = _to_float(estoque_info.get("quantidadeEstoque") if estoque_info else None)
        if quantidade <= 0:
            continue

        group_id = _to_str(produto.get("codigoGrupo")) or "0"
        group_name = _to_str(produto.get("nomeGrupo")) or f"Grupo {group_id}"

        dept_code = _to_str(produto.get("codigoDepartamento"))
        dept_name = _to_str(produto.get("nomeDepartamento")) or "GERAL"
        dept_id = dept_code or dept_name

        cat_code = _to_str(produto.get("codigoCategoria"))
        cat_name = _to_str(produto.get("nomeCategoria")) or "GERAL"
        cat_id = f"{group_id}-{dept_id}-{cat_code or cat_name}"

        group = groups_map.setdefault(
            group_id,
            {"id": group_id, "name": group_name, "departments": []},
        )

        dept = _get_or_create_department(group, dept_id, dept_name, dept_code)
        cat = _get_or_create_category(dept, cat_id, cat_name, cat_code)

        product_code = _to_str(produto.get("codigoBarras")) or codigo
        product_name = _to_str(produto.get("nome")) or f"Produto {codigo}"

        cat["products"].append(
            {
                "code": product_code,
                "name": product_name,
                "quantity": quantidade,
            }
        )
        cat["itemsCount"] += 1
        cat["totalQuantity"] += quantidade

    groups = list(groups_map.values())
    groups.sort(key=lambda g: _safe_int(g.get("id")))

    return {
        "groups": groups,
        "empresa": empresa or "",
        "filial": filial or "",
    }


def _fetch_all(client: TrierClient, endpoint: str, page_size: int) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for page in client.paginated_get(endpoint, params={}, page_size=page_size):
        results.extend(page)
    return results


def _build_estoque_map(records: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    mapping: Dict[str, Dict[str, Any]] = {}
    for record in records:
        codigo = _to_str(record.get("codigoProduto"))
        if codigo:
            mapping[codigo] = record
    return mapping


def _get_or_create_department(
    group: Dict[str, Any],
    dept_id: str,
    dept_name: str,
    dept_code: str | None,
) -> Dict[str, Any]:
    for dept in group["departments"]:
        if dept["id"] == dept_id:
            return dept

    dept = {
        "id": dept_id,
        "numericId": dept_code or None,
        "name": dept_name,
        "categories": [],
    }
    group["departments"].append(dept)
    return dept


def _get_or_create_category(
    dept: Dict[str, Any],
    cat_id: str,
    cat_name: str,
    cat_code: str | None,
) -> Dict[str, Any]:
    for cat in dept["categories"]:
        if cat["id"] == cat_id:
            return cat

    cat = {
        "id": cat_id,
        "numericId": cat_code or None,
        "name": cat_name,
        "itemsCount": 0,
        "totalQuantity": 0.0,
        "status": "pendente",
        "products": [],
    }
    dept["categories"].append(cat)
    return cat


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _to_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        if isinstance(value, str):
            cleaned = value.replace(" ", "")
            if "," in cleaned and "." not in cleaned:
                cleaned = cleaned.replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
            try:
                return float(cleaned)
            except ValueError:
                return 0.0
    return 0.0


def _safe_int(value: Any) -> int:
    try:
        return int(str(value).split("+")[0])
    except Exception:
        return 0
