"""
TMDB Full Pipeline
==================
Discovers top movies by vote count, enriches each with details,
credits, watch providers, and posters, then batch uploads
everything to Azure SQL Server.

Phases:
  1. Discover   — fetch movie IDs via /discover → data/raw/discovered_ids.csv
  2. Enrich     — hit detail endpoints per movie, load directly to SQL Server

Checkpoint:     data/checkpoint.json  (tracks completed movie IDs)
Resume:         just re-run — already-completed IDs are skipped

Usage:
  python tmdb_pipeline.py               # run all phases
  python tmdb_pipeline.py --phase 1     # discover only
  python tmdb_pipeline.py --phase 2     # enrich + load only
"""

import os
import sys
import json
import time
import argparse
import requests
import pandas as pd
import pyodbc
from pathlib import Path
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────
READ_TOKEN            = os.getenv("TMDB_READ_TOKEN")
BASE_URL              = "https://api.themoviedb.org/3"
DATA_DIR              = Path("./data/raw")
CHECKPOINT_FILE       = Path("./data/checkpoint.json")
IDS_FILE              = DATA_DIR / "discovered_ids.csv"

MAX_MOVIES            = 10_000  # safe for ~3 hours; bump to 50_000 for overnight
ENRICH_WORKERS        = 15      # parallel workers (stays well under TMDB 40 req/s)
RATE_DELAY            = 0.05    # seconds between requests per worker
FLUSH_EVERY           = 2_000   # flush buffers to CSV + DB every N movies
DB_BATCH_SIZE         = 1_000   # rows per SQL upsert batch
MAX_CAST_PER_MOVIE    = 10      # top N cast by cast_order
MAX_POSTERS_PER_MOVIE = 3       # top N posters by vote_count

HEADERS = {
    "Authorization": f"Bearer {READ_TOKEN}",
    "accept": "application/json"
}

conn_str = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={os.getenv('SQL_SERVER')};"
    f"DATABASE={os.getenv('SQL_DATABASE')};"
    f"UID={os.getenv('SQL_USERNAME')};"
    f"PWD={os.getenv('SQL_PASSWORD')};"
    "Encrypt=yes;TrustServerCertificate=yes;"
)

DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Exact column sets matched to existing DB tables ────────────────────────────
# Any mismatch here was the cause of all previous errors.
# These are derived directly from INFORMATION_SCHEMA.COLUMNS output.
TABLE_COLUMNS = {
    "details": [
        "movie_id", "title", "original_title", "original_language",
        "overview", "tagline", "status", "genre_ids", "genres",
        "production_countries", "popularity", "release_date", "runtime",
        "budget", "revenue", "vote_average", "vote_count", "imdb_id",
    ],
    "cast": [
        "movie_id", "person_id", "name", "cast_order",
    ],
    "crew": [
        # NOTE: no 'name' column in raw_tmdb_credits_crew
        "movie_id", "person_id", "job",
    ],
    "providers": [
        "movie_id", "provider_name", "provider_type",
    ],
    "posters": [
        "movie_id", "file_path", "iso_639_1", "vote_average",
        "vote_count", "width", "height",
    ],
}

TABLE_TARGETS = {
    "details":   "[lb_knn].[raw_tmdb_movie_list]",
    "cast":      "[lb_knn].[raw_tmdb_credits_cast]",
    "crew":      "[lb_knn].[raw_tmdb_credits_crew]",
    "providers": "[lb_knn].[raw_tmdb_watch_providers]",
    "posters":   "[lb_knn].[raw_tmdb_posters]",
}

TABLE_MERGE_KEYS = {
    "details":   ["movie_id"],
    "cast":      ["movie_id", "person_id"],
    "crew":      ["movie_id", "person_id", "job"],
    "providers": ["movie_id", "provider_name", "provider_type"],
    "posters":   ["movie_id", "file_path"],
}

CSV_PREFIXES = {
    "details":   "tmdb_details",
    "cast":      "tmdb_credits_cast",
    "crew":      "tmdb_credits_crew",
    "providers": "tmdb_watch_providers",
    "posters":   "tmdb_posters",
}


# ── Checkpoint ─────────────────────────────────────────────────────────────────
def load_checkpoint() -> set:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            data = json.load(f)
        completed = set(data.get("completed_ids", []))
        print(f"  Resuming — {len(completed):,} movies already processed")
        return completed
    return set()


