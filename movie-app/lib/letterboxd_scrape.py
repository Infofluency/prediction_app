"""
Letterboxd scraper — fetches ratings and watchlist via HTTP.
Called from Node.js, outputs JSON to stdout.

Usage: python letterboxd_scrape.py <username>
"""

import sys
import json
import re
import time
import cloudscraper
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

STARS = {
    "★": 1, "★★": 2, "★★★": 3, "★★★★": 4, "★★★★★": 5,
    "½": 0.5, "★½": 1.5, "★★½": 2.5, "★★★½": 3.5, "★★★★½": 4.5,
}

MAX_WORKERS = 3


def get_num_pages(soup):
    pages = soup.select(".paginate-pages li a")
    if pages:
        last = pages[-1].get_text(strip=True)
        return int(last) if last.isdigit() else 1
    return 1


def extract_name_year(full_name):
    m = re.match(r"^(.+?)\s*\((\d{4})\)\s*$", full_name)
    if m:
        return m.group(1).strip(), m.group(2)
    return full_name.strip(), ""


def fetch_page(session, url, retries=2):
    """Fetch a single page with retries."""
    for attempt in range(retries + 1):
        try:
            r = session.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                return url, BeautifulSoup(r.text, "html.parser")
            if attempt < retries:
                time.sleep(1)
        except Exception:
            if attempt < retries:
                time.sleep(1)
    return url, None


def parse_films_page(soup):
    results = []
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

        if film_id and name:
            results.append({
                "filmId": film_id,
                "name": name,
                "slug": film_slug,
                "year": year,
                "rating": rating,
            })
    return results


def parse_watchlist_page(soup):
    results = []
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

        if film_id and name:
            results.append({
                "filmId": film_id,
                "name": name,
                "slug": film_slug,
                "year": year,
            })
    return results


def scrape_section(session, base_url, parser_fn, label):
    _, soup = fetch_page(session, base_url)
    if not soup:
        print(f"[{label}] Could not load page 1", file=sys.stderr)
        return []

    total_pages = get_num_pages(soup)
    print(f"[{label}] Found {total_pages} pages", file=sys.stderr)

    results = parser_fn(soup)
    print(f"[{label}] Page 1: {len(results)} items", file=sys.stderr)

    if total_pages <= 1:
        return results

    page_urls = [(page, f"{base_url}page/{page}/") for page in range(2, total_pages + 1)]

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fetch_page, session, url): page_num
            for page_num, url in page_urls
        }

        for future in as_completed(futures):
            page_num = futures[future]
            url, soup = future.result()
            if soup:
                page_results = parser_fn(soup)
                results.extend(page_results)
                print(f"[{label}] Page {page_num}: {len(page_results)} items ({len(results)} total)", file=sys.stderr)
            else:
                print(f"[{label}] Page {page_num}: failed after retries", file=sys.stderr)

    return results


def main():
    username = "aidand1214"

    session = cloudscraper.create_scraper()
    session.get("https://letterboxd.com/", headers=HEADERS)

    ratings = scrape_section(
        session,
        f"https://letterboxd.com/{username}/films/",
        parse_films_page,
        "films",
    )

    watchlist = scrape_section(
        session,
        f"https://letterboxd.com/{username}/watchlist/",
        parse_watchlist_page,
        "watchlist",
    )

    print(f"[done] {len(ratings)} ratings, {len(watchlist)} watchlist", file=sys.stderr)
    print(json.dumps({"ratings": ratings, "watchlist": watchlist}))


if __name__ == "__main__":
    main()