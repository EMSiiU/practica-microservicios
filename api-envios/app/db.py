import os
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path
from uuid import uuid4

DB_PATH = Path(
    os.environ.get("ENVIOS_DB_PATH")
    or Path(__file__).resolve().parent.parent / "data" / "envios.sqlite"
)


@contextmanager
def abrir_base() -> Iterator[sqlite3.Connection]:
    with closing(sqlite3.connect(DB_PATH)) as db, db:
        db.row_factory = sqlite3.Row
        yield db


def preparar_base() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with abrir_base() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS envios (
                pedido_id INTEGER PRIMARY KEY CHECK (pedido_id > 0),
                guia TEXT NOT NULL UNIQUE,
                estado TEXT NOT NULL DEFAULT 'preparando'
                    CHECK (estado IN ('preparando', 'en_transito', 'entregado'))
            )
            """
        )


def generar_guia(pedido_id: int) -> tuple[sqlite3.Row, bool]:
    with abrir_base() as db:
        nueva = db.execute(
            """
            INSERT INTO envios (pedido_id, guia)
            VALUES (?, ?)
            ON CONFLICT (pedido_id) DO NOTHING
            RETURNING pedido_id, guia, estado
            """,
            (pedido_id, f"GT-{uuid4().hex.upper()}"),
        ).fetchone()
        if nueva is not None:
            return nueva, True

        existente = db.execute(
            "SELECT pedido_id, guia, estado FROM envios WHERE pedido_id = ?",
            (pedido_id,),
        ).fetchone()
        if existente is None:
            raise sqlite3.DatabaseError("No se encontró la guía del pedido.")
        return existente, False


def rastrear_guia(guia: str) -> sqlite3.Row | None:
    with abrir_base() as db:
        return db.execute(
            "SELECT guia, estado FROM envios WHERE guia = ?",
            (guia,),
        ).fetchone()
