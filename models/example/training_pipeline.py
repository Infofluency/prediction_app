"""
Letterboxd Training Data Pipeline
==================================
Discovers popular Letterboxd users, scrapes their ratings,
and loads everything into Azure SQL Server for KNN recommendations.

Usage:
  python training_pipeline.py                    # discover + scrape (default 1000 users)
  python training_pipeline.py --users 5000       # custom user count
  python training_pipeline.py --phase discover   # discover users only
  python training_pipeline.py --phase scrape     # scrape ratings only (uses saved users)

Requires: pip install cloudscraper beautifulsoup4 pyodbc python-dotenv
"""

import os
import sys
import re
import json
import time
import argparse
import pyodbc
import cloudscraper
import pandas as pd
from pathlib import Path
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────
DATA_DIR          = Path("./data/training")
USERS_FILE        = DATA_DIR / "discovered_users.csv"
CHECKPOINT_FILE   = DATA_DIR / "training_checkpoint.json"
BATCH_SIZE        = 50         # users per DB flush
MIN_RATINGS       = 20         # skip users with fewer ratings
SESSION_REFRESH   = 25         # create fresh session every N users

STARS = {
    "★": 1, "★★": 2, "★★★": 3, "★★★★": 4, "★★★★★": 5,
    "½": 0.5, "★½": 1.5, "★★½": 2.5, "★★★½": 3.5, "★★★★½": 4.5,
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

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def make_session():
    """Create a fresh cloudscraper session and warm it up."""
    s = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "desktop": True},
        delay=5,
    )
    try:
        r = s.get("https://letterboxd.com/", headers=HEADERS, timeout=20)
        print(f"  [Session] Warm-up → {r.status_code}")
    except Exception as e:
        print(f"  [Session] Warm-up failed: {e}")
    return s


# ── Checkpoint ─────────────────────────────────────────────────────────────
def load_checkpoint() -> set:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            data = json.load(f)
        completed = set(data.get("completed_users", []))
        print(f"  Resuming — {len(completed):,} users already scraped")
        return completed
    return set()


def save_checkpoint(completed: set):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump({"completed_users": list(completed)}, f)


# ══════════════════════════════════════════════════════════════════════════
# PHASE 1 — DISCOVER USERS
# ══════════════════════════════════════════════════════════════════════════
def discover_users(target_count: int) -> list:
    print("\n" + "=" * 60)
    print("PHASE 1 — Discovering Letterboxd users")
    print("=" * 60)

    if USERS_FILE.exists():
        existing = pd.read_csv(USERS_FILE)
        if len(existing) >= target_count:
            print(f"  Found {len(existing):,} users already — skipping discovery")
            return existing["username"].tolist()[:target_count]

    usernames = []
    seen = set()
    session = make_session()

    page = 1
    while len(usernames) < target_count:
        url = f"https://letterboxd.com/members/popular/this/all-time/page/{page}/"
        try:
            r = session.get(url, headers=HEADERS, timeout=15)
            if r.status_code != 200:
                print(f"  Members page {page} → {r.status_code}, stopping")
                break

            soup = BeautifulSoup(r.text, "html.parser")

            found = 0
            for link in soup.select("a.name"):
                href = link.get("href", "")
                match = re.match(r"^/([^/]+)/$", href)
                if match:
                    username = match.group(1)
                    if username not in seen:
                        seen.add(username)
                        usernames.append(username)
                        found += 1

            if found == 0:
                for link in soup.find_all("a", href=True):
                    href = link["href"]
                    if re.match(r"^/[a-zA-Z0-9_]+/$", href) and href not in ["/", "/films/", "/members/", "/lists/", "/journal/"]:
                        username = href.strip("/")
                        if username not in seen and len(username) >= 2:
                            seen.add(username)
                            usernames.append(username)
                            found += 1

            print(f"  Page {page}: {found} new users ({len(usernames):,} total)")

            if found == 0:
                break

            page += 1
            time.sleep(0.5)

        except Exception as e:
            print(f"  Error on page {page}: {e}")
            time.sleep(2)
            page += 1

    usernames = usernames[:target_count]
    pd.DataFrame({"username": usernames}).to_csv(USERS_FILE, index=False)
    print(f"\n✓ Discovered {len(usernames):,} users → {USERS_FILE}")
    return usernames


# ══════════════════════════════════════════════════════════════════════════
# PHASE 2 — SCRAPE RATINGS
# ══════════════════════════════════════════════════════════════════════════
def extract_name_year(full_name):
    m = re.match(r"^(.+?)\s*\((\d{4})\)\s*$", full_name)
    if m:
        return m.group(1).strip(), m.group(2)
    return full_name.strip(), ""


def get_num_pages(soup):
    pages = soup.select(".paginate-pages li a")
    if pages:
        last = pages[-1].get_text(strip=True)
        return int(last) if last.isdigit() else 1
    return 1