def save_checkpoint(completed_ids: set):
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump({"completed_ids": list(completed_ids)}, f)


# ── HTTP ───────────────────────────────────────────────────────────────────────
def tmdb_get(endpoint: str, params: dict = {}, retries: int = 3) -> dict:
    url = f"{BASE_URL}{endpoint}"
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=10)
            time.sleep(RATE_DELAY)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                retry_after = int(r.headers.get("Retry-After", 10))
                print(f"  [RATE LIMIT] backing off {retry_after}s")
                time.sleep(retry_after)
            elif r.status_code == 404:
                return {}
            else:
                time.sleep(1)
        except Exception as e:
            if attempt == retries - 1:
                print(f"  [ERROR] {endpoint}: {e}")
            time.sleep(2)
    return {}


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — DISCOVER
# ══════════════════════════════════════════════════════════════════════════════
def phase1_discover():
    print("\n" + "="*60)
    print("PHASE 1 — Discovering movie IDs")
    print("="*60)

    if IDS_FILE.exists():
        existing = pd.read_csv(IDS_FILE)
        existing_ids = existing["movie_id"].tolist()
        if len(existing_ids) >= MAX_MOVIES:
            print(f"  Found {len(existing_ids):,} IDs already — skipping discovery")
            return existing_ids[:MAX_MOVIES]
        else:
            print(f"  Found {len(existing_ids):,} IDs but need {MAX_MOVIES:,} — re-discovering")

    all_ids = []
    seen = set()

    vote_bands = [
        (10000, None),
        (5000,  9999),
        (2000,  4999),
        (1000,  1999),
        (500,   999),
        (200,   499),
        (100,   199),
        (50,    99),
        (10,    49),
    ]

    for band_gte, band_lte in vote_bands:
        if len(all_ids) >= MAX_MOVIES:
            break

        band_label = f"{band_gte}–{band_lte if band_lte else '∞'}"
        print(f"\n  Vote band: {band_label}")
        band_ids = []

        for page in range(1, 501):
            if len(all_ids) + len(band_ids) >= MAX_MOVIES:
                break

            params = {
                "sort_by":        "vote_count.desc",
                "include_adult":  "false",
                "include_video":  "false",
                "page":           page,
                "vote_count.gte": band_gte,
            }
            if band_lte:
                params["vote_count.lte"] = band_lte

            data = tmdb_get("/discover/movie", params=params)
            total_pages = min(data.get("total_pages", 1), 500)
            new_ids = [m["id"] for m in data.get("results", []) if m["id"] not in seen]

            for mid in new_ids:
                seen.add(mid)
                band_ids.append(mid)

            if page % 100 == 0 or page == total_pages:
                print(f"    page {page}/{total_pages} — "
                      f"{len(all_ids) + len(band_ids):,} total IDs so far")

            if page >= total_pages:
                break

        all_ids.extend(band_ids)
        print(f"  Band {band_label}: {len(band_ids):,} movies "
              f"(running total: {len(all_ids):,})")

    all_ids = all_ids[:MAX_MOVIES]
    print(f"\n✓ Discovered {len(all_ids):,} unique movie IDs")
    pd.DataFrame({"movie_id": all_ids}).to_csv(IDS_FILE, index=False)
    print(f"✓ Saved to {IDS_FILE}")
    return all_ids


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — ENRICH + LOAD
# ══════════════════════════════════════════════════════════════════════════════
def enrich_movie(movie_id: int) -> dict:
    """Fetch all endpoints for a single movie, returning only columns that exist in DB."""
    rows = {k: [] for k in TABLE_COLUMNS}

    # Details
    d = tmdb_get(f"/movie/{movie_id}", params={"language": "en-US"})
    if d:
        rows["details"].append({
            "movie_id":             d.get("id"),
            "title":                d.get("title"),
            "original_title":       d.get("original_title"),
            "original_language":    d.get("original_language"),
            "overview":             d.get("overview"),
            "tagline":              d.get("tagline"),
            "status":               d.get("status"),
            "genre_ids":            "|".join([str(g["id"]) for g in d.get("genres", [])]),
            "genres":               "|".join([g["name"] for g in d.get("genres", [])]),
            "production_countries": "|".join([c["iso_3166_1"] for c in d.get("production_countries", [])]),
            "popularity":           d.get("popularity"),
            "release_date":         d.get("release_date"),
            "runtime":              d.get("runtime"),
            "budget":               d.get("budget"),
            "revenue":              d.get("revenue"),
            "vote_average":         d.get("vote_average"),
            "vote_count":           d.get("vote_count"),
            "imdb_id":              d.get("imdb_id"),
        })

    # Credits
    c = tmdb_get(f"/movie/{movie_id}/credits")
    for actor in c.get("cast", [])[:MAX_CAST_PER_MOVIE]:
        rows["cast"].append({
            "movie_id":  movie_id,
            "person_id": actor.get("id"),
            "name":      actor.get("name"),
            "cast_order":actor.get("order"),
        })
    for crew in c.get("crew", []):
        if crew.get("job") in ("Director", "Screenplay", "Producer", "Original Music Composer"):
            rows["crew"].append({
                # No 'name' — matches raw_tmdb_credits_crew schema exactly
                "movie_id":  movie_id,
                "person_id": crew.get("id"),
                "job":       crew.get("job"),
            })

    # Watch Providers (US only)
    wp = tmdb_get(f"/movie/{movie_id}/watch/providers")
    us = wp.get("results", {}).get("US", {})
    seen_providers = set()
    for ptype in ("flatrate", "rent", "buy"):
        for p in us.get(ptype, []):
            key = (p.get("provider_name"), ptype)
            if key not in seen_providers:
                seen_providers.add(key)
                rows["providers"].append({
                    "movie_id":      movie_id,
                    "provider_name": p.get("provider_name"),
                    "provider_type": ptype,
                })

    # Posters — top N by vote_count (TMDB returns sorted desc by default)
    img = tmdb_get(f"/movie/{movie_id}/images")
    seen_paths = set()
    poster_count = 0
    for poster in img.get("posters", []):
        if poster_count >= MAX_POSTERS_PER_MOVIE:
            break
        fp = poster.get("file_path")
        if fp and fp not in seen_paths:
            seen_paths.add(fp)
            rows["posters"].append({
                "movie_id":     movie_id,
                "file_path":    fp,
                "iso_639_1":    poster.get("iso_639_1"),
                "vote_average": poster.get("vote_average"),
                "vote_count":   poster.get("vote_count"),
                "width":        poster.get("width"),
                "height":       poster.get("height"),
            })
            poster_count += 1

    return rows


