# DESIGN.md — Architecture & Decisions

## 1. Data Model

### Two-file split: structure vs. content

**tree.json** owns the folder hierarchy. It contains every node (folder), its Wikipedia URL, its parent/child relationships, its editor assignment, and any metadata that describes *what the folder is*.

**folder JSONs** (`data/folders/{path}.json`) own the video arrays. They contain the results of YouTube API queries for that specific folder — video IDs, titles, channels, GIF URLs, and internal quality scores.

**Why split them:** tree.json is edited rarely (yearly scrape, manual god-mode edits). Folder JSONs are rewritten frequently (weekly cron refreshes). Keeping them separate means a botched cron run can't corrupt the tree structure, and a tree edit can't wipe video data.

### tree.json schema
```json
{
  "categories": {
    "Science": {
      "wiki_url": "https://en.wikipedia.org/wiki/Science",
      "picks_editor": "Marge",
      "level": 1,
      "children": [
        {
          "name": "Physics",
          "path": "Science/Physics",
          "wiki_url": "https://en.wikipedia.org/wiki/Physics",
          "level": 2,
          "children": [...]
        }
      ]
    }
  }
}
```

Every node has: `name`, `path`, `wiki_url`, `level`, `children` (array of sub-node objects). Level 1 nodes additionally have `picks_editor`.

A flat index (`all_paths: ["Science", "Science/Physics", ...]`) is maintained at the top of tree.json so the cron job can find stale folders without traversing the tree.

### folder JSON schema (per-folder)
```json
{
  "path": "Science/Physics",
  "videos": [
    {
      "id": "abc123XYZ",
      "title": "Bell's Theorem and the Limits of Reality",
      "channel": "PBS Space Time",
      "embeddable": true,
      "gif_url": "https://archive.org/...",
      "_score": 42.3
    }
  ],
  "last_updated": "2026-05-15T03:14:00Z"
}
```

`path` is denormalized into each file so the frontend never needs to derive it from the filename.

---

## 2. Video Matching & Quality

### Topic matching

YouTube's Data API returns `topicDetails.topicCategories` — an array of Wikipedia URLs relevant to the video. Coverage is inconsistent (some videos get deep Wikipedia URLs, others get only broad Freebase IDs).

For a folder with wiki URL `https://en.wikipedia.org/wiki/Physics`, a video matches if **any** of its `topicCategories` equals the folder's wiki URL or any ancestor's wiki URL in the tree path (e.g., a video tagged with "Science" matches the "Science/Physics" folder via the ancestor rule).

The ancestor rule means broad-topic videos still populate deep folders — they just get scored lower (see quality gradient below).

### Quality score (broad levels)

```
score = log(viewCount + 1) × (likeCount / max(viewCount, 1)) × min(years_since_published, 8)
```

- Popular but not too old wins.
- Like ratio penalizes high-view low-like videos (clickbait, controversy).
- The `min(age, 8)` cap prevents ancient videos from dominating forever, but doesn't punish anything under 8 years.

### Quality gradient by depth

Quality standards are strictest at the top and relax at each level down. Broad folders are curated entry points. Deep folders are for unfiltered discovery.

| Level | Depth | Score threshold | What gets in |
|-------|-------|----------------|--------------|
| 1 | Broadest (e.g. "Science") | ≥ 10 | Only well-known, high-quality videos |
| 2 | (e.g. "Physics") | ≥ 3 | Broader inclusion, less strict |
| 3 | (e.g. "Quantum Mechanics") | ≥ 1 | Nearly everything that matches the topic |
| 4, 5, 6... | Deepest leaves | None | Every matched video — no filter at all |

The bar drops as you drill down. A physics PhD student browsing "Quantum Decoherence" (level 4+) wants everything that exists, including the 240p lecture with 12 views.

The thresholds (10, 3, 1) are initial guesses — we'll tune them after seeing real data.

### Dedup rule: most specific folder wins

A video matching both "Biology" and "Biology/Genetics" goes into "Biology/Genetics" and does NOT appear in "Biology." During `build_folders.py`, when processing a folder, we check all descendant paths and exclude videos already claimed by a deeper folder.

**Exception:** Editor's Picks folders ignore this rule — they can feature any video from anywhere in their category tree.

---

## 3. GIF Strategy

### Hotlink, don't store

GIFs are referenced by URL from the Internet Archive / GifCities API. The repo stores no GIF files.

- `find_gifs.py` queries GifCities, picks the best result for each folder, writes the URL into the folder's JSON.
- The frontend loads GIFs via `<img src="{url}">` directly from archive.org.
- If a GIF fails to load: broken image icon displays. No fallback. No retry. This is on-brand.

