from __future__ import annotations

from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Produto(Base):
    __tablename__ = "trier_produtos"

    codigo: Mapped[str] = mapped_column(String(50), primary_key=True)
    nome: Mapped[str | None] = mapped_column(String(255))
    valor_venda: Mapped[float | None] = mapped_column(Numeric(14, 2))
    valor_custo: Mapped[float | None] = mapped_column(Numeric(14, 2))
    valor_custo_medio: Mapped[float | None] = mapped_column(Numeric(14, 2))
    quantidade_estoque: Mapped[float | None] = mapped_column(Numeric(14, 3))
    unidade: Mapped[str | None] = mapped_column(String(50))
    codigo_barras: Mapped[str | None] = mapped_column(String(120))
    codigo_laboratorio: Mapped[str | None] = mapped_column(String(50))
    nome_laboratorio: Mapped[str | None] = mapped_column(String(255))
    codigo_grupo: Mapped[str | None] = mapped_column(String(50))
    nome_grupo: Mapped[str | None] = mapped_column(String(255))
    codigo_categoria: Mapped[str | None] = mapped_column(String(50))
    nome_categoria: Mapped[str | None] = mapped_column(String(255))
    codigo_principio_ativo: Mapped[str | None] = mapped_column(String(50))
    nome_principio_ativo: Mapped[str | None] = mapped_column(String(255))
    ativo: Mapped[bool | None] = mapped_column(Boolean)
    percentual_desconto: Mapped[float | None] = mapped_column(Numeric(7, 2))