def flush_batch(buffers: dict, batch_num: int, cursor) -> int:
    """Write buffers to CSV backup and upsert to SQL Server."""
    total_rows = 0

    for key in TABLE_COLUMNS:
        if not buffers[key]:
            continue

        df = pd.DataFrame(buffers[key])

        # Enforce exact column set for this table
        cols = TABLE_COLUMNS[key]
        for col in cols:
            if col not in df.columns:
                df[col] = None
        df = df[cols]

        # Deduplicate posters on PK
        if key == "posters":
            df = df.dropna(subset=["file_path"])
            df = df.drop_duplicates(subset=["movie_id", "file_path"], keep="first")

        # Save CSV backup
        csv_path = DATA_DIR / f"{CSV_PREFIXES[key]}_batch{batch_num:04d}.csv"
        df.to_csv(csv_path, index=False)

        n = upsert_df(cursor, df, TABLE_TARGETS[key], TABLE_MERGE_KEYS[key])
        total_rows += n

    return total_rows


def phase2_enrich_and_load(movie_ids: list, cursor):
    print("\n" + "="*60)
    print("PHASE 2 — Enriching + Loading")
    print("="*60)

    completed = load_checkpoint()
    remaining = [mid for mid in movie_ids if mid not in completed]
    print(f"  {len(remaining):,} movies to process ({len(completed):,} already done)\n")

    if not remaining:
        print("  All movies already processed!")
        return

    buffers         = {k: [] for k in TABLE_COLUMNS}
    buffer_lock     = Lock()
    checkpoint_lock = Lock()
    batch_num       = len(list(DATA_DIR.glob("tmdb_details_batch*.csv")))
    processed       = 0
    errors          = 0
    total_loaded    = 0
    start           = time.time()

    def process_one(movie_id):
        try:
            return movie_id, enrich_movie(movie_id), None
        except Exception as e:
            return movie_id, None, str(e)

    with ThreadPoolExecutor(max_workers=ENRICH_WORKERS) as executor:
        futures = {executor.submit(process_one, mid): mid for mid in remaining}

        for future in as_completed(futures):
            movie_id, result, error = future.result()

            if error:
                errors += 1
            else:
                with buffer_lock:
                    for key in buffers:
                        buffers[key].extend(result.get(key, []))

            with checkpoint_lock:
                completed.add(movie_id)
                processed += 1

            if processed % FLUSH_EVERY == 0:
                with buffer_lock:
                    batch_num += 1
                    n = flush_batch(buffers, batch_num, cursor)
                    total_loaded += n
                    for key in buffers:
                        buffers[key] = []

                save_checkpoint(completed)

                elapsed = time.time() - start
                rate    = processed / elapsed
                eta_min = ((len(remaining) - processed) / rate / 60) if rate > 0 else 0
                print(f"  [{processed:,}/{len(remaining):,}] "
                      f"Batch {batch_num} → {n:,} rows | "
                      f"{rate:.1f} movies/s | "
                      f"ETA: {eta_min:.0f} min | "
                      f"Errors: {errors}")

    # Final flush
    with buffer_lock:
        if any(buffers[k] for k in buffers):
            batch_num += 1
            n = flush_batch(buffers, batch_num, cursor)
            total_loaded += n

    save_checkpoint(completed)
    elapsed = time.time() - start
    print(f"\n✓ Done in {elapsed/60:.1f} min")
    print(f"  {processed:,} movies | {total_loaded:,} total rows | {errors:,} errors")