def fetch_with_timeout(session, url, timeout=10):
    """Fetch a URL with a hard timeout. Returns (status_code, text) or (0, '')."""
    try:
        r = session.get(url, headers=HEADERS, timeout=timeout)
        return r.status_code, r.text
    except Exception:
        return 0, ""


def scrape_user_ratings(session, username):
    """Scrape ratings for a single user (capped at ~500 for speed)."""
    ratings = []
    MAX_PAGES = 7  # ~500 ratings max (72 per page)

    status, html = fetch_with_timeout(session, f"https://letterboxd.com/{username}/films/")
    if status != 200:
        return ratings, status

    soup = BeautifulSoup(html, "html.parser")
    total_pages = min(get_num_pages(soup), MAX_PAGES)

    parse_ratings_page(soup, username, ratings)

    for page in range(2, total_pages + 1):
        status, html = fetch_with_timeout(session, f"https://letterboxd.com/{username}/films/page/{page}/")
        if status != 200:
            break
        soup = BeautifulSoup(html, "html.parser")
        parse_ratings_page(soup, username, ratings)

    return ratings, 200


def parse_ratings_page(soup, username, ratings):
    for item in soup.select("li.poster-container, li.griditem"):
        poster = item.find(attrs={"data-film-id": True})
        if not poster:
            continue

        film_id = poster.get("data-film-id", "")
        film_slug = poster.get("data-item-slug", "") or poster.get("data-film-slug", "")
        raw_name = (poster.get("data-item-name", "")
                    or poster.get("data-film-name", "")
                    or poster.get("data-item-full-display-name", ""))

        name, year = extract_name_year(raw_name)

        rating = 0
        rated_el = item.find(class_=re.compile(r"rated-\d+"))
        if rated_el:
            m = re.search(r"rated-(\d+)", " ".join(rated_el.get("class", [])))
            if m:
                rating = int(m.group(1)) / 2

        if rating == 0:
            rating_el = item.find(class_="rating")
            if rating_el:
                star_text = rating_el.get_text(strip=True)
                rating = STARS.get(star_text, 0)

        if film_id and name and rating > 0:
            ratings.append({
                "username": username,
                "letterboxd_film_id": film_id,
                "film_name": name,
                "film_year": year,
                "film_slug": film_slug,
                "rating": rating,
            })


def flush_to_db(cursor, batch):
    if not batch:
        return 0

    rows_inserted = 0
    for i in range(0, len(batch), 500):
        chunk = batch[i:i + 500]

        values = []
        for r in chunk:
            name = r["film_name"].replace("'", "''")
            slug = r["film_slug"].replace("'", "''")
            username = r["username"].replace("'", "''")
            values.append(
                f"('{username}', '{r['letterboxd_film_id']}', "
                f"N'{name}', '{r['film_year']}', '{slug}', {r['rating']})"
            )

        try:
            sql = f"""
                MERGE lb_knn.training_ratings AS target
                USING (VALUES {','.join(values)})
                  AS source(username, letterboxd_film_id, film_name, film_year, film_slug, rating)
                ON target.username = source.username
                   AND target.letterboxd_film_id = source.letterboxd_film_id
                WHEN NOT MATCHED THEN
                  INSERT (username, letterboxd_film_id, film_name, film_year, film_slug, rating)
                  VALUES (source.username, source.letterboxd_film_id, source.film_name,
                          source.film_year, source.film_slug, source.rating);
            """
            cursor.execute(sql)
            cursor.commit()
            rows_inserted += len(chunk)
        except Exception as e:
            print(f"  [DB ERROR] {e}")
            try:
                cursor.commit()
            except Exception:
                pass

    return rows_inserted


def flush_users_to_db(cursor, user_data):
    if not user_data:
        return

    values = []
    for username, count in user_data:
        values.append(f"('{username.replace(chr(39), chr(39)+chr(39))}', {count})")

    try:
        sql = f"""
            MERGE lb_knn.training_users AS target
            USING (VALUES {','.join(values)})
              AS source(username, total_ratings)
            ON target.username = source.username
            WHEN MATCHED THEN
              UPDATE SET total_ratings = source.total_ratings, scraped_at = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (username, total_ratings)
              VALUES (source.username, source.total_ratings);
        """
        cursor.execute(sql)
        cursor.commit()
    except Exception as e:
        print(f"  [DB ERROR users] {e}")


