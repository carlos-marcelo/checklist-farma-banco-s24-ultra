from __future__ import annotations

import os

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import requests
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, get_engine, get_session
from .models import estoque, produto, venda
from .sync.estoque import sync_estoque
from .sync.produtos import sync_produtos
from .sync.vendas import sync_vendas
from .sync.auditoria import build_audit_payload
from .trier_client import TrierClient


app = FastAPI(title="Trier Integration")


def _get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "*").strip()
    if not raw or raw == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _database_enabled() -> bool:
    if os.getenv("DISABLE_DB") == "1":
        return False
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        return False
    if any(token in database_url for token in ("USUARIO", "SENHA", "HOST")):
        return False
    return True


def on_startup() -> None:
    if _database_enabled():
        Base.metadata.create_all(bind=get_engine())


def get_client(require_database: bool = True) -> TrierClient:
    settings = get_settings(require_database=require_database)
    return TrierClient(settings.trier_base_url, settings.trier_token)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/sync/vendas")
def sync_vendas_endpoint(
    data_inicial: str | None = Query(default=None, description="YYYY-MM-DD"),
    data_final: str | None = Query(default=None, description="YYYY-MM-DD"),
    page_size: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_session),
):
    settings = get_settings()
    client = get_client()
    return sync_vendas(
        db,
        client,
        data_inicial=data_inicial,
        data_final=data_final,
        page_size=page_size or settings.trier_page_size,
    )


@app.post("/sync/produtos")
def sync_produtos_endpoint(
    page_size: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_session),
):
    settings = get_settings()
    client = get_client()
    return sync_produtos(
        db,
        client,
        page_size=page_size or settings.trier_page_size,
    )


@app.post("/sync/estoque")
def sync_estoque_endpoint(
    codigo_produto: str | None = Query(default=None),
    page_size: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_session),
):
    settings = get_settings()
    client = get_client()
    return sync_estoque(
        db,
        client,
        codigo_produto=codigo_produto,
        page_size=page_size or settings.trier_page_size,
    )


@app.get("/audit/bootstrap")
def audit_bootstrap(
    filial: str | None = Query(default=None),
    empresa: str | None = Query(default=None),
    page_size: int | None = Query(default=None, ge=1),
):
    settings = get_settings(require_database=False)
    client = get_client(require_database=False)
    try:
        return build_audit_payload(
            client,
            filial=filial or "",
            empresa=empresa or "",
            page_size=page_size or settings.trier_page_size,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Falha ao consultar Trier: {exc.__class__.__name__}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Erro interno ao montar auditoria.",
        ) from exc
