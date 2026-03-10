"""
TMDB Extraction Script
======================
Pulls popular, top-rated, now-playing, and upcoming movies from TMDB.
For each unique movie, enriches with: details, credits, keywords,
reviews, release dates, watch providers, and poster images.

Outputs CSVs to: ./data/raw/
"""

import os
import time
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
API_KEY       = os.getenv("TMDB_API_KEY")
READ_TOKEN    = os.getenv("TMDB_READ_TOKEN")
BASE_URL      = "https://api.themoviedb.org/3"
OUTPUT_DIR    = "./data/raw"
PAGES_LIST    = 20
PAGES_CURRENT = 10
RATE_LIMIT_DELAY = 0.05

HEADERS = {
    "Authorization": f"Bearer {READ_TOKEN}",
    "accept": "application/json"
}

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────
def get(endpoint: str, params: dict = {}) -> dict:
    url = f"{BASE_URL}{endpoint}"
    response = requests.get(url, headers=HEADERS, params=params)
    time.sleep(RATE_LIMIT_DELAY)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"  [WARN] {response.status_code} on {endpoint}")
        return {}


def fetch_list_pages(endpoint: str, n_pages: int) -> list:
    results = []
    for page in range(1, n_pages + 1):
        data = get(endpoint, params={"page": page, "language": "en-US"})
        results.extend(data.get("results", []))
        print(f"  {endpoint} — page {page}/{n_pages} ({len(results)} movies so far)")
    return results


# ── Step 1: Collect movie IDs ─────────────────────────────────────────────────
print("\n=== Fetching movie lists ===")

popular     = fetch_list_pages("/movie/popular",     PAGES_LIST)
top_rated   = fetch_list_pages("/movie/top_rated",   PAGES_LIST)
now_playing = fetch_list_pages("/movie/now_playing", PAGES_CURRENT)
upcoming    = fetch_list_pages("/movie/upcoming",    PAGES_CURRENT)

all_movies = {m["id"]: m for m in popular + top_rated + now_playing + upcoming}
movie_ids  = list(all_movies.keys())

print(f"\n✓ {len(movie_ids)} unique movies collected")

base_df = pd.DataFrame(all_movies.values())
base_df.to_csv(f"{OUTPUT_DIR}/tmdb_movie_list.csv", index=False)
print(f"✓ Saved tmdb_movie_list.csv")


# ── Step 2: Enrich each movie ─────────────────────────────────────────────────
print(f"\n=== Enriching {len(movie_ids)} movies ===")

details_rows      = []
credits_cast_rows = []
credits_crew_rows = []
keywords_rows     = []
reviews_rows      = []
release_date_rows = []
providers_rows    = []
posters_rows      = []

for i, movie_id in enumerate(movie_ids):
    if i % 100 == 0:
        print(f"  Progress: {i}/{len(movie_ids)}")

    # Details
    d = get(f"/movie/{movie_id}", params={"language": "en-US"})
    if d:
        details_rows.append({
            "movie_id":             d.get("id"),
            "title":                d.get("title"),
            "original_title":       d.get("original_title"),
            "overview":             d.get("overview"),
            "tagline":              d.get("tagline"),
            "status":               d.get("status"),
            "release_date":         d.get("release_date"),
            "runtime":              d.get("runtime"),
            "budget":               d.get("budget"),
            "revenue":              d.get("revenue"),
            "popularity":           d.get("popularity"),
            "vote_average":         d.get("vote_average"),
            "vote_count":           d.get("vote_count"),
            "original_language":    d.get("original_language"),
            "genres":               "|".join([g["name"] for g in d.get("genres", [])]),
            "production_countries": "|".join([c["iso_3166_1"] for c in d.get("production_countries", [])]),
            "imdb_id":              d.get("imdb_id"),
        })

    # Credits
    c = get(f"/movie/{movie_id}/credits")
    for actor in c.get("cast", [])[:20]:
        credits_cast_rows.append({
            "movie_id":  movie_id,
            "person_id": actor.get("id"),
            "name":      actor.get("name"),
            "order":     actor.get("order"),
        })
    for crew in c.get("crew", []):
        if crew.get("job") in ("Director", "Screenplay", "Producer", "Original Music Composer"):
            credits_crew_rows.append({
                "movie_id":   movie_id,
                "person_id":  crew.get("id"),
                "name":       crew.get("name"),
                "job":        crew.get("job"),
                "department": crew.get("department"),
            })

    # Keywords
    k = get(f"/movie/{movie_id}/keywords")
    for kw in k.get("keywords", []):
        keywords_rows.append({
            "movie_id":   movie_id,
            "keyword_id": kw.get("id"),
            "keyword":    kw.get("name"),
        })

    # Reviews
    r = get(f"/movie/{movie_id}/reviews")
    for review in r.get("results", []):
        author_details = review.get("author_details", {})
        reviews_rows.append({
            "movie_id":   movie_id,
            "review_id":  review.get("id"),
            "author":     review.get("author"),
            "rating":     author_details.get("rating"),
            "content":    review.get("content"),
            "created_at": review.get("created_at"),
            "updated_at": review.get("updated_at"),
        })

    # Release Dates
    rd = get(f"/movie/{movie_id}/release_dates")
    for country in rd.get("results", []):
        for rel in country.get("release_dates", []):
            release_date_rows.append({
                "movie_id":      movie_id,
                "country":       country.get("iso_3166_1"),
                "release_date":  rel.get("release_date"),
                "release_type":  rel.get("type"),
                "certification": rel.get("certification"),
            })

    # Watch Providers
    wp = get(f"/movie/{movie_id}/watch/providers")
    us_data = wp.get("results", {}).get("US", {})
    for provider_type in ("flatrate", "rent", "buy"):
        for p in us_data.get(provider_type, []):
            providers_rows.append({
                "movie_id":      movie_id,
                "provider_name": p.get("provider_name"),
                "provider_type": provider_type,
            })

    # Posters
    img = get(f"/movie/{movie_id}/images")
    for poster in img.get("posters", []):
        posters_rows.append({
            "movie_id":     movie_id,
            "file_path":    poster.get("file_path"),
            "iso_639_1":    poster.get("iso_639_1"),
            "vote_average": poster.get("vote_average"),
            "vote_count":   poster.get("vote_count"),
            "width":        poster.get("width"),
            "height":       poster.get("height"),
        })


# ── Step 3: Save all CSVs ─────────────────────────────────────────────────────
print("\n=== Saving CSVs ===")

files = {
    "tmdb_details.csv":         details_rows,
    "tmdb_credits_cast.csv":    credits_cast_rows,
    "tmdb_credits_crew.csv":    credits_crew_rows,
    "tmdb_keywords.csv":        keywords_rows,
    "tmdb_reviews.csv":         reviews_rows,
    "tmdb_release_dates.csv":   release_date_rows,
    "tmdb_watch_providers.csv": providers_rows,
    "tmdb_posters.csv":         posters_rows,
}

for filename, rows in files.items():
    df = pd.DataFrame(rows)
    path = f"{OUTPUT_DIR}/{filename}"
    df.to_csv(path, index=False)
    print(f"  ✓ {filename} — {len(df):,} rows")

print("\n✅ Extraction complete!")
print(f"   All files saved to {OUTPUT_DIR}/")