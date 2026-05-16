# SPEC.md — The YouTube Library

A static website that presents YouTube as a Windows 95-themed nested file directory. Replaces the algorithmic home feed with intentional, path-based discovery of the world's largest video repository.

---

## Core Principles (non-negotiable)

1. **Path-as-experience.** Users earn what they find by tracing folders. No search bar. No related-videos sidebar. No hopping between niches.
2. **The library catalogs, it does not algorithm.** Videos are sorted alphabetically within folders. View counts drive backend selection but are never displayed.
3. **Win95 file explorer aesthetic.** Pixel folder icons for folders, animated GeoCities-style GIFs as icons for videos. Title shown underneath each icon, Windows-style.
4. **Static architecture, zero hosting cost.** GitHub Pages + GitHub Actions cron + JSON-files-as-database. No backend server. API keys hidden in Actions secrets.
5. **Hand-framed shell, auto-populated guts.** The Win95 UI and editor personas are designed by the human. Tree structure comes from Wikipedia Vital Articles. Folder contents come from YouTube's topic-tagged videos.
6. **Folders first, then videos.** Mixed-content folders at every level. Folders display alphabetically first, then videos alphabetically by title — Windows default.
7. **No artificial caps.** A folder with 47 topically-matched videos shows all 47. A folder with 3 shows 3. Asymmetry is honest data about human creative output.
8. **Restraint at the folder level.** No thumbnails, no view counts, no durations, no like counts in the UI — just folder name, icon, optional one-line description.
9. **Imperfection is on-brand.** Bad GIF matches, occasional miscategorized videos, missing GIFs — all part of the early-internet discovery feel.

---

## Tech Stack