**Why not commit GIFs:** 10,000 folders × 50KB = 500MB minimum just for folder icons, plus video GIFs would push past GitHub's 1GB soft limit. Hotlinking costs nothing and the occasional broken image reinforces the GeoCities-era aesthetic.

---

## 4. Editor System

### Assignment

`scrape_vital_articles.py` randomly assigns one editor from `EDITOR_POOL` to each Level 1 category. The assignment is written to `tree.json` and never re-rolled on subsequent scrapes.

### Picks folder location

`{Category}/{Editor}'s Picks` — e.g., `History/Tony's Picks`. Only Level 1 categories get a Picks folder. It's a normal subfolder in the tree, just populated by a different script (`refresh_picks.py` instead of `build_folders.py`).

### Picks content rule

Picks videos don't need to match the category's Wikipedia URL precisely — they match any descendant topic URL in that category tree. This means "Tony's Picks" in History can feature a video about the French Revolution, Ancient Rome, or any historical subtopic.

---

## 5. Cron Schedule & Quota

### Schedule

| Job | Frequency | Day/Time | Units |
|-----|-----------|----------|-------|
| `build_folders.py` | Weekly | Sunday 03:00 UTC | ~1,500/wk |
| `refresh_picks.py` | Weekly | Sunday 04:00 UTC | ~1,000/wk |
| `find_gifs.py` | Weekly | Sunday 05:00 UTC | — (free API) |

Total: ~2,500 units/week out of 70,000 available (10,000/day). Enormous headroom.

### build_folders weekly target

Process ~50 folders per weekly run. At 10,000 total folders, each folder refreshes roughly twice a year. This is the "evergreen quarterly" cadence — good enough for a library, not a news feed.

Priority: folders that have never been refreshed (no `last_updated`) come first. Then stalest by `last_updated`.

### Initial build

The first run processes folders in breadth-first order: all Level 1 folders, then all Level 2, etc. This means the site is navigable at the top levels immediately, while deeper levels fill in over subsequent weeks.

---

## 6. Frontend Architecture

### Single-page with lazy loading

`index.html` loads once. `app.js` handles all navigation by fetching `/data/folders/{path}.json` on click and rendering the folder contents into the main window.

No router. No URL hashes. The breadcrumb bar is the only navigation state.

### Component tree

```
Desktop (index.html)
  └── Explorer Window
        ├── Title Bar (folder name)
        ├── Menu Bar (File / Edit / View / Help — decorative)
        ├── Address Bar (breadcrumb path, clickable segments)
        └── Contents Pane
              ├── Folder Icons (alphabetical, pixel folder icon + cached GIF peek)
              └── Video Icons (cached GIF, title underneath)
                    └── [on click] → Video Popup Window (Win95 dialog with YouTube embed)
```

### Video popup behavior

- `embeddable: true` → Open a Win95-styled modal with the YouTube iframe.
- `embeddable: false` → Open `https://youtube.com/watch?v={id}` in a new tab.
- Close button in title bar. Clicking outside the popup does nothing (Win95 behavior).

### Loading states

- Fetching a folder JSON: the contents pane shows an hourglass cursor. No spinner, no "loading..." text.
- Fetch error: the pane shows a Win95 error dialog icon and the text "This folder appears to be empty or unavailable." No retry button — user navigates back via breadcrumb.

---

## 7. Error Handling Philosophy

The system is designed to degrade gracefully by default:

- **YouTube API quota exhausted:** `build_folders.py` stops and writes a `_quota_exhausted` flag. Next week's run picks up where it left off.
- **GifCities API down:** `find_gifs.py` writes `gif_url: null`. Frontend shows the default pixel folder icon instead.
- **Wikipedia page structure changed:** `scrape_vital_articles.py` raises a clear error with the unexpected HTML. This script runs manually, not on cron, so a human sees the error.
- **Corrupted JSON file:** `build_folders.py` skips that folder and logs the path. Next run retries it.
- **Network error on frontend fetch:** Shows the "empty or unavailable" message. User navigates back via breadcrumb.

No retry loops. No exponential backoff. No alert modals. The library is a static site — if something breaks, it stays broken until the next cron run fixes it. This is fine.

---

## 8. Known Open Questions

- **Topic matching coverage:** We won't know the real match rate until we run the first queries against the YouTube API. If coverage is too low (<5% of searched videos match), we may need a keyword-based fallback filter.
- **Quality thresholds:** The level-based thresholds (10, 3, 1) are guesses. We'll tune after seeing what real scores look like.
- **GitHub Pages bandwidth:** If the site gets popular, serving JSON files + hotlinked GIFs to thousands of users might hit Pages' soft limits. No action needed for v1; cross that bridge if it comes.
