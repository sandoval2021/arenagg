#!/usr/bin/env python3
"""Read-only validation of the generated Cloudflare D1 SQLite schema.

No network, credentials, or production DB access required. Uses in-memory SQLite.
"""
from pathlib import Path
import sqlite3
import uuid
import sys


def run() -> None:
    root = Path(__file__).resolve().parent.parent
    sql_path = root / "prisma/d1/migrations/0001_init.sql"
    if not sql_path.exists():
        raise RuntimeError(f"D1 baseline missing: {sql_path}")

    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys=ON")
    database.executescript(sql_path.read_text(encoding="utf-8"))
    models = database.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    assert len(models) == 30, f"Expected 30 tables, found {len(models)}"
    print("SQLite tables validated:", len(models))

    user_id = str(uuid.uuid4())
    profile_id = user_id
    session_id = str(uuid.uuid4())

    database.execute(
        """
        INSERT INTO "User" ("id", "name", "email", "passwordHash", "role",
                            "createdAt", "updatedAt")
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        (user_id, "Smoke Test", "d1-smoke@example.invalid", "dummy-hash", "USER"),
    )
    database.execute(
        """
        INSERT INTO "UserProfile" ("userId", "createdAt", "updatedAt")
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        (profile_id,),
    )
    database.execute(
        """
        INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt")
        VALUES (?, ?, ?, datetime('now','+30 days'))
        """,
        (session_id, user_id, "test-token-hash"),
    )

    profile = database.execute(
        'SELECT "mmr", "consoles" FROM "UserProfile" WHERE "userId"=?', (user_id,)
    ).fetchone()
    assert profile is not None and profile[0] == 1500, profile
    print("Account/profile/session inserts: PASS")

    try:
        database.execute(
            'INSERT INTO "User" ("id","name","email","createdAt","updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
            (str(uuid.uuid4()), "Duplicate", "d1-smoke@example.invalid"),
        )
        raise AssertionError("Unique email constraint missing")
    except sqlite3.IntegrityError:
        print("Unique email: PASS")

    database.execute('DELETE FROM "User" WHERE "id"=?', (user_id,))
    assert database.execute('SELECT COUNT(*) FROM "Session" WHERE "userId"=?', (user_id,)).fetchone()[0] == 0
    assert database.execute('SELECT COUNT(*) FROM "UserProfile" WHERE "userId"=?', (user_id,)).fetchone()[0] == 0
    print("Foreign key cascade: PASS")

    assert database.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    print("SQLite integrity: PASS")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        print(f"D1 SQLite validation failed: {type(error).__name__}: {error}", file=sys.stderr)
        raise