- **Frontend:** Plain HTML/CSS/JS. Use [98.css](https://jdan.github.io/98.css/) for the Win95 chrome.
- **Hosting:** GitHub Pages (free).
- **Compute:** GitHub Actions on cron schedule.
- **Storage:** JSON files committed to the repo. No database.
- **APIs:**
  - YouTube Data API v3 (free tier: 10,000 units/day)
  - GifCities API at the Internet Archive (rate-limited but free)
  - Wikipedia (scrape Vital Articles pages directly, no API needed)
- **Backend language:** Python 3.

---

## Architecture

```
[GitHub Actions Cron]
        |
        v
[Python scripts] ----> [YouTube API + GifCities + Wikipedia]
        |
        v
[JSON files committed to repo]       [GIFs hotlinked from archive.org]
        |
        v
[GitHub Pages serves static site]
        |
        v
[User's browser loads index.html, fetches JSON on navigation]
```

---

## Repo Structure

```
/
├── index.html                  # The Win95 desktop entry point
├── styles.css                  # Win95 theming + custom
├── app.js                      # Folder navigation, lazy JSON loading, embed popup
├── /data/
│   ├── tree.json               # Full folder hierarchy with metadata
│   └── /folders/
│       ├── Science.json
│       ├── Science/Physics.json
│       ├── Science/Physics/Quantum_Mechanics.json
│       └── ... (one file per folder, path-encoded names)
├── /assets/
│   └── /icons/                 # Static Win95 chrome (folder icon, desktop, etc.)
└── /scripts/
    ├── scrape_vital_articles.py   # One-time/yearly: build tree from Wikipedia
    ├── build_folders.py           # Weekly: populate folder video contents
    ├── refresh_picks.py           # Weekly: refresh editor's picks
    └── find_gifs.py               # Weekly: match GIFs to folders via GifCities
```

---

## Data Formats

### `/data/tree.json` — full folder hierarchy

```json
{
  "categories": {
    "Science": {
      "path": "Science",
      "wiki_url": "https://en.wikipedia.org/wiki/Science",
      "picks_editor": "Marge",
      "level": 1,
      "children": [
        {
          "name": "Physics",
          "path": "Science/Physics",
          "wiki_url": "https://en.wikipedia.org/wiki/Physics",
          "level": 2,
          "children": [
            {
              "name": "Quantum Mechanics",
              "path": "Science/Physics/Quantum_Mechanics",
              "wiki_url": "https://en.wikipedia.org/wiki/Quantum_mechanics",
              "level": 3,
              "children": []
            }
          ]
        }
      ]
    }
  },
  "all_paths": [
    "Science",
    "Science/Physics",
    "Science/Physics/Quantum_Mechanics"
  ]
}
```

Every node has `name`, `path`, `wiki_url`, `level`, `children`. Level 1 nodes get `picks_editor`. `all_paths` is a flat index for efficient cron lookup.

### `/data/folders/{path}.json` — per-folder video contents

```json
{
  "path": "Science/Physics/Quantum_Mechanics",
  "videos": [
    {
      "id": "abc123XYZ",
      "title": "Bell's Theorem and the Limits of Reality",
      "channel": "PBS Space Time",
      "embeddable": true,
      "gif_url": "https://web.archive.org/gifcities/abc123XYZ.gif",
      "_score": 42.3
    }
  ],
  "last_updated": "2026-05-15T03:14:00Z"
}
```

`_score` is internal-only, never sent to the frontend (filtered during build). `gif_url` may be `null` if no GIF was found — the frontend falls back to the default folder icon.

---

## Scripts

### 1. `scrape_vital_articles.py` — one-time, re-run yearly (manual)

Scrapes Wikipedia Vital Articles Level 4. Parses H2/H3/H4/H5 section nesting to build the folder tree. Each leaf node maps to a Wikipedia article URL used as the YouTube topic-tag matcher.

On first run, randomly assigns one editor from the name pool to each Level 1 category. On subsequent runs, preserves existing editor assignments and only assigns editors to newly added categories.

Output: `data/tree.json`.

### 2. `build_folders.py` — weekly cron

Reads `data/tree.json`. Processes stale folders (no `last_updated` first, then oldest `last_updated`).

For each folder:
1. Call `youtube.search.list` with the folder's Wikipedia article title as keyword (cost: 100 units).
2. Call `youtube.videos.list` on resulting video IDs to get `topicDetails`, `statistics`, `status.embeddable` (cost: ~1 unit per 50 videos).
3. Filter: keep videos where `topicCategories` overlaps with the folder's wiki URL or any ancestor's wiki URL.
4. Compute quality score: `score = log(viewCount + 1) × (likeCount / max(viewCount, 1)) × min(years_since_published, 8)`
5. Apply quality threshold based on folder level (see Quality Gradient below).
6. Remove videos already claimed by deeper subfolders ("most specific folder wins" rule).
7. Sort by title alphabetically. Write `data/folders/{path}.json`.

Target: ~50 folders per weekly run. Breadth-first ordering: all Level 1 first, then Level 2, etc.

### 3. `refresh_picks.py` — weekly cron

For each Level 1 category's assigned editor, searches YouTube for videos from the last 7 days whose `topicCategories` overlap with any wiki URL in that category's tree. Selects the top 10 by quality score. Writes to `data/folders/{Category}/{Editor}'s Picks.json`.

### 4. `find_gifs.py` — weekly cron (runs after build_folders)

For each folder that was just refreshed and has no `gif_url`:
- Query GifCities API with the folder name as keyword.
- Take the first result. Write its archive.org URL to the folder JSON's `gif_url` field.
- On failure: write `null`, move on.

GIFs are hotlinked from archive.org — never committed to the repo.

---

## Video Matching & Quality

### Quality gradient by folder depth

Quality standards are strictest at the top and relax at each level down. Broad folders are curated entry points. Deep folders are for unfiltered discovery.

| Level | Depth | Score threshold | What gets in |
|-------|-------|----------------|--------------|
| 1 | Broadest (e.g. "Science") | ≥ 10 | Only well-known, high-quality videos |
| 2 | (e.g. "Physics") | ≥ 3 | Broader inclusion, less strict |
| 3 | (e.g. "Quantum Mechanics") | ≥ 1 | Nearly everything that matches the topic |
| 4, 5, 6... | Deepest leaves | None | Every matched video — no filter at all |

Thresholds are initial estimates. Tune after seeing real data.

### Deduplication

A video matching multiple folders goes to the deepest (most specific) matching folder. It does not appear in parent folders. Editor's Picks are exempt — they can feature any video from their category tree.

---

## Editor System

### Name Pool
```
Tony, Shelly, Marge, Floyd, Janice, Phil, Brenda, Carl, Doris, Ramona,
Hank, Vivian, Murray, Lottie, Walt
```

### Assignment
Random, one per Level 1 category, assigned at initial scrape time and persisted in `tree.json`. Re-running the scrape does not re-roll existing assignments.

### Picks Folder
Each Level 1 category gets exactly one `{Editor}'s Picks` subfolder — e.g. `History/Tony's Picks`. Contains the 10 best recent videos from anywhere in that category's tree. Updated weekly.

---

## Cron Schedule

| Job | Frequency | Time (UTC) | YouTube units |
|-----|-----------|------------|---------------|
| `build_folders.py` | Weekly | Sunday 03:00 | ~1,500 |
| `refresh_picks.py` | Weekly | Sunday 04:00 | ~1,000 |
| `find_gifs.py` | Weekly | Sunday 05:00 | — |

Total: ~2,500 units/week against 70,000 available. Enormous headroom.

---

## UI Behavior

### Layout
Single-window Win95 file-explorer view:
- **Title bar:** current folder name.
- **Menu bar:** File / Edit / View / Help (decorative only for v1).
- **Address bar:** breadcrumb path. Each segment is clickable to navigate up.
- **Contents pane:** folder and video icons in a grid.

### Icon display
- **Folder icon:** Pixel folder icon (from assets/icons/), optionally with the folder's GIF as a small overlay or peek. Label underneath in Windows-style text.
- **Video icon:** The video's GIF, displayed at folder-icon size. Title text underneath. No thumbnail, no duration, no view count.
- **Order:** Subfolders first (alphabetical by name), then videos (alphabetical by title).

### Interactions
- **Click folder:** Navigate deeper. Fetch `/data/folders/{path}.json` and re-render the contents pane. Update breadcrumb.
- **Click breadcrumb segment:** Navigate up to that folder.
- **Click video:** Open a Win95-styled popup window with YouTube embed iframe (when `embeddable: true`). Otherwise open `youtube.com/watch?v={id}` in a new tab.
- **No search bar. No autocomplete. No related videos. No comments.**

### Empty / error states
- **Empty folder:** Show an empty contents pane. The library metaphor means empty folders are normal — not everything humans know about has a YouTube video yet.
- **Fetch error:** Show a Win95 error dialog icon and text: "This folder appears to be empty or unavailable."
- **Loading:** Hourglass cursor on the contents pane. No text, no spinner.

---

## API Quota Plan

| Activity | Frequency | Cost |
|----------|-----------|------|
| Picks refresh (all editors) | Weekly | ~1,000 units/wk |
| Folder refresh (~50 folders) | Weekly | ~1,500 units/wk |
| Initial full build | One-time, ~6 months | ~50 folders/wk until complete |

Total: ~2,500 units/week. YouTube free tier: 10,000 units/day (70,000/week). Headroom for 28× scaling.

---

## Phasing

### Phase 1 — MVP (weeks 1-2)
- Scrape Wikipedia Vital Articles Level 3 (~1,000 leaves).
- Build frontend Win95 shell with hardcoded test data.
- Verify end-to-end: tree.json → folder navigation → video embed.

### Phase 2 — Full Build (weeks 3-8)
- Run `build_folders.py` on weekly cron, populate Level 3 folders.
- Add `refresh_picks.py` and editor flavor.
- Add `find_gifs.py` and GifCities integration.

### Phase 3 — Deepening (ongoing)
- Expand tree to Level 4 (~10,000 leaves).
- Add god-mode tree editor (hidden admin route for manual tree editing).
- Tune quality thresholds based on real data.
- Add more specialist editors as desired.

---

## Known Limitations (accepted, not bugs)

- **Small creators** with poorly tagged videos won't be discoverable via topic match. (Future: god-mode manual submission.)
- **YouTube miscategorization** means wrong videos occasionally appear in deep folders. This is part of the discovery vibe.
- **GifCities GIFs** sometimes don't relate to the folder topic. Same — imperfections welcome.
- **Embed-disabled videos** open as YouTube tabs, slightly breaking the "no leaving the library" feel. Trade-off accepted.
- **API quota** is the only real bottleneck. If the project gets popular, apply for a free quota extension.

---

## Tagline

> *The Public Library of YouTube. Walk in. Take your time. Find something on purpose.*
