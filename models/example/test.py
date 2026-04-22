import cloudscraper
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

session = cloudscraper.create_scraper()
session.get("https://letterboxd.com/", headers=HEADERS)

r = session.get("https://letterboxd.com/aidand1214/films/", headers=HEADERS)
soup = BeautifulSoup(r.text, "html.parser")

items = soup.select("li.poster-container, li.griditem")

# Print the raw HTML of the first 2 items
for i, item in enumerate(items[:2]):
    print(f"\n--- Item {i+1} ---")
    print(item.prettify())