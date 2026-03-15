from __future__ import annotations

from sqlalchemy import Date, Numeric, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Venda(Base):
    __tablename__ = "trier_vendas"
    __table_args__ = (
        UniqueConstraint(
            "numero_nota",
            "codigo_produto",
            "data_emissao",
            "hora_emissao",
            name="uq_trier_venda",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    numero_nota: Mapped[str | None] = mapped_column(String(50))
    data_emissao: Mapped[Date | None] = mapped_column(Date)
    hora_emissao: Mapped[Time | None] = mapped_column(Time)
    codigo_vendedor: Mapped[str | None] = mapped_column(String(50))
    codigo_cliente: Mapped[str | None] = mapped_column(String(50))
    codigo_produto: Mapped[str | None] = mapped_column(String(50))
    quantidade_produtos: Mapped[float | None] = mapped_column(Numeric(14, 3))
    valor_total_bruto: Mapped[float | None] = mapped_column(Numeric(14, 2))
    valor_total_liquido: Mapped[float | None] = mapped_column(Numeric(14, 2))
    valor_total_custo: Mapped[float | None] = mapped_column(Numeric(14, 2))
    parceiro: Mapped[str | None] = mapped_column(String(120))
    entrega: Mapped[str | None] = mapped_column(String(120))
