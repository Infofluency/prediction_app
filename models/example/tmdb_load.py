"""
TMDB Load Script
================
Loads extracted TMDB CSVs into Azure SQL Server (warehouse_prod.lb_knn).
Uses upsert (MERGE) logic so re-runs are safe.

Tables loaded:
  - lb_knn.raw_tmdb_movie_list
  - lb_knn.raw_tmdb_details
  - lb_knn.raw_tmdb_credits_cast
  - lb_knn.raw_tmdb_credits_crew
  - lb_knn.raw_tmdb_watch_providers
  - lb_knn.raw_tmdb_posters
"""

import os
import pandas as pd
import pyodbc
from dotenv import load_dotenv

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────
DATA_DIR = "./data/raw"

conn_str = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={os.getenv('SQL_SERVER')};"
    f"DATABASE={os.getenv('SQL_DATABASE')};"
    f"UID={os.getenv('SQL_USERNAME')};"
    f"PWD={os.getenv('SQL_PASSWORD')};"
    "Encrypt=yes;TrustServerCertificate=yes;"
)


# ── Helpers ────────────────────────────────────────────────────────────────────
def get_conn():
    return pyodbc.connect(conn_str)


def run_sql(cursor, sql: str):
    cursor.execute(sql)
    cursor.commit()


def upsert(cursor, df: pd.DataFrame, table: str, merge_keys: list, schema: str = "lb_knn"):
    """
    Bulk upsert using a temp table + MERGE.
    Inserts new rows, updates existing ones based on merge_keys.
    """
    if df.empty:
        print(f"  [SKIP] {table} — no data")
        return

    full_table = f"[{schema}].[{table}]"
    temp_table = f"#tmp_{table}"
    cols = list(df.columns)

    col_definitions = ", ".join([f"[{c}] NVARCHAR(MAX)" for c in cols])
    insert_cols     = ", ".join([f"[{c}]" for c in cols])
    placeholders    = ", ".join(["?" for _ in cols])
    join_clause     = " AND ".join([f"target.[{k}] = source.[{k}]" for k in merge_keys])
    update_cols     = [c for c in cols if c not in merge_keys]
    update_clause   = ", ".join([f"target.[{c}] = source.[{c}]" for c in update_cols])
    insert_vals     = ", ".join([f"source.[{c}]" for c in cols])

    # Create temp table and bulk insert
    cursor.execute(f"CREATE TABLE {temp_table} ({col_definitions})")
    cursor.commit()

    insert_sql = f"INSERT INTO {temp_table} ({insert_cols}) VALUES ({placeholders})"
    df = df.where(pd.notnull(df), None)
    rows = [tuple(str(v) if v is not None else None for v in row)
            for row in df.itertuples(index=False, name=None)]

    batch_size = 500
    total = len(rows)
    for i in range(0, total, batch_size):
        cursor.executemany(insert_sql, rows[i:i + batch_size])
        cursor.commit()

    print(f"  {table}: {total:,} rows staged, merging...")

    # MERGE from temp into target
    if update_clause:
        merge_sql = f"""
            MERGE {full_table} AS target
            USING {temp_table} AS source
            ON {join_clause}
            WHEN MATCHED THEN
                UPDATE SET {update_clause}
            WHEN NOT MATCHED THEN
                INSERT ({insert_cols}) VALUES ({insert_vals});
        """
    else:
        merge_sql = f"""
            MERGE {full_table} AS target
            USING {temp_table} AS source
            ON {join_clause}
            WHEN NOT MATCHED THEN
                INSERT ({insert_cols}) VALUES ({insert_vals});
        """

    cursor.execute(merge_sql)
    cursor.commit()

    cursor.execute(f"DROP TABLE {temp_table}")
    cursor.commit()

    print(f"  ✓ {table} complete")


# ── Table DDLs ─────────────────────────────────────────────────────────────────
# Note: raw_tmdb_credits_cast drops and recreates if it has the old 'order' column name
DDLS = {
    "raw_tmdb_movie_list": """
        IF NOT EXISTS (
            SELECT * FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = 'lb_knn' AND t.name = 'raw_tmdb_movie_list'
        )
        CREATE TABLE lb_knn.raw_tmdb_movie_list (
            id                  INT PRIMARY KEY,
            title               NVARCHAR(500),
            original_language   NVARCHAR(10),
            overview            NVARCHAR(MAX),
            genre_ids           NVARCHAR(200),
            popularity          FLOAT,
            release_date        DATE,
            vote_average        FLOAT,
            vote_count          INT
        )
    """,
    "raw_tmdb_details": """
        IF NOT EXISTS (
            SELECT * FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = 'lb_knn' AND t.name = 'raw_tmdb_details'
        )
        CREATE TABLE lb_knn.raw_tmdb_details (
            movie_id             INT PRIMARY KEY,
            runtime              INT,
            budget               BIGINT,
            revenue              BIGINT,
            genres               NVARCHAR(500),
            production_countries NVARCHAR(500),
            imdb_id              NVARCHAR(20)
        )
    """,
    "raw_tmdb_credits_crew": """
        IF NOT EXISTS (
            SELECT * FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = 'lb_knn' AND t.name = 'raw_tmdb_credits_crew'
        )
        CREATE TABLE lb_knn.raw_tmdb_credits_crew (
            movie_id    INT,
            person_id   INT,
            job         NVARCHAR(200),
            PRIMARY KEY (movie_id, person_id, job)
        )
    """,
    "raw_tmdb_watch_providers": """
        IF NOT EXISTS (
            SELECT * FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = 'lb_knn' AND t.name = 'raw_tmdb_watch_providers'
        )
        CREATE TABLE lb_knn.raw_tmdb_watch_providers (
            movie_id        INT,
            provider_name   NVARCHAR(200),
            provider_type   NVARCHAR(50),
            PRIMARY KEY (movie_id, provider_name, provider_type)
        )
    """,
    "raw_tmdb_posters": """
        IF NOT EXISTS (
            SELECT * FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = 'lb_knn' AND t.name = 'raw_tmdb_posters'
        )
        CREATE TABLE lb_knn.raw_tmdb_posters (
            movie_id     INT,
            file_path    NVARCHAR(500),
            iso_639_1    NVARCHAR(10),
            vote_average FLOAT,
            vote_count   INT,
            width        INT,
            height       INT,
            PRIMARY KEY (movie_id, file_path)
        )
    """,
}