def scrape_ratings(usernames: list, cursor):
    print("\n" + "=" * 60)
    print("PHASE 2 — Scraping ratings")
    print("=" * 60)

    completed = load_checkpoint()
    remaining = [u for u in usernames if u not in completed]
    print(f"  {len(remaining):,} users to scrape ({len(completed):,} already done)\n")

    if not remaining:
        print("  All users already scraped!")
        return

    session = make_session()

    ratings_buffer = []
    users_buffer = []
    processed = 0
    total_ratings = 0
    skipped = 0
    errors = 0
    consecutive_fails = 0
    start = time.time()

    for username in remaining:
        # Refresh session periodically to avoid stale cookies
        if processed > 0 and processed % SESSION_REFRESH == 0:
            print(f"  [Session] Refreshing...")
            session = make_session()
            consecutive_fails = 0

        ratings, status = scrape_user_ratings(session, username)

        if status != 200:
            errors += 1
            consecutive_fails += 1
            print(f"  ✗ {username}: HTTP {status}")

            # If too many consecutive failures, refresh session
            if consecutive_fails >= 5:
                print(f"  [Session] {consecutive_fails} consecutive fails — refreshing...")
                session = make_session()
                consecutive_fails = 0
                time.sleep(2)
        elif len(ratings) < MIN_RATINGS:
            skipped += 1
            consecutive_fails = 0
            print(f"  ○ {username}: {len(ratings)} ratings (skipped, < {MIN_RATINGS})")
        else:
            ratings_buffer.extend(ratings)
            users_buffer.append((username, len(ratings)))
            total_ratings += len(ratings)
            consecutive_fails = 0
            print(f"  ✓ {username}: {len(ratings)} ratings")

        completed.add(username)
        processed += 1

        # Flush every BATCH_SIZE users
        if processed % BATCH_SIZE == 0:
            flush_to_db(cursor, ratings_buffer)
            flush_users_to_db(cursor, users_buffer)
            ratings_buffer = []
            users_buffer = []
            save_checkpoint(completed)

            elapsed = time.time() - start
            rate = processed / elapsed if elapsed > 0 else 0
            eta_min = ((len(remaining) - processed) / rate / 60) if rate > 0 else 0

            print(f"\n  --- [{processed:,}/{len(remaining):,}] "
                  f"{total_ratings:,} ratings | "
                  f"{rate:.1f} users/s | "
                  f"ETA: {eta_min:.0f} min | "
                  f"Skipped: {skipped} | Errors: {errors} ---\n")

        time.sleep(0.1)

    # Final flush
    if ratings_buffer:
        flush_to_db(cursor, ratings_buffer)
        flush_users_to_db(cursor, users_buffer)

    save_checkpoint(completed)

    elapsed = time.time() - start
    print(f"\n✓ Done in {elapsed / 60:.1f} min")
    print(f"  {processed:,} users | {total_ratings:,} ratings | "
          f"{skipped:,} skipped | {errors:,} errors")


# ══════════════════════════════════════════════════════════════════════════
# PHASE 3 — MATCH MOVIE IDS
# ══════════════════════════════════════════════════════════════════════════
def match_movie_ids(cursor):
    print("\n" + "=" * 60)
    print("PHASE 3 — Matching training ratings to TMDB movie IDs")
    print("=" * 60)

    cursor.execute("""
        UPDATE tr
        SET tr.movie_id = ml.movie_id
        FROM lb_knn.training_ratings tr
        INNER JOIN lb_knn.raw_tmdb_movie_list ml
          ON LOWER(LTRIM(RTRIM(tr.film_name))) = LOWER(LTRIM(RTRIM(ml.title)))
          AND tr.film_year = CAST(YEAR(ml.release_date) AS VARCHAR(4))
        WHERE tr.movie_id IS NULL
          AND ml.title IS NOT NULL
          AND ml.release_date IS NOT NULL
    """)
    matched = cursor.rowcount
    cursor.commit()

    cursor.execute("SELECT COUNT(*) FROM lb_knn.training_ratings")
    total = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM lb_knn.training_ratings WHERE movie_id IS NOT NULL")
    with_id = cursor.fetchone()[0]

    print(f"  Matched {matched:,} new ratings this run")
    print(f"  Total: {with_id:,}/{total:,} ratings have movie_ids ({100 * with_id / total:.1f}%)")


# ══════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Letterboxd Training Data Pipeline")
    parser.add_argument("--users", type=int, default=1000, help="Target number of users")
    parser.add_argument("--phase", choices=["discover", "scrape", "match"],
                        help="Run a specific phase only (default: all)")
    args = parser.parse_args()

    if args.phase in (None, "discover"):
        usernames = discover_users(args.users)
    else:
        if USERS_FILE.exists():
            usernames = pd.read_csv(USERS_FILE)["username"].tolist()
            print(f"Loaded {len(usernames):,} users from {USERS_FILE}")
        else:
            print("ERROR: Run discovery first")
            sys.exit(1)

    print("\n=== Connecting to SQL Server ===")
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    print("✓ Connected\n")

    if args.phase in (None, "scrape"):
        scrape_ratings(usernames, cursor)

    if args.phase in (None, "match"):
        match_movie_ids(cursor)

    cursor.close()
    conn.close()
    print("\n🎬 Training pipeline complete!")