# ══════════════════════════════════════════════════════════════════════════════
# SQL HELPERS
# ══════════════════════════════════════════════════════════════════════════════
def get_conn():
    return pyodbc.connect(conn_str)


def upsert_df(cursor, df: pd.DataFrame, full_table: str, merge_keys: list) -> int:
    if df.empty:
        return 0

    temp = "#tmp_" + full_table.replace(".", "_").replace("[", "").replace("]", "")
    cols = list(df.columns)

    col_defs      = ", ".join([f"[{c}] NVARCHAR(MAX)" for c in cols])
    insert_cols   = ", ".join([f"[{c}]" for c in cols])
    placeholders  = ", ".join(["?" for _ in cols])
    join_clause   = " AND ".join([f"target.[{k}] = source.[{k}]" for k in merge_keys])
    update_cols   = [c for c in cols if c not in merge_keys]
    update_clause = ", ".join([f"target.[{c}] = source.[{c}]" for c in update_cols])
    insert_vals   = ", ".join([f"source.[{c}]" for c in cols])

    cursor.execute(f"CREATE TABLE {temp} ({col_defs})")
    cursor.commit()

    df = df.where(pd.notnull(df), None)
    rows = [tuple(str(v) if v is not None else None for v in row)
            for row in df.itertuples(index=False, name=None)]

    insert_sql = f"INSERT INTO {temp} ({insert_cols}) VALUES ({placeholders})"
    for i in range(0, len(rows), DB_BATCH_SIZE):
        cursor.executemany(insert_sql, rows[i:i + DB_BATCH_SIZE])
    cursor.commit()

    if update_clause:
        merge_sql = f"""
            MERGE {full_table} AS target
            USING {temp} AS source ON {join_clause}
            WHEN MATCHED THEN UPDATE SET {update_clause}
            WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals});
        """
    else:
        merge_sql = f"""
            MERGE {full_table} AS target
            USING {temp} AS source ON {join_clause}
            WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals});
        """

    cursor.execute(merge_sql)
    cursor.commit()
    cursor.execute(f"DROP TABLE {temp}")
    cursor.commit()
    return len(rows)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TMDB Pipeline")
    parser.add_argument("--phase", type=int, choices=[1, 2],
                        help="Run a specific phase only (default: all)")
    args = parser.parse_args()

    if args.phase == 1 or args.phase is None:
        movie_ids = phase1_discover()
    else:
        if IDS_FILE.exists():
            movie_ids = pd.read_csv(IDS_FILE)["movie_id"].tolist()
            print(f"Loaded {len(movie_ids):,} IDs from {IDS_FILE}")
        else:
            print("ERROR: Run --phase 1 first to discover movie IDs")
            sys.exit(1)

    if args.phase == 2 or args.phase is None:
        print("\n=== Connecting to SQL Server ===")
        conn   = get_conn()
        cursor = conn.cursor()
        print("✓ Connected\n")
        phase2_enrich_and_load(movie_ids, cursor)
        cursor.close()
        conn.close()

    print("\n🎬 Pipeline complete!")