def ensure_cast_table(cursor):
    """
    Drop raw_tmdb_credits_cast if it has the old 'order' column, then recreate.
    Otherwise create fresh if it doesn't exist at all.
    """
    # Check if old column name exists
    cursor.execute("""
        SELECT COUNT(*) FROM sys.columns c
        JOIN sys.tables t ON c.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = 'lb_knn'
          AND t.name = 'raw_tmdb_credits_cast'
          AND c.name = 'order'
    """)
    has_old_col = cursor.fetchone()[0] > 0

    if has_old_col:
        print("  Dropping raw_tmdb_credits_cast (old schema)...")
        cursor.execute("DROP TABLE lb_knn.raw_tmdb_credits_cast")
        cursor.commit()

    cursor.execute("""
        IF NOT EXISTS (
            SELECT * FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = 'lb_knn' AND t.name = 'raw_tmdb_credits_cast'
        )
        CREATE TABLE lb_knn.raw_tmdb_credits_cast (
            movie_id    INT,
            person_id   INT,
            name        NVARCHAR(300),
            cast_order  INT,
            PRIMARY KEY (movie_id, person_id)
        )
    """)
    cursor.commit()


# ── Column loaders ─────────────────────────────────────────────────────────────
def load_movie_list() -> pd.DataFrame:
    df = pd.read_csv(f"{DATA_DIR}/tmdb_movie_list.csv")
    df = df[["id", "title", "original_language", "overview",
             "genre_ids", "popularity", "release_date",
             "vote_average", "vote_count"]]
    df["release_date"] = pd.to_datetime(df["release_date"], errors="coerce").dt.date
    df["genre_ids"] = df["genre_ids"].astype(str)
    return df


def load_details() -> pd.DataFrame:
    df = pd.read_csv(f"{DATA_DIR}/tmdb_details.csv")
    if "movie_id" not in df.columns and "id" in df.columns:
        df = df.rename(columns={"id": "movie_id"})
    df = df[["movie_id", "runtime", "budget", "revenue",
             "genres", "production_countries", "imdb_id"]]
    return df


def load_cast() -> pd.DataFrame:
    df = pd.read_csv(f"{DATA_DIR}/tmdb_credits_cast.csv")
    df = df[["movie_id", "person_id", "name", "order"]]
    df = df.rename(columns={"order": "cast_order"})
    return df


def load_crew() -> pd.DataFrame:
    df = pd.read_csv(f"{DATA_DIR}/tmdb_credits_crew.csv")
    df = df[["movie_id", "person_id", "job"]]
    return df


def load_watch_providers() -> pd.DataFrame:
    df = pd.read_csv(f"{DATA_DIR}/tmdb_watch_providers.csv")
    df = df[["movie_id", "provider_name", "provider_type"]]
    return df


def load_posters() -> pd.DataFrame:
    df = pd.read_csv(f"{DATA_DIR}/tmdb_posters.csv")
    df = df[["movie_id", "file_path", "iso_639_1",
             "vote_average", "vote_count", "width", "height"]]
    # Drop nulls in PK columns
    df = df.dropna(subset=["file_path"])
    # Deduplicate on PK — keep highest voted poster per movie+file_path
    df = df.sort_values("vote_count", ascending=False)
    df = df.drop_duplicates(subset=["movie_id", "file_path"], keep="first")
    return df


# ── Main ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n=== Connecting to SQL Server ===")
    conn   = get_conn()
    cursor = conn.cursor()
    print("✓ Connected\n")

    print("=== Ensuring tables exist ===")
    for table_name, ddl in DDLS.items():
        run_sql(cursor, ddl)
        print(f"  ✓ {table_name}")

    # Handle cast table separately (schema migration)
    ensure_cast_table(cursor)
    print(f"  ✓ raw_tmdb_credits_cast")

    tables = [
        ("raw_tmdb_movie_list",      load_movie_list,       ["id"]),
        ("raw_tmdb_details",         load_details,          ["movie_id"]),
        ("raw_tmdb_credits_cast",    load_cast,             ["movie_id", "person_id"]),
        ("raw_tmdb_credits_crew",    load_crew,             ["movie_id", "person_id", "job"]),
        ("raw_tmdb_watch_providers", load_watch_providers,  ["movie_id", "provider_name", "provider_type"]),
        ("raw_tmdb_posters",         load_posters,          ["movie_id", "file_path"]),
    ]

    for table_name, loader_fn, merge_keys in tables:
        print(f"\n=== Loading {table_name} ===")
        try:
            df = loader_fn()
            print(f"  Read {len(df):,} rows from CSV")
            upsert(cursor, df, table_name, merge_keys)
        except Exception as e:
            print(f"  [ERROR] {table_name}: {e}")

    cursor.close()
    conn.close()
    print("\n✅ All tables loaded successfully!")