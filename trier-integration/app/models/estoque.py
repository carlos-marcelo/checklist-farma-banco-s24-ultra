from __future__ import annotations

from sqlalchemy import Date, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Estoque(Base):
    __tablename__ = "trier_estoques"

    codigo_produto: Mapped[str] = mapped_column(String(50), primary_key=True)
    quantidade_estoque: Mapped[float | None] = mapped_column(Numeric(14, 3))
    valor_custo_medio: Mapped[float | None] = mapped_column(Numeric(14, 2))
    data_ultima_entrada: Mapped[Date | None] = mapped_column(Date)
    valor_ultima_entrada: Mapped[float | None] = mapped_column(Numeric(14, 2))
